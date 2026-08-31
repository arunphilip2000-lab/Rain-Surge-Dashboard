/**
 * config.js
 * ---------------------------------------------------------------------------
 * Central configuration for the Rain Surge Dashboard front-end.
 * Edit the values in this file only — no other file should hard-code
 * URLs, keys, rates, or timing constants.
 * ---------------------------------------------------------------------------
 */

const CONFIG = {
  // -------------------------------------------------------------------
  // 1. Apps Script Web App — deploy appscript/Code.gs as a Web App
  //    (Execute as: Me · Who has access: Anyone) and paste the URL here.
  // -------------------------------------------------------------------
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbz-c7kPTaQTt-ipPu0-uAGw6nEjkXGczUVUQ8wN83Oc9FtAvk7LubffZyfi9DFFQNY/exec",

  // -------------------------------------------------------------------
  // 2. Login no longer requires Google Cloud OAuth setup — see app.js's
  //    Auth module. Every login is a self-declared name/email, logged to
  //    the Logins sheet server-side. (If you want the earlier, stronger
  //    Google Sign-In flow back, ask — it's straightforward to restore.)
  // -------------------------------------------------------------------

  // -------------------------------------------------------------------
  // 3. Operating window (IST). Dashboard is fully functional only
  //    inside this window; outside it, write actions are disabled
  //    client-side (server also enforces this independently).
  // -------------------------------------------------------------------
  OPERATING_START: "06:00",
  OPERATING_END: "00:30", // 12:30 AM next day — auto shutdown time
  TIMEZONE: "Asia/Kolkata",

  // -------------------------------------------------------------------
  // 4. Sync / polling / refresh intervals (ms)
  // -------------------------------------------------------------------
  POLL_INTERVAL_MS: 12000, // 12s — team-wide state sync (10-15s window)
  WEATHER_REFRESH_MS: 2 * 60 * 1000, // 2 minutes — mirrors CFG.WEATHER_REFRESH_MINUTES in Config.gs
  CLOCK_TICK_MS: 1000, // top-bar clock / countdown timers
  BUZZER_DURATION_MS: 10000, // 10 seconds — see dashboard.js::ringBuzzer

  // -------------------------------------------------------------------
  // 5. Rain categories & billing rates (₹ per session)
  // -------------------------------------------------------------------
  RAIN_CATEGORIES: {
    LOW: { label: "Low Rain", rate: 15 },
    MEDIUM: { label: "Medium Rain", rate: 20 },
    HEAVY: { label: "Heavy Rain", rate: 30 },
  },

  // -------------------------------------------------------------------
  // 6. Timer presets (minutes). "MANUAL" has no auto-expiry — only the
  //    OFF button or the midnight auto-shutdown will stop it.
  // -------------------------------------------------------------------
  TIMER_OPTIONS: [
    { label: "15 Minutes", minutes: 15 },
    { label: "30 Minutes", minutes: 30 },
    { label: "60 Minutes", minutes: 60 },
    { label: "Manual", minutes: null },
  ],

  // -------------------------------------------------------------------
  // 7. Misc
  // -------------------------------------------------------------------
  ALERT_SOUND_URL: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg",
  APP_NAME: "Rain Surge Dashboard",
};

// Freeze so no module accidentally mutates shared config at runtime.
Object.freeze(CONFIG);
Object.freeze(CONFIG.RAIN_CATEGORIES);
