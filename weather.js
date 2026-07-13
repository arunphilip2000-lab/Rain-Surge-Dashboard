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
  function icon(condition = "") {
    const c = condition.toLowerCase();
    if (c.includes("thunder")) return "⛈️";
    if (c.includes("heavy")) return "🌧️";
    if (c.includes("rain") || c.includes("drizzle")) return "🌦️";
    if (c.includes("cloud")) return "☁️";
    if (c.includes("clear") || c.includes("sun")) return "☀️";
    return "🌤️";
  }

  function format(weather) {
    if (!weather) return null;
    return {
      condition: weather.condition || "—",
      icon: icon(weather.condition),
      temperature: `${Math.round(weather.temperature ?? 0)}°C`,
      humidity: `${Math.round(weather.humidity ?? 0)}%`,
      rainfall: `${(weather.rainfall ?? 0).toFixed(1)} mm`,
      windSpeed: `${Math.round(weather.windSpeed ?? 0)} km/h`,
      cloudCover: `${Math.round(weather.cloudCover ?? 0)}%`,
      lastUpdated: weather.lastUpdated || null,
      isRaining: (weather.rainfall ?? 0) > 0,
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
    const stopped = !weather || (weather.rainfall ?? 0) === 0;
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

  return { format, checkRainStopped, icon };
})();
