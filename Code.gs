/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * The Web App entry point. Deploy this project as a Web App
 * (Deploy > New deployment > Web app · Execute as: Me · Access: Anyone)
 * and put the resulting /exec URL into config.js -> CONFIG.APPS_SCRIPT_URL.
 *
 * Every request carries an `action` and is routed below. Reads use GET,
 * writes use POST (see googleSheets.js for the exact transport contract).
 * ---------------------------------------------------------------------------
 */

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify({ data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError_(err) {
  const message = err && err.message ? err.message : String(err);
  console.error(message);
  return ContentService.createTextOutput(JSON.stringify({ error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    switch (action) {
      case "getState":
        return json_(buildState_());
      case "getStores":
        return json_(getStores());
      case "getWeather":
        return json_(getWeatherForStore_(e.parameter.storeCode));
      case "getLogins":
        return json_(getLogins_());
      case "exportCsv":
        // Returned as JSON-wrapped text so the client can build a Blob directly.
        return ContentService.createTextOutput(buildCsv_()).setMimeType(ContentService.MimeType.CSV);
      default:
        throw new Error(`Unknown GET action: ${action}`);
    }
  } catch (err) {
    return jsonError_(err);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action } = body;
    switch (action) {
      case "rainOn":
        return json_(rainOn_(body));
      case "rainOff":
        return json_(rainOff_(body));
      case "logEvent":
        logNotification_(body.type || "EVENT", JSON.stringify(body));
        return json_({ ok: true });
      case "login":
        return json_(recordLogin_(body.name, body.email, body.userAgent));
      case "sendReportEmail":
        sendDailyReportEmail();
        return json_({ ok: true });
      default:
        throw new Error(`Unknown POST action: ${action}`);
    }
  } catch (err) {
    return jsonError_(err);
  }
}

/**
 * NOTE ON LOGIN: this project previously verified a Google Identity
 * Services id_token server-side (full OAuth). That required a Google
 * Cloud OAuth client + consent screen, which was significant setup for
 * limited benefit on an internal tool. It's been replaced with a simple
 * self-declared name/email login (see recordLogin_ in Sheets.gs) — every
 * access is still logged to the Logins sheet with a timestamp, it's just
 * not cryptographically verified. If you need to prevent someone typing
 * in a colleague's email, the OAuth flow can be restored — ask and it can
 * be added back alongside this simpler option.
 */
