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
  /**
   * IMPORTANT FIX: any condition text containing "possible" (Patchy rain
   * possible, Thundery outbreaks possible, Patchy sleet possible, Patchy
   * freezing drizzle possible) is the provider's own probabilistic
   * phrasing — it means "there's a scattered/patchy CHANCE of this
   * nearby," not "this is definitely happening at this exact point right
   * now." Treating these as a confirmed "Raining"/"Thunderstorm" was
   * overclaiming — this was the actual cause of "shows Raining when it
   * clearly isn't." They're now classified as Cloudy: an honest read that
   * doesn't overclaim rain that isn't actually falling at this location.
   */
  /**
   * SECOND FIX (found from a real ground-truth report): the provider can
   * label something "Drizzle" or even "Rain" while the actual measured
   * amount is tiny (e.g. 0.2mm) — meteorologically accurate, but not what
   * "raining" means operationally on the ground, and not perceptible to a
   * TL standing at the store. Two changes to fix this:
   *   1. Drizzle is reclassified as Cloudy outright — it's definitionally
   *      very light/misty precipitation, not what delivery ops mean by
   *      "raining."
   *   2. Any condition that DOES map to "Raining" also now needs a real
   *      measured rainfall amount (>= MIN_RAINFALL_MM) to actually count
   *      — a "rain" label with a negligible measured amount is
   *      downgraded to Cloudy rather than shown as Raining.
   */
  const MIN_RAINFALL_MM = 0.3;

  const CONDITION_MAP = {
    "sunny": "Clear", "clear": "Clear",
    "partly cloudy": "Cloudy", "cloudy": "Cloudy", "overcast": "Cloudy",
    "mist": "Cloudy", "fog": "Cloudy", "freezing fog": "Cloudy",
    "blowing snow": "Cloudy", "blizzard": "Cloudy", "patchy snow possible": "Cloudy",
    "patchy light snow": "Cloudy", "light snow": "Cloudy", "patchy moderate snow": "Cloudy",
    "moderate snow": "Cloudy", "patchy heavy snow": "Cloudy", "heavy snow": "Cloudy",
    "light snow showers": "Cloudy", "moderate or heavy snow showers": "Cloudy",
    "patchy rain possible": "Cloudy", "patchy sleet possible": "Cloudy",
    "patchy freezing drizzle possible": "Cloudy", "thundery outbreaks possible": "Cloudy",
    "patchy light drizzle": "Cloudy", "light drizzle": "Cloudy",
    "freezing drizzle": "Cloudy", "heavy freezing drizzle": "Cloudy",
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
    "patchy light rain with thunder": "Thunderstorm", "moderate or heavy rain with thunder": "Thunderstorm",
    "patchy light snow with thunder": "Thunderstorm", "moderate or heavy snow with thunder": "Thunderstorm",
  };

  function classify(weather) {
    const raw = (weather.condition || "").trim().toLowerCase();
    const rainfall = weather.rainfall ?? 0;
    let bucket = CONDITION_MAP[raw];

    if (!bucket) {
      // Defensive fallback ONLY for text not in the table above (e.g. a
      // different provider than WeatherAPI.com) — still text-driven,
      // never trusts the rainfall number over the text. "possible" is
      // excluded from the rain/thunder match for the same reason as the
      // table above — it's probabilistic phrasing, not a confirmed
      // current observation. Drizzle wording falls through to the Cloudy
      // check below, same as the table.
      if (!raw.includes("possible")) {
        if (raw.includes("thunder")) bucket = "Thunderstorm";
        else if (!raw.includes("drizzle") && /rain|shower|sleet|ice pellet/.test(raw)) bucket = "Raining";
      }
      if (!bucket) bucket = /mist|fog|haze|cloud|overcast|snow|drizzle/.test(raw) ? "Cloudy" : "Clear";
    }

    // Corroboration check: a "Raining" label still needs a real measured
    // amount — a condition text saying rain with a negligible measured
    // figure (e.g. 0.2mm) gets downgraded to Cloudy, since that's not
    // what "raining" means operationally on the ground.
    if (bucket === "Raining" && rainfall < MIN_RAINFALL_MM) bucket = "Cloudy";

    return bucket;
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
