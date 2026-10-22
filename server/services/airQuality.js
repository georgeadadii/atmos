import { AppError } from "../errors.js";
import { localDateTime, localDayWindow } from "./time.js";

const UNIT = "µg/m³";

const POLLUTANT_NAMES = Object.freeze({
  so2: "Sulphur dioxide (SO₂)",
  no2: "Nitrogen dioxide (NO₂)",
  pm10: "Particulate matter (PM₁₀)",
  pm2_5: "Fine particulate matter (PM₂.₅)",
  o3: "Ozone (O₃)",
  co: "Carbon monoxide (CO)",
});

const AQI_CLASSIFICATIONS = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
const round = (value, places = 1) => Number(value.toFixed(places));

function parseReading(reading) {
  if (
    !Number.isFinite(reading?.dt) ||
    !Number.isInteger(reading?.main?.aqi) ||
    reading.main.aqi < 1 ||
    reading.main.aqi > 5 ||
    !reading?.components ||
    typeof reading.components !== "object"
  ) {
    return null;
  }
  for (const identifier of Object.keys(POLLUTANT_NAMES)) {
    if (
      !Number.isFinite(reading.components[identifier]) ||
      reading.components[identifier] < 0
    ) {
      return null;
    }
  }
  for (const identifier of ["no", "nh3"]) {
    if (
      reading.components[identifier] !== undefined &&
      (!Number.isFinite(reading.components[identifier]) ||
        reading.components[identifier] < 0)
    ) {
      return null;
    }
  }
  return reading;
}

function measurementComponents(components) {
  return Object.fromEntries(
    Object.entries(components)
      .filter(([, value]) => Number.isFinite(value) && value >= 0)
      .map(([identifier, concentration]) => [
        identifier,
        { concentration: round(concentration, 2), unit: UNIT },
      ]),
  );
}

export function processAirQuality(
  currentPayload,
  forecastPayload,
  { dates, timezoneOffsetSeconds },
) {
  const current = parseReading(currentPayload?.list?.[0]);
  if (!current) {
    throw new AppError(
      "INVALID_POLLUTION_DATA",
      "Current air-pollution data is missing or malformed.",
      502,
    );
  }
  if (!Array.isArray(forecastPayload?.list)) {
    throw new AppError(
      "INVALID_POLLUTION_DATA",
      "Forecast air-pollution data is missing or malformed.",
      502,
    );
  }

  const window = localDayWindow(dates, timezoneOffsetSeconds);
  let ignoredMalformedReadings = 0;
  const readings = forecastPayload.list.filter((reading) => {
    const parsed = parseReading(reading);
    if (!parsed) {
      ignoredMalformedReadings += 1;
      return false;
    }
    return reading.dt >= window.start && reading.dt < window.end;
  });
  if (readings.length === 0) {
    throw new AppError(
      "INSUFFICIENT_POLLUTION_DATA",
      "Air-pollution forecast data is unavailable for the selected period.",
      502,
    );
  }

  const observedAt = localDateTime(current.dt, timezoneOffsetSeconds);
  const peaks = Object.entries(POLLUTANT_NAMES).map(([identifier, name]) => {
    const maximumReading = readings.reduce((maximum, reading) =>
      reading.components[identifier] > maximum.components[identifier]
        ? reading
        : maximum,
    );
    const concentration = maximumReading.components[identifier];
    return {
      identifier,
      name,
      concentration,
      expectedAt: localDateTime(maximumReading.dt, timezoneOffsetSeconds),
    };
  });
  const maxima = peaks.map(({ identifier, name, concentration, expectedAt }) => {
    return {
      pollutant: identifier,
      name,
      concentration: round(concentration, 2),
      unit: UNIT,
      expectedAt,
    };
  });
  const firstTimestamp = Math.min(...readings.map((reading) => reading.dt));
  const lastTimestamp = Math.max(...readings.map((reading) => reading.dt));
  const complete = firstTimestamp <= window.start && lastTimestamp + 3600 >= window.end;
  const limitations = [];
  if (!complete) {
    limitations.push(
      "The hourly air-pollution forecast does not cover every hour of the three local calendar days; maxima use the available hours only.",
    );
  }
  if (ignoredMalformedReadings > 0) {
    limitations.push(
      `${ignoredMalformedReadings} malformed air-pollution reading(s) were excluded.`,
    );
  }

  return {
    current: {
      observedAt,
      aqi: current.main.aqi,
      aqiClassification: AQI_CLASSIFICATIONS[current.main.aqi - 1],
      components: measurementComponents(current.components),
    },
    forecast: {
      period: { startDate: dates[0], endDate: dates.at(-1) },
      readingCount: readings.length,
      coverage: {
        complete,
        firstReadingAt: localDateTime(firstTimestamp, timezoneOffsetSeconds),
        lastReadingAt: localDateTime(lastTimestamp, timezoneOffsetSeconds),
      },
      maxima,
    },
    limitations,
  };
}
