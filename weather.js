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
   * raw description verbatim. The full raw text is still stored
   * server-side in WeatherCache and the exported CSV.
   *
   * This is now driven ENTIRELY by the provider's condition TEXT via an
   * explicit lookup table covering every text WeatherAPI.com can return —
   * not by the rainfall (mm) figure. That's a deliberate fix: rainfall is
   * accumulated over the current clock hour, so it can stay positive for
   * a while after rain has actually stopped, and can still read near-zero
   * for the first few minutes after rain has actually started — using it
   * to override the condition text was causing exactly the "shows
   * Raining when it's actually stopped, shows Cloudy when it's actually
   * raining" symptom. The condition text itself is the provider's own
   * real-time determination and is now the sole source of truth; rainfall
   * is only ever displayed as a supporting number, never used to decide
   * the label.
   */
  const CONDITION_MAP = {
    "sunny": "Clear", "clear": "Clear",
    "partly cloudy": "Cloudy", "cloudy": "Cloudy", "overcast": "Cloudy",
    "mist": "Cloudy", "fog": "Cloudy", "freezing fog": "Cloudy",
    "blowing snow": "Cloudy", "blizzard": "Cloudy", "patchy snow possible": "Cloudy",
    "patchy light snow": "Cloudy", "light snow": "Cloudy", "patchy moderate snow": "Cloudy",
    "moderate snow": "Cloudy", "patchy heavy snow": "Cloudy", "heavy snow": "Cloudy",
    "light snow showers": "Cloudy", "moderate or heavy snow showers": "Cloudy",
    "patchy rain possible": "Raining", "patchy sleet possible": "Raining",
    "patchy freezing drizzle possible": "Raining",
    "patchy light drizzle": "Raining", "light drizzle": "Raining",
    "freezing drizzle": "Raining", "heavy freezing drizzle": "Raining",
    "patchy light rain": "Raining", "light rain": "Raining",
    "moderate rain at times": "Raining", "moderate rain": "Raining",
    "heavy rain at times": "Raining", "heavy rain": "Raining",
    "light freezing rain": "Raining", "moderate or heavy freezing rain": "Raining",
    "light sleet": "Raining", "moderate or heavy sleet": "Raining",
    "ice pellets": "Raining",
    "light rain shower": "Raining", "moderate or heavy rain shower": "Raining",
    "torrential rain shower": "Raining",
    "light sleet showers": "Raining", "moderate or heavy sleet showers": "Raining",
    "light showers of ice pellets": "Raining", "moderate or heavy showers of ice pellets": "Raining",
    "thundery outbreaks possible": "Thunderstorm",
    "patchy light rain with thunder": "Thunderstorm", "moderate or heavy rain with thunder": "Thunderstorm",
    "patchy light snow with thunder": "Thunderstorm", "moderate or heavy snow with thunder": "Thunderstorm",
  };

  function classify(weather) {
    const raw = (weather.condition || "").trim().toLowerCase();
    if (CONDITION_MAP[raw]) return CONDITION_MAP[raw];

    // Defensive fallback ONLY for text not in the table above (e.g. a
    // different provider than WeatherAPI.com) — still text-driven, never
    // falls back to the rainfall number.
    if (raw.includes("thunder")) return "Thunderstorm";
    if (/rain|drizzle|shower|sleet|ice pellet/.test(raw)) return "Raining";
    if (/mist|fog|haze|cloud|overcast|snow/.test(raw)) return "Cloudy";
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
      forecastNote: weather.forecastNote || null,
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
