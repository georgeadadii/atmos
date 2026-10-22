const CLASSIFIED_POLLUTANTS = ["so2", "no2", "pm10", "pm2_5", "o3", "co"];
const SEVERITIES = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];

const nonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
const nonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

function isMeasurement(value) {
  return nonNegativeNumber(value?.concentration) && value?.unit === "µg/m³";
}

function isMaximum(value) {
  return Boolean(
    value &&
    CLASSIFIED_POLLUTANTS.includes(value.pollutant) &&
    nonEmptyString(value.name) &&
    nonNegativeNumber(value.concentration) &&
    value.unit === "µg/m³" &&
    nonEmptyString(value.expectedAt),
  );
}

function isForecastInterval(value) {
  return Boolean(
    value &&
    Number.isFinite(value.temperature) &&
    nonNegativeNumber(value.rainfall) &&
    nonNegativeNumber(value.windSpeedKmh),
  );
}

export function isTravelResponse(payload) {
  const current = payload?.airQuality?.current;
  const forecastAir = payload?.airQuality?.forecast;
  const components = current?.components;
  return Boolean(
    nonEmptyString(payload?.destination?.name) &&
    Number.isFinite(payload?.destination?.latitude) &&
    Number.isFinite(payload?.destination?.longitude) &&
    Array.isArray(payload?.forecast?.days) && payload.forecast.days.length === 3 &&
    payload?.forecast?.intervalsByDate &&
    typeof payload.forecast.intervalsByDate === "object" &&
    !Array.isArray(payload.forecast.intervalsByDate) &&
    new Set(payload.forecast.days.map((day) => day?.date)).size === 3 &&
    payload.forecast.days.every((day) => {
      const intervals = payload.forecast.intervalsByDate[day?.date];
      return nonEmptyString(day?.date) &&
        Object.hasOwn(payload.forecast.intervalsByDate, day.date) &&
        Array.isArray(intervals) && intervals.length > 0 &&
        intervals.every(isForecastInterval) && Array.isArray(day?.periods);
    }) &&
    nonEmptyString(current?.observedAt) &&
    Number.isInteger(current?.aqi) && current.aqi >= 1 && current.aqi <= 5 &&
    SEVERITIES.includes(current?.aqiClassification) &&
    components && typeof components === "object" &&
    CLASSIFIED_POLLUTANTS.every((pollutant) => isMeasurement(components[pollutant])) &&
    Object.values(components).every(isMeasurement) &&
    Array.isArray(forecastAir?.maxima) &&
    forecastAir.maxima.length === CLASSIFIED_POLLUTANTS.length &&
    forecastAir.maxima.every(isMaximum) &&
    new Set(forecastAir.maxima.map(({ pollutant }) => pollutant)).size ===
      CLASSIFIED_POLLUTANTS.length &&
    Array.isArray(payload?.limitations),
  );
}
