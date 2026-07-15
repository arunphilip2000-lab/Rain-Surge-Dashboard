/**
 * weather.js
 * ---------------------------------------------------------------------------
 * The actual API calls to WeatherAPI.com/OpenWeather happen server-side
 * (appscript/Weather.gs) on a 5-minute trigger, and are cached into a
 * WeatherCache sheet. This keeps the API key private and means N
 * simultaneous dashboards never multiply the request count.
 *
 * This module only formats what the server already computed, and owns
 * "rain has stopped" detection/alerting on the client.
 * ---------------------------------------------------------------------------
 */

const Weather = (() => {
  /**
   * By design, the dashboard only ever shows one of exactly FOUR states —
   * Clear, Cloudy, Raining, Thunderstorm — never the weather provider's
   * raw description (Mist, Patchy rain nearby, Overcast, etc.), which was
   * reported as confusing for quick scanning. The full raw condition text
   * is still stored server-side in WeatherCache and the exported CSV, in
   * case it's useful later — this only simplifies what's DISPLAYED here.
   *
   * IMPORTANT: the provider's `rainfall` figure is accumulated over the
   * current hour, not an instant reading — so it can stay positive for a
   * while after rain has actually stopped and the sky has cleared to mist
   * or cloud. The provider's condition TEXT updates far closer to
   * real-time, so it's checked first; rainfall is only a fallback for
   * condition text that doesn't explicitly say "rain." Mist/fog/haze are
   * explicitly never counted as rain, even if a trailing rainfall number
   * is still positive.
   *
   * Checked in this order:
   *   1. Thunderstorm — condition text mentions thunder.
   *   2. Cloudy       — condition text mentions mist/fog/haze (never rain).
   *   3. Raining      — condition text explicitly mentions rain/drizzle/
   *      shower, OR (as a fallback) rainfall is at least 0.5mm.
   *   4. Cloudy       — no rain, but cloud cover is high (>= 50%) or the
   *      text mentions cloud/overcast.
   *   5. Clear        — none of the above.
   */
  function classify(weather) {
    const rainfall = weather.rainfall ?? 0;
    const cloudCover = weather.cloudCover ?? 0;
    const raw = (weather.condition || "").toLowerCase();

    if (raw.includes("thunder")) return "Thunderstorm";
    if (/mist|fog|haze/.test(raw)) return "Cloudy";
    if (/rain|drizzle|shower/.test(raw)) return "Raining";
    if (rainfall >= 0.5) return "Raining"; // fallback for condition text that doesn't say "rain" outright
    if (cloudCover >= 50 || /cloud|overcast/.test(raw)) return "Cloudy";
    return "Clear";
  }

  function iconFor(label) {
    switch (label) {
      case "Thunderstorm": return "⛈️";
      case "Raining": return "🌧️";
      case "Cloudy": return "☁️";
      default: return "☀️";
    }
  }

  function format(weather) {
    if (!weather) return null;
    const label = classify(weather);
    return {
      condition: label,
      icon: iconFor(label),
      temperature: `${Math.round(weather.temperature ?? 0)}°C`,
      humidity: `${Math.round(weather.humidity ?? 0)}%`,
      rainfall: `${(weather.rainfall ?? 0).toFixed(1)} mm`,
      windSpeed: `${Math.round(weather.windSpeed ?? 0)} km/h`,
      cloudCover: `${Math.round(weather.cloudCover ?? 0)}%`,
      lastUpdated: weather.lastUpdated || null,
      isRaining: label === "Raining" || label === "Thunderstorm",
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
    const stopped = !weather || !(classify(weather) === "Raining" || classify(weather) === "Thunderstorm");
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
