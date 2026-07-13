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
 * Refreshes weather only for stores with an ACTIVE Rain Surge session, and
 * only once CFG.WEATHER_REFRESH_MINUTES have actually elapsed since the
 * last refresh — so N dashboards never multiply API calls, idle stores
 * don't burn quota, and the real-world cadence is still 2 minutes even
 * though the trigger itself fires every 1.
 */
function refreshWeatherForActiveStores() {
  const lastRunMs = Number(getProp_("__lastWeatherRefreshMs", "0"));
  const dueMs = CFG.WEATHER_REFRESH_MINUTES * 60 * 1000;
  if (Date.now() - lastRunMs < dueMs) return; // not due yet — cheap no-op

  const state = buildState_();
  const activeCodes = Object.keys(state.sessions);
  if (activeCodes.length === 0) {
    setProp_("__lastWeatherRefreshMs", String(Date.now()));
    return;
  }

  const stores = getStores();
  let anyRainStopped = false;

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

  const configSheet = sheet_(CFG.SHEETS.CONFIG, CFG.CONFIG_HEADERS);
  const now = new Date().toLocaleTimeString("en-IN", { timeZone: CFG.TIMEZONE });
  upsertConfigValue_(configSheet, "__lastWeatherUpdate", now);
  setProp_("__lastWeatherRefreshMs", String(Date.now()));

  // Client-side buzzer/visual alert reads this on its next poll (~12s) —
  // see dashboard.js::checkBuzzerCondition, which rings for 10 seconds.
  upsertConfigValue_(configSheet, "__anyRainStopped", anyRainStopped ? "true" : "false");
}

function upsertConfigValue_(sheet, key, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}
