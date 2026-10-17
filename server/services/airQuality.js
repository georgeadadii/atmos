import { AppError } from "../errors.js";
import { localDateTime, localDayWindow } from "./time.js";

const UNIT = "µg/m³";

// OpenWeather's AQI component bands are half-open: a value exactly at the
// upper boundary belongs to the next category.
export const POLLUTANTS = Object.freeze({
  so2: {
    name: "Sulphur dioxide (SO₂)",
    boundaries: [20, 80, 250, 350],
    risk: "Elevated exposure may irritate the respiratory system, particularly for people with asthma.",
  },
  no2: {
    name: "Nitrogen dioxide (NO₂)",
    boundaries: [40, 70, 150, 200],
    risk: "Elevated exposure may irritate airways and can aggravate respiratory conditions.",
  },
  pm10: {
    name: "Particulate matter (PM₁₀)",
    boundaries: [20, 50, 100, 200],
    risk: "Elevated particle levels may affect the lungs and worsen existing heart or respiratory conditions.",
  },
  pm2_5: {
    name: "Fine particulate matter (PM₂.₅)",
    boundaries: [10, 25, 50, 75],
    risk: "Fine particles can penetrate deeply into the lungs; elevated exposure may worsen heart or respiratory conditions.",
  },
  o3: {
    name: "Ozone (O₃)",
    boundaries: [60, 100, 140, 180],
    risk: "Elevated ground-level ozone may cause breathing discomfort and aggravate respiratory conditions.",
  },
  co: {
    name: "Carbon monoxide (CO)",
    boundaries: [4400, 9400, 12400, 15400],
    risk: "Elevated carbon monoxide can reduce oxygen delivery in the body; risk increases with concentration and exposure time.",
  },
});

const SEVERITIES = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
const round = (value, places = 1) => Number(value.toFixed(places));

export function classifyPollutant(identifier, concentration) {
  const metadata = POLLUTANTS[identifier];
  if (!metadata || !Number.isFinite(concentration) || concentration < 0) {
    throw new AppError(
      "INVALID_POLLUTION_DATA",
      "The weather service returned malformed air-pollution data.",
      502,
    );
  }
  const categoryIndex = metadata.boundaries.findIndex(
    (boundary) => concentration < boundary,
  );
  return categoryIndex === -1 ? "Very Poor" : SEVERITIES[categoryIndex];
}

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
  for (const identifier of Object.keys(POLLUTANTS)) {
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

  const maxima = Object.entries(POLLUTANTS).map(([identifier, metadata]) => {
    const maximumReading = readings.reduce((maximum, reading) =>
      reading.components[identifier] > maximum.components[identifier]
        ? reading
        : maximum,
    );
    const concentration = maximumReading.components[identifier];
    const goodThreshold = metadata.boundaries[0];
    const amountAboveGoodThreshold = Math.max(0, concentration - goodThreshold);
    return {
      pollutant: identifier,
      name: metadata.name,
      concentration: round(concentration, 2),
      unit: UNIT,
      goodThreshold,
      classification: classifyPollutant(identifier, concentration),
      expectedAt: localDateTime(maximumReading.dt, timezoneOffsetSeconds),
      amountAboveGoodThreshold: round(amountAboveGoodThreshold, 2),
      percentageAboveGoodThreshold: round(
        (amountAboveGoodThreshold / goodThreshold) * 100,
      ),
      risk: metadata.risk,
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
      observedAt: localDateTime(current.dt, timezoneOffsetSeconds),
      aqi: current.main.aqi,
      aqiClassification: SEVERITIES[current.main.aqi - 1],
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
      warnings: maxima.filter((item) => item.classification !== "Good"),
    },
    limitations,
  };
}
