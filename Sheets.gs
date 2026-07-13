/**
 * Sheets.gs
 * ---------------------------------------------------------------------------
 * All read/write access to the Stores and RainSurgeLog sheets lives here.
 * Google Sheets is the only database — nothing is cached outside of the
 * WeatherCache sheet (handled in Weather.gs).
 *
 * RainSurgeLog row lifecycle (spec section 13):
 *   Rain ON  -> append ONE new row, Status = "ACTIVE"
 *   Rain OFF -> find that store's ACTIVE row and UPDATE it in place,
 *               Status = "COMPLETED"  (never a duplicate row per session)
 * ---------------------------------------------------------------------------
 */

function todayStr_() {
  return Utilities.formatDate(new Date(), CFG.TIMEZONE, "yyyy-MM-dd");
}

// ============================================================== Stores
function getStores() {
  const sh = sheet_(CFG.SHEETS.STORES, CFG.STORE_HEADERS);
  const rows = sh.getDataRange().getValues();
  const [headers, ...data] = rows;
  return data
    .filter((r) => r[0]) // skip blank rows
    .map((r) => ({
      city: r[0],
      storeName: r[1],
      storeCode: String(r[2]),
      latitude: r[3],
      longitude: r[4],
    }));
}

// ======================================================= RainSurgeLog
function logSheet_() {
  return sheet_(CFG.SHEETS.LOG, CFG.LOG_HEADERS);
}

function colIndex_(name) {
  return CFG.LOG_HEADERS.indexOf(name); // 0-based
}

/** Returns {rowNumber, values} for the store's currently ACTIVE row, or null. */
function findActiveRow_(storeCode) {
  const sh = logSheet_();
  const data = sh.getDataRange().getValues();
  const codeCol = colIndex_("StoreCode");
  const statusCol = colIndex_("Status");
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][codeCol]) === String(storeCode) && data[i][statusCol] === "ACTIVE") {
      return { rowNumber: i + 1, values: data[i] };
    }
  }
  return null;
}

/** Rain Surge ON — creates exactly one row. Rejects if already active (no duplicate sessions). */
function rainOn_(p) {
  if (findActiveRow_(p.storeCode)) {
    throw new Error(`${p.storeCode} already has an active Rain Surge session.`);
  }

  const sh = logSheet_();
  const now = new Date();
  const row = new Array(CFG.LOG_HEADERS.length).fill("");

  const set = (name, val) => (row[colIndex_(name)] = val);
  set("Date", todayStr_());
  set("StoreName", p.storeName);
  set("StoreCode", p.storeCode);
  set("City", p.city);
  set("Latitude", p.latitude);
  set("Longitude", p.longitude);
  set("RainCategory", p.category);
  set("Rate", p.rate);
  set("Amount", p.rate); // minimum billed amount; recalculated properly on OFF
  set("Timer", p.timerMinutes ? `${p.timerMinutes} Minutes` : "Manual");
  set("TurnOnTime", now.toISOString());
  set("TurnOffTime", "");
  set("Duration", "");
  set("Remarks", "");
  set("Status", "ACTIVE");
  set("Weather", "");
  set("Rainfall", "");
  set("Temperature", "");
  set("Humidity", "");
  set("Browser", p.userAgent || "");
  set("Device", /Mobi/i.test(p.userAgent || "") ? "Mobile" : "Desktop");
  set("IPAddress", p.ip || "");
  set("SessionID", p.sessionId || "");
  set("EmployeeName", p.employeeName || "");
  set("EmployeeEmail", p.employeeEmail || "");

  sh.appendRow(row);
  logNotification_("Rain Started", `${p.storeName} (${p.storeCode}) — ${p.category}`);
  return { storeCode: p.storeCode, status: "ACTIVE" };
}

/** Rain Surge OFF — updates the store's existing ACTIVE row in place. */
function rainOff_(p) {
  const found = findActiveRow_(p.storeCode);
  if (!found) throw new Error(`${p.storeCode} has no active Rain Surge session.`);

  const sh = logSheet_();
  const now = new Date();
  const turnOnTime = new Date(found.values[colIndex_("TurnOnTime")]);
  const durationMin = Math.max(0, Math.round((now - turnOnTime) / 60000));
  const rate = Number(found.values[colIndex_("Rate")]) || 0;
  const amount = computeAmount_(rate, durationMin);

  const updates = {
    TurnOffTime: now.toISOString(),
    Duration: `${durationMin} min`,
    Amount: amount,
    Remarks: p.remarks || "Manually turned off",
    Status: "COMPLETED",
  };
  Object.entries(updates).forEach(([name, val]) => {
    sh.getRange(found.rowNumber, colIndex_(name) + 1).setValue(val);
  });

  logNotification_("Auto Shutdown / Rain OFF", `${p.storeCode} — ₹${amount} for ${durationMin} min`);
  return { storeCode: p.storeCode, status: "COMPLETED", amount, durationMin };
}

/**
 * Billing rule: flat rate per session, per spec section 7
 * ("Selecting the category should automatically calculate the amount").
 * Kept as its own function so this can later be swapped for a
 * per-hour/pro-rated model without touching call sites.
 */
function computeAmount_(rate, durationMin) {
  return rate;
}

// ================================================================ Logins
function loginsSheet_() {
  return sheet_(CFG.SHEETS.LOGINS, CFG.LOGIN_HEADERS);
}

/** Records a self-declared name/email login. Not cryptographically verified —
 *  see README for the tradeoff versus the earlier Google OAuth flow. */
function recordLogin_(name, email, userAgent) {
  if (!name || !email) throw new Error("Name and email are required to sign in.");
  loginsSheet_().appendRow([name, email, new Date().toISOString(), userAgent || ""]);
  return { name, email };
}

/** Most recent logins first, capped to 200 rows for a fast read. */
function getLogins_() {
  const sh = loginsSheet_();
  const data = sh.getDataRange().getValues().slice(1);
  return data
    .filter((r) => r[0])
    .map(([name, email, timestamp, userAgent]) => ({ name, email, timestamp, userAgent }))
    .reverse()
    .slice(0, 200);
}

// ============================================================== State
/** Aggregated snapshot used by the client's poll loop (GoogleSheetsAPI.getState). */
function buildState_() {
  const stores = getStores();
  const sh = logSheet_();
  const data = sh.getDataRange().getValues();
  const headerRow = data[0];
  const idx = {};
  headerRow.forEach((h, i) => (idx[h] = i));

  const sessions = {}; // storeCode -> active session summary
  const today = todayStr_();
  let trendBuckets = {}; // "HH:00" -> count of sessions active at that hour today

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[idx.Status] !== "ACTIVE") continue;
    const storeCode = String(row[idx.StoreCode]);
    const rate = Number(row[idx.Rate]) || 0;
    const turnOnTime = row[idx.TurnOnTime];
    const durationMin = Math.max(0, Math.round((new Date() - new Date(turnOnTime)) / 60000));

    sessions[storeCode] = {
      storeCode,
      storeName: row[idx.StoreName],
      city: row[idx.City],
      category: row[idx.RainCategory],
      rate,
      amount: computeAmount_(rate, durationMin),
      timerMinutes: /^\d+/.test(row[idx.Timer]) ? parseInt(row[idx.Timer], 10) : null,
      turnOnTime,
      status: "ACTIVE",
      lastUpdated: new Date().toISOString(),
    };
  }

  // Rain trend: count of ACTIVE-at-that-hour sessions today, bucketed by hour.
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[idx.Date] !== today) continue;
    const onHour = new Date(row[idx.TurnOnTime]).getHours();
    const offHour = row[idx.TurnOffTime] ? new Date(row[idx.TurnOffTime]).getHours() : new Date().getHours();
    for (let h = onHour; h <= offHour; h++) {
      const key = `${String(h).padStart(2, "0")}:00`;
      trendBuckets[key] = (trendBuckets[key] || 0) + 1;
    }
  }
  const rainTrend = Object.keys(trendBuckets)
    .sort()
    .map((label) => ({ label, count: trendBuckets[label] }));

  const weatherCache = getWeatherCacheMap_();
  const lastWeatherUpdate = getConfigValue_("__lastWeatherUpdate", "—");
  const anyRainStopped = getConfigValue_("__anyRainStopped", "false") === "true";

  return { stores, sessions, weather: weatherCache, rainTrend, lastWeatherUpdate, anyRainStopped };
}

// ============================================================ Exports
function buildCsv_() {
  const sh = logSheet_();
  const data = sh.getDataRange().getValues();
  return data
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

// ======================================================= Notifications
/** Minimal event log — surfaced to the client as toast notifications on next poll if desired. */
function logNotification_(type, message) {
  console.log(`[${type}] ${message}`); // visible in Apps Script executions log
}

// =========================================================== Midnight
/**
 * Runs on the 12:30 AM trigger (see Config.gs::installTriggers).
 * Turns off every remaining ACTIVE session, then hands off to Email.gs.
 */
function autoShutdownAtMidnight() {
  const sh = logSheet_();
  const data = sh.getDataRange().getValues();
  const idx = {};
  data[0].forEach((h, i) => (idx[h] = i));

  const closed = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][idx.Status] !== "ACTIVE") continue;
    const storeCode = data[i][idx.StoreCode];
    try {
      const result = rainOff_({ storeCode, remarks: "Auto shutdown at 12:30 AM" });
      closed.push(result);
    } catch (err) {
      console.error(`Auto shutdown failed for ${storeCode}: ${err.message}`);
    }
  }

  logNotification_("Auto Shutdown", `${closed.length} store(s) closed at 12:30 AM`);
  sendDailyReportEmail(); // Email.gs — generates CSV + sends per-client emails
  logNotification_("Email Sent", "Daily report dispatched");
}
