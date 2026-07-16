/**
 * dashboard.js
 * ---------------------------------------------------------------------------
 * Owns all DOM rendering: summary cards, dropdowns, store cards, search,
 * filters, the active-store list/scroll-to, notifications, and CSV export.
 * State is always whatever came back from the last GoogleSheetsAPI.getState()
 * call in app.js — this module never invents state of its own.
 * ---------------------------------------------------------------------------
 */

const Dashboard = (() => {
  let state = { stores: [], sessions: {}, weather: {} };
  let filters = { city: "ALL", status: "ALL", category: "ALL", rainStatus: "ALL", search: "" };

  // ---------------------------------------------------------------- utils
  function money(n) {
    return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  }

  function statusOf(storeCode) {
    return state.sessions[storeCode]?.status === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  }

  function notify(level, message) {
    const wrap = document.getElementById("notificationArea");
    if (!wrap) return;
    const toastId = `t${Date.now()}${Math.random().toString(16).slice(2)}`;
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${level} border-0 show mb-2`;
    el.id = toastId;
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>`;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 8000);
  }

  // ---------------------------------------------------------------- buzzer
  let buzzerAudio = null;
  let buzzerTimeout = null;
  function getBuzzerAudio() {
    if (!buzzerAudio) buzzerAudio = new Audio(CONFIG.ALERT_SOUND_URL);
    return buzzerAudio;
  }
  /** Rings for exactly CONFIG.BUZZER_DURATION_MS (10s), then stops — not a
   *  continuous loop. Called automatically when the server reports an
   *  active store with no rain, and manually via each card's 🔔 button. */
  function ringBuzzer(durationMs = CONFIG.BUZZER_DURATION_MS) {
    const audio = getBuzzerAudio();
    audio.currentTime = 0;
    audio.loop = true;
    audio.play().catch(() => {});
    clearTimeout(buzzerTimeout);
    buzzerTimeout = setTimeout(() => audio.pause(), durationMs);
  }

  // ------------------------------------------------------------- theme
  function wireTheme() {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const html = document.documentElement;
      const next = html.dataset.theme === "light" ? "dark" : "light";
      html.dataset.theme = next;
      btn.textContent = next === "light" ? "☀️" : "🌙";
    });
  }

  // -------------------------------------------------------- daily report
  async function loadDailyReport() {
    try {
      const rows = await GoogleSheetsAPI.getDailyReport();
      const body = document.getElementById("dailyReportBody");
      if (!body) return;
      body.innerHTML = rows.length
        ? rows
            .map(
              (r) => `
              <tr>
                <td class="ps-3">${r.date}</td>
                <td class="text-center">${r.sessionCount}</td>
                <td class="text-end pe-3">${money(r.totalCost)}</td>
              </tr>`
            )
            .join("")
        : `<tr><td colspan="3" class="text-center text-muted p-3">No sessions recorded yet.</td></tr>`;
    } catch (err) {
      notify("danger", `Could not load daily report: ${err.message}`);
    }
  }

  // -------------------------------------------------------- access log
  async function loadAccessLog() {
    try {
      const logins = await GoogleSheetsAPI.getLogins();
      const list = document.getElementById("accessLogList");
      if (!list) return;
      list.innerHTML = logins.length
        ? logins
            .map(
              (l) =>
                `<div class="oc-item" style="padding:.7rem 1rem;border-bottom:1px solid var(--border)">
                   <b>${l.name}</b><br/><span class="text-muted">${l.email}</span><br/>
                   <span class="text-muted small">${new Date(l.timestamp).toLocaleString("en-IN")}</span>
                 </div>`
            )
            .join("")
        : `<div class="p-3 text-muted small">No logins recorded yet.</div>`;
    } catch (err) {
      notify("danger", `Could not load access log: ${err.message}`);
    }
  }

  // ---------------------------------------------------------- top cards
  function renderSummary() {
    const total = state.stores.length;
    const activeSessions = Object.values(state.sessions).filter((s) => s.status === "ACTIVE");
    const active = activeSessions.length;
    const inactive = total - active;
    const byCategory = { LOW: 0, MEDIUM: 0, HEAVY: 0 };
    let runningCost = 0;

    activeSessions.forEach((s) => {
      if (byCategory[s.category] !== undefined) byCategory[s.category]++;
      runningCost += Number(s.amount || CONFIG.RAIN_CATEGORIES[s.category]?.rate || 0);
    });

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set("cardTotalStores", total);
    set("cardActiveStores", active);
    set("cardInactiveStores", inactive);
    set("cardLowRain", byCategory.LOW);
    set("cardMediumRain", byCategory.MEDIUM);
    set("cardHeavyRain", byCategory.HEAVY);
    set("cardRunningCost", money(runningCost));
    set("cardLastWeatherUpdate", state.lastWeatherUpdate || "—");

    Charts.update({
      active,
      inactive,
      cityCost: cityCostBreakdown(activeSessions),
      trend: state.rainTrend || [],
    });

    renderActiveList(activeSessions);
  }

  function cityCostBreakdown(activeSessions) {
    const byCity = {};
    activeSessions.forEach((s) => {
      byCity[s.city] = (byCity[s.city] || 0) + Number(s.amount || 0);
    });
    return byCity;
  }

  function tickClock() {
    const now = new Date();
    const opts = { timeZone: CONFIG.TIMEZONE };
    document.getElementById("cardCurrentTime").textContent = now.toLocaleTimeString("en-IN", {
      ...opts,
      hour12: true,
    });
    document.getElementById("cardCurrentDate").textContent = now.toLocaleDateString("en-IN", {
      ...opts,
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  // ------------------------------------------------------------ dropdowns
  function renderCityDropdown() {
    const cities = [...new Set(state.stores.map((s) => s.city))].sort();

    const sel = document.getElementById("citySelect");
    if (sel) {
      sel.innerHTML =
        `<option value="">Select City</option>` +
        cities.map((c) => `<option value="${c}">${c}</option>`).join("");
    }

    const filterSel = document.getElementById("filterCity");
    if (filterSel) {
      const previous = filterSel.value || "ALL";
      filterSel.innerHTML =
        `<option value="ALL">Filter: All Cities</option>` +
        cities.map((c) => `<option value="${c}">${c}</option>`).join("");
      filterSel.value = cities.includes(previous) ? previous : "ALL";
    }
  }

  function renderStoreDropdown(city) {
    const sel = document.getElementById("storeSelect");
    if (!sel) return;
    const stores = state.stores.filter((s) => s.city === city);
    sel.innerHTML =
      `<option value="">Select Store</option>` +
      stores
        .map(
          (s) =>
            `<option value="${s.storeCode}">${s.storeName} (${s.storeCode}) — ${s.latitude}, ${s.longitude}</option>`
        )
        .join("");
  }

  // -------------------------------------------------------------- filters
  function filteredStores() {
    return state.stores.filter((s) => {
      if (filters.city !== "ALL" && s.city !== filters.city) return false;
      const status = statusOf(s.storeCode);
      if (filters.status !== "ALL" && status !== filters.status) return false;
      const session = state.sessions[s.storeCode];
      if (filters.category !== "ALL" && session?.category !== filters.category) return false;
      if (filters.rainStatus !== "ALL") {
        const isRaining = (state.weather[s.storeCode]?.rainfall ?? 0) > 0;
        if (filters.rainStatus === "RAINING" && !isRaining) return false;
        if (filters.rainStatus === "NOT_RAINING" && isRaining) return false;
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${s.storeName} ${s.storeCode} ${s.city}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  // ----------------------------------------------------------- store cards
  function storeCardHtml(store) {
    const session = state.sessions[store.storeCode];
    const w = Weather.format(state.weather[store.storeCode]);
    const isActive = session?.status === "ACTIVE";
    const category = session?.category || "";
    const rate = CONFIG.RAIN_CATEGORIES[category]?.rate ?? "";

    return `
    <div class="col-12 col-md-6 col-xl-4 store-card-col" data-store-code="${store.storeCode}">
      <div class="card store-card h-100 ${isActive ? "border-active" : ""}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h6 class="mb-0">${store.storeName}</h6>
              <small class="text-muted">${store.storeCode} · ${store.city}</small>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button class="btn btn-sm btn-outline-secondary py-0 px-2" data-action="buzz" data-store="${store.storeCode}" title="Ring buzzer for 10 seconds">🔔</button>
              <span class="badge ${isActive ? "bg-success" : "bg-secondary"}">${isActive ? "ACTIVE" : "INACTIVE"}</span>
            </div>
          </div>

          <div class="weather-row mt-2">
            ${
              w
                ? `<span>${w.icon} ${w.condition}</span><span>${w.temperature}</span>
                   <span>💧${w.rainfall}</span><span>💦${w.humidity}</span><span>🌬️${w.windSpeed}</span>`
                : `<span class="text-muted">Weather pending…</span>`
            }
          </div>
          ${w?.forecastNote ? `<div class="forecast-note${/⚠️|🌤️/.test(w.forecastNote) ? " forecast-note--alert" : ""}">${w.forecastNote}</div>` : ""}
          <div class="coords text-muted small">Lat ${store.latitude}, Lon ${store.longitude}</div>

          <hr/>

          ${
            isActive
              ? `
            <div class="d-flex justify-content-between small mb-1">
              <span>${CONFIG.RAIN_CATEGORIES[category]?.label ?? category}</span>
              <span>Rate ${money(rate)}</span>
            </div>
            <div class="timer-display" data-timer-for="${store.storeCode}">—</div>
            <div class="small text-muted">On: ${new Date(session.turnOnTime).toLocaleTimeString("en-IN")}</div>
            <div class="small mb-2">Current Cost: <strong>${money(session.amount)}</strong></div>
            <button class="btn btn-danger btn-sm w-100" data-action="rainOff" data-store="${store.storeCode}">Rain Surge OFF</button>
          `
              : `
            <div class="row g-2 mb-2">
              <div class="col-6">
                <select class="form-select form-select-sm" data-role="category" data-store="${store.storeCode}">
                  ${Object.entries(CONFIG.RAIN_CATEGORIES)
                    .map(([k, v]) => `<option value="${k}">${v.label} (${money(v.rate)})</option>`)
                    .join("")}
                </select>
              </div>
              <div class="col-6">
                <select class="form-select form-select-sm" data-role="timer" data-store="${store.storeCode}">
                  ${CONFIG.TIMER_OPTIONS.map((t) => `<option value="${t.minutes ?? ""}">${t.label}</option>`).join("")}
                </select>
              </div>
            </div>
            <button class="btn btn-primary btn-sm w-100" data-action="rainOn" data-store="${store.storeCode}">Rain Surge ON</button>
          `
          }
          <div class="text-muted small mt-2">Last Updated: ${session?.lastUpdated ? new Date(session.lastUpdated).toLocaleTimeString("en-IN") : "—"}</div>
        </div>
      </div>
    </div>`;
  }

  function renderStoreCards() {
    const grid = document.getElementById("storeCardGrid");
    if (!grid) return;
    const list = filteredStores();
    grid.innerHTML = list.length
      ? list.map(storeCardHtml).join("")
      : `<div class="col-12 text-center text-muted py-5">No stores match the current filters.</div>`;

    list.forEach((store) => {
      const session = state.sessions[store.storeCode];
      if (session?.status === "ACTIVE") {
        Timer.start({ ...session, storeCode: store.storeCode });
        Weather.checkRainStopped({ ...store, status: "ACTIVE" }, state.weather[store.storeCode]);
      } else {
        Timer.stop(store.storeCode);
      }
    });
  }

  // -------------------------------------------------------- drilldowns
  /** Shared panel every clickable summary card opens into — just needs a
   *  title and a flat list of {storeCode, storeName, city, meta?}. */
  function showMetricDrilldown(title, items) {
    document.getElementById("metricDrilldownTitle").textContent = title;
    const list = document.getElementById("metricDrilldownList");
    list.innerHTML = items.length
      ? items
          .map(
            (it) => `
        <button class="list-group-item list-group-item-action" data-scroll-to="${it.storeCode}">
          <div class="d-flex justify-content-between align-items-center">
            <span>${it.storeName} (${it.storeCode}) — ${it.city}</span>
            ${it.meta ? `<span class="text-muted small ms-2">${it.meta}</span>` : ""}
          </div>
        </button>`
          )
          .join("")
      : `<div class="p-3 text-muted small">Nothing to show right now.</div>`;
    new bootstrap.Offcanvas(document.getElementById("metricDrilldownOffcanvas")).show();
  }

  function topRainiestStores(limit = 10) {
    return [...state.stores]
      .map((s) => ({ ...s, rainfall: state.weather[s.storeCode]?.rainfall ?? 0 }))
      .sort((a, b) => b.rainfall - a.rainfall)
      .slice(0, limit)
      .map((s) => ({ storeCode: s.storeCode, storeName: s.storeName, city: s.city, meta: `${s.rainfall.toFixed(1)} mm` }));
  }

  function storesByStatus(target) {
    return state.stores
      .filter((s) => statusOf(s.storeCode) === target)
      .map((s) => ({ storeCode: s.storeCode, storeName: s.storeName, city: s.city }));
  }

  function storesByCategory(category) {
    return Object.values(state.sessions)
      .filter((s) => s.category === category)
      .map((s) => ({ storeCode: s.storeCode, storeName: s.storeName, city: s.city, meta: money(s.amount) }));
  }

  function storesByCostDesc() {
    return Object.values(state.sessions)
      .slice()
      .sort((a, b) => b.amount - a.amount)
      .map((s) => ({ storeCode: s.storeCode, storeName: s.storeName, city: s.city, meta: money(s.amount) }));
  }

  function storesByFreshness(limit = 10) {
    return [...state.stores]
      .filter((s) => state.weather[s.storeCode]?.lastUpdated)
      .sort((a, b) => new Date(state.weather[b.storeCode].lastUpdated) - new Date(state.weather[a.storeCode].lastUpdated))
      .slice(0, limit)
      .map((s) => ({
        storeCode: s.storeCode,
        storeName: s.storeName,
        city: s.city,
        meta: new Date(state.weather[s.storeCode].lastUpdated).toLocaleTimeString("en-IN"),
      }));
  }

  function renderActiveList(activeSessions) {
    const list = document.getElementById("activeStoreList");
    const countBtn = document.getElementById("activeStoreCountBtn");
    if (countBtn) countBtn.textContent = `${activeSessions.length} Active Stores`;
    if (!list) return;
    list.innerHTML = activeSessions
      .map(
        (s) =>
          `<button class="list-group-item list-group-item-action" data-scroll-to="${s.storeCode}">
             ${s.storeName} (${s.storeCode}) — ${s.city}
           </button>`
      )
      .join("");
  }

  function scrollToStore(storeCode) {
    filters = { city: "ALL", status: "ALL", category: "ALL", rainStatus: "ALL", search: "" };
    document.getElementById("searchInput").value = "";
    const setSel = (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "ALL";
    };
    setSel("filterStatus");
    setSel("filterCategory");
    setSel("filterRainStatus");
    renderStoreCards();
    const target = document.querySelector(`[data-store-code="${storeCode}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.classList.add("flash-highlight");
    setTimeout(() => target?.classList.remove("flash-highlight"), 2000);
  }

  // -------------------------------------------------------------- exports
  async function downloadCsv() {
    try {
      const csv = await GoogleSheetsAPI.exportCsv();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `RainSurge_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      notify("success", "CSV Generated");
    } catch (err) {
      notify("danger", `CSV export failed: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------- wiring
  function wireStaticUi() {
    document.getElementById("cardBoxTotal")?.addEventListener("click", () =>
      showMetricDrilldown("Top 10 Stores by Rainfall", topRainiestStores(10))
    );
    document.getElementById("cardBoxActive")?.addEventListener("click", () =>
      document.getElementById("activeStoreCountBtn")?.click()
    );
    document.getElementById("cardBoxInactive")?.addEventListener("click", () =>
      showMetricDrilldown("Inactive Stores", storesByStatus("INACTIVE"))
    );
    document.getElementById("cardBoxLow")?.addEventListener("click", () =>
      showMetricDrilldown("Low Rain Stores", storesByCategory("LOW"))
    );
    document.getElementById("cardBoxMedium")?.addEventListener("click", () =>
      showMetricDrilldown("Medium Rain Stores", storesByCategory("MEDIUM"))
    );
    document.getElementById("cardBoxHeavy")?.addEventListener("click", () =>
      showMetricDrilldown("Heavy Rain Stores", storesByCategory("HEAVY"))
    );
    document.getElementById("cardBoxCost")?.addEventListener("click", () =>
      showMetricDrilldown("Cost Breakdown — Active Stores", storesByCostDesc())
    );
    document.getElementById("cardBoxWeather")?.addEventListener("click", () =>
      showMetricDrilldown("Most Recently Updated Weather", storesByFreshness(10))
    );
    document.getElementById("metricDrilldownList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-scroll-to]");
      if (!btn) return;
      scrollToStore(btn.dataset.scrollTo);
      bootstrap.Offcanvas.getInstance(document.getElementById("metricDrilldownOffcanvas"))?.hide();
    });

    document.getElementById("citySelect")?.addEventListener("change", (e) => {
      renderStoreDropdown(e.target.value);
    });

    document.getElementById("filterCity")?.addEventListener("change", (e) => {
      filters.city = e.target.value || "ALL";
      renderStoreCards();
    });
    document.getElementById("filterStatus")?.addEventListener("change", (e) => {
      filters.status = e.target.value || "ALL";
      renderStoreCards();
    });
    document.getElementById("filterCategory")?.addEventListener("change", (e) => {
      filters.category = e.target.value || "ALL";
      renderStoreCards();
    });
    document.getElementById("filterRainStatus")?.addEventListener("change", (e) => {
      filters.rainStatus = e.target.value || "ALL";
      renderStoreCards();
    });
    document.getElementById("searchInput")?.addEventListener("input", (e) => {
      filters.search = e.target.value.trim();
      renderStoreCards();
    });

    document.getElementById("activeStoreCountBtn")?.addEventListener("click", () => {
      new bootstrap.Offcanvas(document.getElementById("activeStoreOffcanvas")).show();
    });
    document.getElementById("activeStoreList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-scroll-to]");
      if (btn) scrollToStore(btn.dataset.scrollTo);
    });

    document.getElementById("btnDownloadCsv")?.addEventListener("click", downloadCsv);

    // Delegated card actions (grid re-renders often, so listen on the parent).
    document.getElementById("storeCardGrid")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const storeCode = btn.dataset.store;
      if (btn.dataset.action === "rainOn") RainSurge.turnOn(storeCode);
      if (btn.dataset.action === "rainOff") RainSurge.turnOff(storeCode);
      if (btn.dataset.action === "buzz") {
        ringBuzzer();
        notify("warning", `Buzzer manually triggered for ${storeCode} — ringing 10 seconds.`);
      }
    });

    wireTheme();

    document.getElementById("btnAccessLog")?.addEventListener("click", () => {
      loadAccessLog();
      new bootstrap.Offcanvas(document.getElementById("accessLogOffcanvas")).show();
    });

    document.getElementById("btnDailyReport")?.addEventListener("click", () => {
      loadDailyReport();
      new bootstrap.Offcanvas(document.getElementById("dailyReportOffcanvas")).show();
    });
  }

  function setState(newState) {
    state = newState;
    renderSummary();
    renderCityDropdown();
    renderStoreCards();
  }

  function getState() {
    return state;
  }

  function init() {
    wireStaticUi();
    tickClock();
    setInterval(tickClock, CONFIG.CLOCK_TICK_MS);
  }

  return { init, setState, getState, notify, renderStoreDropdown, ringBuzzer };
})();
