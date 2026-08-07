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
    if (!raw.includes("possible")) {
      if (raw.includes("thunder") || /rain|drizzle|shower|sleet|ice pellet/.test(raw)) return "Raining";
    }
    if (/mist|fog|haze|cloud|overcast|snow/.test(raw)) return "Cloudy";
    if (/clear|sunny/.test(raw)) return "Clear";
    return "Clear";
  }

  function intensityFromMm(mm) {
    const rainfall = mm ?? 0;
    if (rainfall >= 35) return "Extreme";
    if (rainfall >= 7.5) return "High";
    if (rainfall >= 2.5) return "Moderate";
    return "Low";
  }

  function classify(weather) {
    const bucket = bucketFromText(weather.condition);
    if (bucket !== "Raining") return { bucket, label: bucket };
    const intensity = intensityFromMm(weather.rainfall);
    return { bucket, label: `${intensity} Rain`, intensity };
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
      const [hour, chance] = pair.split(":");
      return { hour: Number(hour), chance: Number(chance) };
    });
  }

  function format(weather) {
    if (!weather) return null;
    const { bucket, label } = classify(weather);
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
  function checkRainStopped(store, weather) {
    const stopped = !weather || bucketFromText(weather.condition) !== "Raining";
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
      banner.textContent =
        "⚠ Rain has stopped. Please contact the respective TL and turn OFF Rain Surge.";
    } else {
      card.classList.remove("rain-stopped-alert");
      card.querySelector(".rain-stop-banner")?.remove();
    }
  }

  return { format, checkRainStopped };
})();
