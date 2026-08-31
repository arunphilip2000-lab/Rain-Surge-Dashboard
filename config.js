async function checkStoreRainPrediction(apiKey, lat, lon) {
  // Use /forecast.json with days=1 to get today's hourly breakdown
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lon}&days=1&aqi=no&alerts=no`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    
    const data = await response.json();
    
    // Parse current local time for the store
    const storeLocalTime = new Date(data.location.localtime);
    const currentHour = storeLocalTime.getHours();

    const hourlyForecasts = data.forecast.forecastday[0].hour;

    // Filter for upcoming hours (from current hour onwards)
    const upcomingHours = hourlyForecasts.slice(currentHour, currentHour + 6); // Next 6 hours

    console.log(`Checking rain forecast for: ${data.location.name}, ${data.location.region}`);

    const predictions = upcomingHours.map(hourData => {
      const chance = parseInt(hourData.chance_of_rain, 10);
      const volume = parseFloat(hourData.precip_mm);
      const condition = hourData.condition.text;

      // Define your rain detection rule
      const isRainLikely = chance >= 40 || volume > 0.1;

      return {
        time: hourData.time,
        conditionText: condition,
        chanceOfRainPercent: chance,
        precipitationMm: volume,
        isRainLikely: isRainLikely
      };
    });

    return predictions;

  } catch (error) {
    console.error("Failed to fetch weather data:", error);
  }
}

// Example usage:
// checkStoreRainPrediction("YOUR_API_KEY", 12.9716, 77.5946).then(console.log);
