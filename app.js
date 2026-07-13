/**
 * app.js
 * ---------------------------------------------------------------------------
 * Application entry point. Wires together:
 *   - Auth        : simple self-declared name/email login (no Google
 *                   Cloud OAuth setup needed), captures Name + Email and
 *                   auto-fills every write action.
 *   - RainSurge   : ON / OFF / auto-off actions against the sheet.
 *   - Sync loop   : polls GoogleSheetsAPI.getState() every
 *                   CONFIG.POLL_INTERVAL_MS so every connected dashboard
 *                   converges on the same state within ~10-15 seconds,
 *                   and rings the 10-second buzzer if the server reports
 *                   an active store with no rain.
 * ---------------------------------------------------------------------------
 */

// ============================================================== Auth
/**
 * Simple self-declared login: the user types their name and email, which
 * is what gets recorded against every Rain Surge action and written to
 * the Logins sheet server-side (see Sheets.gs::recordLogin_). This trades
 * cryptographic verification (the earlier Google OAuth flow) for zero
 * Google Cloud setup — reasonable for an internal tool used by a known
 * team. If you need to stop someone typing in a colleague's email, the
 * OAuth flow can be restored; ask and it's a small, self-contained change.
 */
const Auth = (() => {
  let user = null; // { name, email }

  function currentUser() {
    return user;
  }

  function requireLogin() {
    if (!user) throw new Error("Not signed in.");
    return user;
  }

  async function submit() {
    const name = document.getElementById("loginName").value.trim();
    const email = document.getElementById("loginEmail").value.trim();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
      Dashboard.notify("danger", "Enter a valid name and email to continue.");
      return;
    }

    user = { name, email };
    try {
      await GoogleSheetsAPI.login(name, email, navigator.userAgent);
    } catch (err) {
      Dashboard.notify("danger", `Could not record login: ${err.message}`);
    }

    document.getElementById("loginOverlay")?.classList.add("d-none");
    document.getElementById("userBadge").textContent = `${name} (${email})`;
    App.start();
  }

  function init() {
    document.getElementById("loginSubmit")?.addEventListener("click", submit);
    document.getElementById("loginEmail")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  return { init, currentUser, requireLogin };
})();

// ========================================================== RainSurge
const RainSurge = (() => {
  async function turnOn(storeCode) {
    try {
      const user = Auth.requireLogin();
      const store = Dashboard.getState().stores.find((s) => s.storeCode === storeCode);
      const categorySel = document.querySelector(`[data-role="category"][data-store="${storeCode}"]`);
      const timerSel = document.querySelector(`[data-role="timer"][data-store="${storeCode}"]`);
      const category = categorySel?.value || "LOW";
      const timerMinutes = timerSel?.value ? Number(timerSel.value) : null;

      await GoogleSheetsAPI.rainOn({
        storeCode,
        storeName: store.storeName,
        city: store.city,
        latitude: store.latitude,
        longitude: store.longitude,
        category,
        rate: CONFIG.RAIN_CATEGORIES[category].rate,
        timerMinutes,
        employeeName: user.name,
        employeeEmail: user.email,
        sessionId: App.sessionId,
        userAgent: navigator.userAgent,
      });

      Dashboard.notify("success", `Rain Surge ON — ${store.storeName}`);
      await App.refresh();
    } catch (err) {
      Dashboard.notify("danger", `Could not turn ON: ${err.message}`);
    }
  }

  async function turnOff(storeCode, remarks = "Manually turned off") {
    try {
      const user = Auth.requireLogin();
      await GoogleSheetsAPI.rainOff({
        storeCode,
        remarks,
        employeeName: user.name,
        employeeEmail: user.email,
      });
      Dashboard.notify("success", `Rain Surge OFF — ${storeCode}`);
      await App.refresh();
    } catch (err) {
      Dashboard.notify("danger", `Could not turn OFF: ${err.message}`);
    }
  }

  /** Called by Timer.js when a timed session's countdown hits zero. */
  async function autoTurnOff(storeCode, reason) {
    await turnOff(storeCode, reason);
  }

  return { turnOn, turnOff, autoTurnOff };
})();

// =============================================================== App
const App = (() => {
  let pollHandle = null;
  const sessionId = `sess_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  let demoModeNotified = false;

  /**
   * Used only when the Apps Script backend isn't reachable yet (e.g.
   * CONFIG.APPS_SCRIPT_URL is still the placeholder, or the deployment
   * URL hasn't been pasted in). Renders your real store list — city,
   * store name/code, lat/long — from the embedded STORE_DATA
   * (storesData.js) so the dashboard is fully previewable in VS Code
   * before Phases 1–7 of the README are finished. No sessions/weather
   * exist yet in this mode since nothing is actually being written to a
   * sheet.
   */
  function buildDemoState() {
    return {
      stores: typeof STORE_DATA !== "undefined" ? STORE_DATA : [],
      sessions: {},
      weather: {},
      rainTrend: [],
      lastWeatherUpdate: "— (demo mode, no backend connected)",
    };
  }

  async function refresh() {
    try {
      const state = await GoogleSheetsAPI.getState();
      Dashboard.setState(state);
      if (state.anyRainStopped) Dashboard.ringBuzzer();
    } catch (err) {
      Dashboard.setState(buildDemoState());
      if (!demoModeNotified) {
        demoModeNotified = true;
        Dashboard.notify(
          "warning",
          "Running in demo mode with local store data — connect CONFIG.APPS_SCRIPT_URL in config.js to enable live sync, Rain Surge actions, and weather."
        );
      }
    }
  }

  function startPolling() {
    stopPolling();
    pollHandle = setInterval(refresh, CONFIG.POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = null;
  }

  async function start() {
    Dashboard.init();
    Charts.init();
    EmailModule.wireUi();
    await refresh();
    startPolling();
  }

  return { start, refresh, sessionId };
})();

// ============================================================ Bootstrap
window.addEventListener("DOMContentLoaded", () => {
  Auth.init();
});
