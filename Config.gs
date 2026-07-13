/**
 * Config.gs
 * ---------------------------------------------------------------------------
 * Single source of truth for sheet names, column layout, rates, and
 * one-time environment setup. Run `setupProject()` once from the Apps
 * Script editor after pasting your Spreadsheet ID and API keys — see
 * README.md for the full walkthrough.
 * ---------------------------------------------------------------------------
 */

const CFG = {
  // Paste the Google Sheet ID (the long string in the sheet's URL) here,
  // OR leave blank and bind this script to the sheet via
  // Extensions > Apps Script from inside the Sheet itself.
  SPREADSHEET_ID: "",

  SHEETS: {
    STORES: "Stores",
    LOG: "RainSurgeLog",
    WEATHER_CACHE: "WeatherCache",
    CONFIG: "Config",
    LOGINS: "Logins",
  },

  STORE_HEADERS: ["City", "StoreName", "StoreCode", "Latitude", "Longitude"],

  LOGIN_HEADERS: ["Name", "Email", "Timestamp", "UserAgent"],

  // Order here is the exact Google Sheet / CSV column order (spec section 13).
  LOG_HEADERS: [
    "Date", "StoreName", "StoreCode", "City", "Latitude", "Longitude",
    "RainCategory", "Rate", "Amount", "Timer",
    "TurnOnTime", "TurnOffTime", "Duration",
    "Remarks", "Status",
    "Weather", "Rainfall", "Temperature", "Humidity",
    "Browser", "Device", "IPAddress", "SessionID",
    "EmployeeName", "EmployeeEmail",
  ],

  WEATHER_HEADERS: [
    "StoreCode", "City", "Condition", "Temperature", "Humidity",
    "Rainfall", "WindSpeed", "CloudCover", "LastUpdated",
  ],

  CONFIG_HEADERS: ["Key", "Value"],

  RATES: { LOW: 15, MEDIUM: 20, HEAVY: 30 },

  TIMEZONE: "Asia/Kolkata",
  AUTO_SHUTDOWN_HOUR: 0,     // 12:30 AM
  AUTO_SHUTDOWN_MINUTE: 30,

  WEATHER_REFRESH_MINUTES: 2, // logical cadence — see installTriggers() for how this is actually achieved

  BUZZER_DURATION_MS: 10000, // 10 seconds

  // "WEATHERAPI" or "OPENWEATHER" — see Weather.gs
  WEATHER_PROVIDER: "WEATHERAPI",
};

function ss_() {
  return CFG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CFG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, headers) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Script Properties helpers — used for secrets (API keys), never sheet cells. */
function getProp_(key, fallback) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  return v === null ? fallback : v;
}
function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * One-time setup. Run manually from the Apps Script editor
 * (select this function in the toolbar dropdown, then click Run).
 */
function setupProject() {
  sheet_(CFG.SHEETS.STORES, CFG.STORE_HEADERS);
  sheet_(CFG.SHEETS.LOG, CFG.LOG_HEADERS);
  sheet_(CFG.SHEETS.WEATHER_CACHE, CFG.WEATHER_HEADERS);
  sheet_(CFG.SHEETS.LOGINS, CFG.LOGIN_HEADERS);
  const configSheet = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS);

  // Seed default editable config rows (safe to edit later in the sheet).
  const existing = configSheet.getDataRange().getValues().map((r) => r[0]);
  const seed = [
    ["ClientReportEmails", "team-lead-1@example.com,team-lead-2@example.com"],
    ["CompanyName", "Your Company"],
    ["SenderName", "Rain Surge Ops Team"],
    ["SenderTitle", "Operations"],
  ];
  seed.forEach(([k, v]) => {
    if (!existing.includes(k)) configSheet.appendRow([k, v]);
  });

  installTriggers();
  SpreadsheetApp.getUi()?.alert(
    "Setup complete. Now set your Weather API key with setWeatherApiKey(\"...\") " +
      "from the Apps Script editor's Execution log / a one-off function run."
  );
}

/** Run once: setWeatherApiKey("your-real-key") from the editor, then delete the call. */
function setWeatherApiKey(key) {
  setProp_("WEATHER_API_KEY", key);
}

function installTriggers() {
  // Clear any pre-existing triggers for these handlers to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach((t) => {
    const fn = t.getHandlerFunction();
    if (["autoShutdownAtMidnight", "refreshWeatherForActiveStores"].includes(fn)) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // 12:30 AM every day — hard server-side auto shutdown (spec section 9).
  ScriptApp.newTrigger("autoShutdownAtMidnight")
    .timeBased()
    .atHour(CFG.AUTO_SHUTDOWN_HOUR)
    .nearMinute(CFG.AUTO_SHUTDOWN_MINUTE)
    .everyDays(1)
    .inTimezone(CFG.TIMEZONE)
    .create();

  // Every 5 minutes — refresh cached weather for stores with an active session.
  //
  // NOTE ON THE 2-MINUTE REQUIREMENT: Apps Script's ClockTriggerBuilder only
  // accepts everyMinutes(1|5|10|15|30) — 2 is not a valid step and Google
  // will reject it at trigger-creation time. To still get an accurate
  // 2-minute cadence, this installs the trigger at the finest allowed grain
  // (every 1 minute) and refreshWeatherForActiveStores() itself checks a
  // last-refresh timestamp in Script Properties and skips the actual API
  // calls unless >= CFG.WEATHER_REFRESH_MINUTES have really elapsed. Net
  // effect: weather still only updates every 2 minutes, it's just checked
  // (cheaply, no external call) once a minute.
  ScriptApp.newTrigger("refreshWeatherForActiveStores")
    .timeBased()
    .everyMinutes(1)
    .create();
}

function getConfigValue_(key, fallback) {
  const rows = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS).getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === key) return rows[i][1];
  }
  return fallback;
}

/**
 * Run this ONCE, AFTER you've pasted your store list into the Stores tab
 * (Phase 3) — it reads every distinct City from Stores and adds one
 * `Recipients_{City}` row to the Config tab for each (skips any that
 * already exist, so it's safe to re-run later if you add a new city).
 *
 * Each row starts blank — fill in that city's own recipient email(s),
 * comma-separated, e.g. Recipients_Mumbai -> mumbai.lead@company.com.
 * A city left blank falls back to the shared ClientReportEmails list
 * (see Email.gs::recipientListForCity_) rather than being skipped, so
 * nothing breaks if you haven't filled every row in yet — but it also
 * means a blank row will NOT correctly isolate that city's email to only
 * that city's client until you fill it in.
 */
function seedCityRecipients() {
  const stores = getStores();
  const cities = [...new Set(stores.map((s) => s.city))].filter(Boolean).sort();
  if (cities.length === 0) {
    throw new Error("Stores tab is empty — load your store list (Phase 3) before running this.");
  }

  const configSheet = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS);
  const existingKeys = configSheet.getDataRange().getValues().map((r) => r[0]);

  let added = 0;
  cities.forEach((city) => {
    const key = `Recipients_${city}`;
    if (!existingKeys.includes(key)) {
      configSheet.appendRow([key, ""]);
      added++;
    }
  });

  console.log(`Added ${added} new Recipients_{City} row(s) for: ${cities.join(", ")}.`);
  SpreadsheetApp.getUi()?.alert(
    `Added ${added} recipient row(s) — one per city (${cities.join(", ")}). ` +
      `Go to the Config tab and fill in each city's email(s).`
  );
}
