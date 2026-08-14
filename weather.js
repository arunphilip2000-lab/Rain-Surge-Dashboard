/**
 * weather.js
 * ---------------------------------------------------------------------------
 * The actual API calls happen server-side (appscript/Weather.gs) and are
 * cached into a WeatherCache sheet. This keeps the API key private and
 * means N simultaneous dashboards never multiply the request count.
 *
 * This module only formats what the server already computed, and owns
 * "rain has stopped" detection/alerting on the client.
 * ---------------------------------------------------------------------------
 */

const Weather = (() => {
  /**
   * Two-step classification, mirroring Weather.gs exactly:
   *   1. BUCKET (Clear / Cloudy / Raining) — decided by the provider's
   *      condition TEXT. Any condition mentioning rain/drizzle/shower/
   *      sleet/thunder counts as Raining, EXCEPT text containing
   *      "possible" (Patchy rain possible, Thundery outbreaks possible,
   *      etc.) — that's the provider's own probabilistic phrasing, a
   *      scattered CHANCE nearby, not a confirmed observation, so it's
   *      Cloudy instead.
   *   2. INTENSITY (Low / Moderate / High / Extreme) — decided by the
   *      ACTUAL measured rainfall in mm, not text guessing. Standard
   *      India Meteorological Department-style bands:
   *        Low      : any measurable rain up to 2.5mm
   *        Moderate : 2.5mm up to 7.5mm
   *        High     : 7.5mm up to 35mm
   *        Extreme  : 35mm and above
   *      A store showing "Raining" by text but with a very small/zero
   *      measured figure still floors at Low, rather than being hidden
   *      as Cloudy — the goal is to size real rain honestly, not filter
   *      it out.
   */
  function bucketFromText(conditionText) {
    const raw = (conditionText || "").trim().toLowerCase();
    // "Patchy" and "possible" are both scattered/probabilistic phrasing —
    // never a reliable "it's raining at this exact point" observation, so
    // they never count as Raining regardless of the measured figure.
    // Still shown as Cloudy, though — it's not actually clear/sunny
    // weather, just not confirmed-raining.
    if (raw.includes("possible") || raw.includes("patchy")) {
      return /clear|sunny/.test(raw) ? "Clear" : "Cloudy";
    }
    if (raw.includes("thunder") || /rain|drizzle|shower|sleet|ice pellet/.test(raw)) return "Raining";
    if (/mist|fog|haze|cloud|overcast|snow/.test(raw)) return "Cloudy";
    if (/clear|sunny/.test(raw)) return "Clear";
    return "Clear";
  }

  const DEFAULT_THRESHOLDS = { lowMax: 1.0, moderateMax: 3.5, minRainfall: 0.1 };

  function intensityFromMm(mm, thresholds) {
    const t = thresholds || DEFAULT_THRESHOLDS;
    const rainfall = mm ?? 0;
    if (rainfall > t.moderateMax) return "Heavy";
    if (rainfall > t.lowMax) return "Moderate";
    return "Low";
  }

  /**
   * Requires ACTUAL measured precipitation (> 0mm) to confirm Raining —
   * the condition text alone isn't enough, no exceptions (including
   * thunderstorm text) — a "Thunderstorm" or "Light rain" label with a
   * genuine 0mm reading doesn't count; even a small measured amount
   * (e.g. 0.2mm of real drizzle) does.
   */
  /**
   * The measured rainfall (mm) is checked FIRST, not the condition text.
   * Found from a real case: a store showed "Cloudy" as its condition
   * text while PRECIP NOW genuinely read 1.0mm — the provider's summary
   * label and its precipitation figure don't always agree, and the
   * previous text-first design meant real measured rain got ignored
   * whenever the label didn't happen to say a rain-type word. Now: any
   * measured rainfall >= the configured minimum counts as Raining,
   * regardless of the text. Only when the mm reading is BELOW that
   * minimum does the text get consulted at all — and even then, a
   * rain-type text with too little measured rain still correctly
   * downgrades to Cloudy (never upgrades a real 0mm reading into Raining
   * just because the label says "Light rain").
   */
  function classify(weather, thresholds) {
    const t = thresholds || DEFAULT_THRESHOLDS;
    const rainfall = weather.rainfall ?? 0;

    if (rainfall >= t.minRainfall) {
      const intensity = intensityFromMm(rainfall, t);
      return { bucket: "Raining", label: `${intensity} Rain`, intensity };
    }

    const bucket = bucketFromText(weather.condition);
    if (bucket === "Raining") return { bucket: "Cloudy", label: "Cloudy" }; // text says rain, measured amount doesn't back it up
    return { bucket, label: bucket };
  }

  function iconFor(bucket) {
    if (bucket === "Raining") return "🌧️";
    if (bucket === "Cloudy") return "☁️";
    return "☀️";
  }

  /** Parses the "14:18|15:26|16:28" compact string into
   *  [{hour: 14, chance: 18}, ...] for the card's mini bar chart. */
  function parseHourlySeries(raw) {
    if (!raw) return [];
    return raw.split("|").filter(Boolean).map((pair) => {
      const [hour, chance, intensity] = pair.split(":");
      return { hour: Number(hour), chance: Number(chance), intensity: intensity || "" };
    });
  }

  /** @param {object} weather - raw cached weather for one store
   *  @param {{lowMax:number, moderateMax:number}} [thresholds]
   *  - the current configurable mm bands from state.rainThresholds (falls
   *    back to the meteorological defaults if not supplied). */
  const AREA_SOURCE_LABEL = { N: "north", S: "south", E: "east", W: "west" };

  function areaRainNote(areaRainSource) {
    if (!areaRainSource || areaRainSource === "center") return null;
    return `📍 Rain detected ~3km ${AREA_SOURCE_LABEL[areaRainSource] || areaRainSource} — not at this exact spot`;
  }

  function format(weather, thresholds) {
    if (!weather) return null;
    const { bucket, label } = classify(weather, thresholds);
    return {
      condition: label,
      icon: iconFor(bucket),
      temperature: `${Math.round(weather.temperature ?? 0)}°C`,
      temperatureRaw: Math.round(weather.temperature ?? 0),
      humidity: `${Math.round(weather.humidity ?? 0)}%`,
      rainfall: `${(weather.rainfall ?? 0).toFixed(1)} mm`,
      windSpeed: `${Math.round(weather.windSpeed ?? 0)} km/h`,
      cloudCover: `${Math.round(weather.cloudCover ?? 0)}%`,
      lastUpdated: weather.lastUpdated || null,
      isRaining: bucket === "Raining",
      forecastNote: weather.forecastNote || null,
      rainChanceNow: weather.rainChanceNow ?? null,
      hourlySeries: parseHourlySeries(weather.hourlySeries),
      areaRainNote: areaRainNote(weather.areaRainSource),
    };
  }

  /**
   * Visual-only: shows/hides the "rain stopped" banner and card highlight
   * for a store, per spec section 11. The 10-second buzzer sound itself is
   * centralized in dashboard.js::ringBuzzer, triggered once per poll cycle
   * from the server's `anyRainStopped` flag (see app.js::refresh) rather
   * than per-store here — that keeps a single audio source instead of N
   * overlapping alarms when several stores are affected at once, and
   * matches the "buzzer rings for 10 seconds" spec rather than looping
   * indefinitely.
   */
  function checkRainStopped(store, weather, thresholds, isAutoSession) {
    const stopped = !weather || classify(weather, thresholds).bucket !== "Raining";
    const card = document.querySelector(`[data-store-code="${store.storeCode}"]`);
    if (!card) return;

    if (stopped && store.status === "ACTIVE") {
      card.classList.add("rain-stopped-alert");
      let banner = card.querySelector(".rain-stop-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "rain-stop-banner";
        card.prepend(banner);
      }
      banner.textContent = isAutoSession
        ? "⚠ Rain has stopped — this store will auto-turn off shortly, no action needed."
        : "⚠ Rain has stopped. Please contact the respective TL and turn OFF Rain Surge.";
    } else {
      card.classList.remove("rain-stopped-alert");
      card.querySelector(".rain-stop-banner")?.remove();
    }
  }

  return { format, checkRainStopped };
})();
