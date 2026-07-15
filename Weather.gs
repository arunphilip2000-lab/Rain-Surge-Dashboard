/**
 * Weather.gs
 * ---------------------------------------------------------------------------
 * Fetches live weather by Latitude/Longitude and caches it into the
 * WeatherCache sheet. The API key never reaches the browser — only this
 * server-side function calls out to the provider.
 *
 * CFG.WEATHER_PROVIDER selects between:
 *   "WEATHERAPI"  -> https://www.weatherapi.com/  (current.json)
 *   "OPENWEATHER" -> https://openweathermap.org/current
 * ---------------------------------------------------------------------------
 */

function fetchLiveWeather_(lat, lon) {
  const key = getProp_("WEATHER_API_KEY", "");
  if (!key) throw new Error("WEATHER_API_KEY is not set. Run setWeatherApiKey('...') once.");

  if (CFG.WEATHER_PROVIDER === "OPENWEATHER") {
    const url =
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}` +
      `&units=metric&appid=${key}`;
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const j = JSON.parse(res.getContentText());
    if (j.cod && Number(j.cod) !== 200) throw new Error(j.message || "OpenWeather error");
    return {
      condition: j.weather?.[0]?.main || "—",
      temperature: j.main?.temp ?? null,
      humidity: j.main?.humidity ?? null,
      rainfall: (j.rain && (j.rain["1h"] ?? j.rain["3h"])) || 0,
      windSpeed: (j.wind?.speed ?? 0) * 3.6, // m/s -> km/h
      cloudCover: j.clouds?.all ?? 0,
    };
  }

  // Default: WeatherAPI.com
  const url = `https://api.weatherapi.com/v1/current.json?key=${key}&q=${lat},${lon}&aqi=no`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const j = JSON.parse(res.getContentText());
  if (j.error) throw new Error(j.error.message);
  return {
    condition: j.current?.condition?.text || "—",
    temperature: j.current?.temp_c ?? null,
    humidity: j.current?.humidity ?? null,
    rainfall: j.current?.precip_mm ?? 0,
    windSpeed: j.current?.wind_kph ?? 0,
    cloudCover: j.current?.cloud ?? 0,
  };
}

function weatherCacheSheet_() {
  return sheet_(CFG.SHEETS.WEATHER_CACHE, CFG.WEATHER_HEADERS);
}

function upsertWeatherCache_(storeCode, city, weather) {
  const sh = weatherCacheSheet_();
  const data = sh.getDataRange().getValues();
  const now = new Date().toISOString();
  const row = [
    storeCode, city, weather.condition, weather.temperature, weather.humidity,
    weather.rainfall, weather.windSpeed, weather.cloudCover, now,
  ];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(storeCode)) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return;
    }
  }
  sh.appendRow(row);
}

function getWeatherCacheMap_() {
  const sh = weatherCacheSheet_();
  const data = sh.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < data.length; i++) {
    const [storeCode, city, condition, temperature, humidity, rainfall, windSpeed, cloudCover, lastUpdated] = data[i];
    if (!storeCode) continue;
    map[String(storeCode)] = { condition, temperature, humidity, rainfall, windSpeed, cloudCover, lastUpdated };
  }
  return map;
}

/** On-demand single-store fetch, used by the client's getWeather API call. */
function getWeatherForStore_(storeCode) {
  const stores = getStores();
  const store = stores.find((s) => String(s.storeCode) === String(storeCode));
  if (!store) throw new Error(`Unknown store code ${storeCode}`);
  const weather = fetchLiveWeather_(store.latitude, store.longitude);
  upsertWeatherCache_(store.storeCode, store.city, weather);
  return weather;
}

/**
 * 1-minute trigger (see Config.gs::installTriggers for why 1, not 2).
 * Does two things every CFG.WEATHER_REFRESH_MINUTES:
 *   1. Refreshes weather for every ACTIVE store — priority, drives the
 *      buzzer, always runs in full every cycle.
 *   2. Background-fills a rotating batch of INACTIVE stores too (size
 *      CFG.WEATHER_BACKGROUND_BATCH_SIZE), so every store eventually
 *      shows real weather on the dashboard — not just active ones — while
 *      still keeping total API calls per cycle bounded and predictable
 *      regardless of how many stores you have (500+). With the default
 *      batch of 10, ~94 stores fully cycle roughly every 20 minutes; tune
 *      WEATHER_BACKGROUND_BATCH_SIZE up if you want faster full coverage
 *      and your weather provider's quota allows it.
 */
function refreshWeatherForActiveStores() {
  const lastRunMs = Number(getProp_("__lastWeatherRefreshMs", "0"));
  const dueMs = CFG.WEATHER_REFRESH_MINUTES * 60 * 1000;
  if (Date.now() - lastRunMs < dueMs) return; // not due yet — cheap no-op

  const state = buildState_();
  const activeCodes = Object.keys(state.sessions);
  const stores = getStores();
  let anyRainStopped = false;

  // 1. Active stores — always refreshed in full, every cycle.
  activeCodes.forEach((code) => {
    const store = stores.find((s) => String(s.storeCode) === code);
    if (!store) return;
    try {
      const weather = fetchLiveWeather_(store.latitude, store.longitude);
      upsertWeatherCache_(store.storeCode, store.city, weather);
      if ((weather.rainfall ?? 0) === 0) anyRainStopped = true;
    } catch (err) {
      console.error(`Weather refresh failed for ${code}: ${err.message}`);
    }
  });

  // 2. Inactive stores — background-filled a batch at a time, round-robin,
  //    so the whole store list gradually gets real weather without
  //    spiking API usage. Skips stores with no coordinates (e.g. TEA6/TEA9
  //    from the known source data gap — see README).
  const inactiveStores = stores.filter(
    (s) => !activeCodes.includes(s.storeCode) && s.latitude != null && s.longitude != null && s.latitude !== ""
  );
  if (inactiveStores.length > 0) {
    const batchSize = CFG.WEATHER_BACKGROUND_BATCH_SIZE;
    let idx = Number(getProp_("__weatherRotationIndex", "0"));
    for (let i = 0; i < batchSize && i < inactiveStores.length; i++) {
      const store = inactiveStores[idx % inactiveStores.length];
      try {
        const weather = fetchLiveWeather_(store.latitude, store.longitude);
        upsertWeatherCache_(store.storeCode, store.city, weather);
      } catch (err) {
        console.error(`Background weather refresh failed for ${store.storeCode}: ${err.message}`);
      }
      idx++;
    }
    setProp_("__weatherRotationIndex", String(idx % inactiveStores.length));
  }

  const configSheet = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS);
  const now = new Date().toLocaleTimeString("en-IN", { timeZone: CFG.TIMEZONE });
  upsertConfigValue_(configSheet, "__lastWeatherUpdate", now);
  setProp_("__lastWeatherRefreshMs", String(Date.now()));

  // Client-side buzzer/visual alert reads this on its next poll (~12s) —
  // see dashboard.js::checkBuzzerCondition, which rings for 10 seconds.
  upsertConfigValue_(configSheet, "__anyRainStopped", anyRainStopped ? "true" : "false");
}

/**
 * Writes to the Config sheet's Value column, forcing plain-text format
 * first. Without this, a value like "8:59:59 am" gets auto-detected by
 * Sheets as a time and silently stored as a real Date/Time value — which
 * then reads back with a meaningless placeholder date attached (Sheets'
 * internal time-only epoch, 1899-12-30) instead of the plain string you
 * wrote.
 */
function upsertConfigValue_(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      const cell = sheet.getRange(i + 1, 2);
      cell.setNumberFormat("@");
      cell.setValue(value);
      return;
    }
  }
  const newRow = sheet.getLastRow() + 1;
  const range = sheet.getRange(newRow, 1, 1, 2);
  range.setNumberFormats([["@", "@"]]);
  range.setValues([[key, value]]);
}

/**
 * Run this ONCE manually (select it in the function dropdown, click Run)
 * whenever you want every store's weather populated immediately, instead
 * of waiting for the background rotation to work through all of them
 * (~20 minutes for 94 stores at the default batch size). Skips stores
 * with no coordinates (e.g. TEA6/TEA9 — see README's data-gap note).
 *
 * NOTE ON API QUOTA: this makes one live call per store in a single run
 * (94 calls for your current store list, taking well under a minute).
 * That's a one-time cost each time you run it — fine to run occasionally,
 * but don't wire this into a frequent trigger, or you'll burn through
 * your weather provider's monthly quota much faster than the rotation
 * approach in refreshWeatherForActiveStores does.
 */
function refreshAllStoresWeatherNow() {
  const stores = getStores().filter(
    (s) => s.latitude != null && s.longitude != null && s.latitude !== ""
  );
  let ok = 0;
  let failed = 0;

  stores.forEach((store) => {
    try {
      const weather = fetchLiveWeather_(store.latitude, store.longitude);
      upsertWeatherCache_(store.storeCode, store.city, weather);
      ok++;
    } catch (err) {
      failed++;
      console.error(`Failed for ${store.storeCode}: ${err.message}`);
    }
  });

  const configSheet = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS);
  const now = new Date().toLocaleTimeString("en-IN", { timeZone: CFG.TIMEZONE });
  upsertConfigValue_(configSheet, "__lastWeatherUpdate", now);

  console.log(`Backfilled weather for ${ok} store(s); ${failed} failed. Skipped stores with no coordinates.`);
  SpreadsheetApp.getUi()?.alert(
    `Weather refreshed for ${ok} store(s)` + (failed > 0 ? ` (${failed} failed — check Executions log).` : ".")
  );
}
