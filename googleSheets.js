/**
 * googleSheets.js
 * ---------------------------------------------------------------------------
 * Thin client for the Apps Script Web App API. Google Sheets is the only
 * database — every function here either reads the current sheet-backed
 * state or writes a single action, which the server applies to the sheet.
 *
 * Transport notes:
 *  - GET is used for reads (?action=...&...params).
 *  - POST is used for writes. Body is sent as text/plain (NOT
 *    application/json) on purpose: Apps Script Web Apps reject the CORS
 *    preflight for application/json from a foreign origin, but a
 *    text/plain POST is a "simple request" that skips preflight entirely.
 *    The server (Code.gs) parses e.postData.contents as JSON manually.
 * ---------------------------------------------------------------------------
 */

const GoogleSheetsAPI = (() => {
  async function callGet(action, params = {}) {
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`GET ${action} failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
  }

  /**
   * For GET endpoints that return a raw, non-JSON body (currently just
   * exportCsv, which the server sends back as plain CSV text via
   * ContentService — not JSON-wrapped like every other action). Using
   * callGet() here would always fail, since res.json() can't parse CSV.
   */
  async function callGetRaw(action, params = {}) {
    const url = new URL(CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), { method: "GET" });
    if (!res.ok) throw new Error(`GET ${action} failed: ${res.status}`);
    return res.text();
  }

  async function callPost(action, payload = {}) {
    const body = JSON.stringify({ action, ...payload });
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body,
    });
    if (!res.ok) throw new Error(`POST ${action} failed: ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data;
  }

  return {
    /** Full dashboard snapshot: stores, active sessions, config, weather cache. */
    getState: () => callGet("getState"),

    /** Master store list (City, Store Name, Store Code, Lat, Lon). */
    getStores: () => callGet("getStores"),

    /** Weather cache for a given store code (server refreshes this every 5 min). */
    getWeather: (storeCode) => callGet("getWeather", { storeCode }),

    /** Turn Rain Surge ON for a store — creates one row in the sheet. */
    rainOn: (payload) => callPost("rainOn", payload),

    /** Turn Rain Surge OFF for a store — updates the existing open row. */
    rainOff: (payload) => callPost("rainOff", payload),

    /** Manually request the CSV export (mirrors the auto-generated one). */
    exportCsv: () => callGetRaw("exportCsv"),

    /** Server-side log line for an audit/notification event. */
    logEvent: (payload) => callPost("logEvent", payload),

    /** Simple self-declared name/email login — logs access to the Logins sheet. */
    login: (name, email, userAgent) => callPost("login", { name, email, userAgent }),

    /** Recent access log (most recent first), for the "Access Log" panel. */
    getLogins: () => callGet("getLogins"),

    /** Total cost + session count per day (all time, newest first). */
    getDailyReport: () => callGet("getDailyReport"),

    /** Manually (re)send today's per-city report emails — same path midnight uses. */
    sendReportEmail: () => callPost("sendReportEmail", {}),

    /** Resend the report for a SPECIFIC past date (yyyy-MM-dd) — the
     *  recovery path for when the automatic 12:30 AM run was missed. */
    sendReportEmailForDate: (date) => callPost("sendReportEmailForDate", { date }),
  };
})();
