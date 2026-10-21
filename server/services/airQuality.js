import { AppError } from "../errors.js";
import { localDateTime, localDayWindow } from "./time.js";

const UNIT = "µg/m³";

// OpenWeather's component bands are half-open, so an upper boundary belongs
// to the next category. NO and NH3 are measurements only and are deliberately
// absent here: https://openweathermap.org/api/air-pollution
export const POLLUTANTS = Object.freeze({
  so2: {
    name: "Sulphur dioxide (SO₂)",
    boundaries: [20, 80, 250, 350],
    healthEffect:
      "Sulphur dioxide can make breathing harder and can aggravate asthma, especially in children.",
  },
  no2: {
    name: "Nitrogen dioxide (NO₂)",
    boundaries: [40, 70, 150, 200],
    healthEffect:
      "Nitrogen dioxide can irritate airways and can aggravate asthma and other respiratory conditions.",
  },
  pm10: {
    name: "Particulate matter (PM₁₀)",
    boundaries: [20, 50, 100, 200],
    healthEffect:
      "Inhalable particles can affect the lungs and can worsen existing heart or respiratory conditions.",
  },
  pm2_5: {
    name: "Fine particulate matter (PM₂.₅)",
    boundaries: [10, 25, 50, 75],
    healthEffect:
      "Fine particles can reach deep into the lungs and can worsen heart or respiratory conditions.",
  },
  o3: {
    name: "Ozone (O₃)",
    boundaries: [60, 100, 140, 180],
    healthEffect:
      "Ground-level ozone can cause coughing or breathing discomfort and can aggravate asthma.",
  },
  co: {
    name: "Carbon monoxide (CO)",
    boundaries: [4400, 9400, 12400, 15400],
    healthEffect:
      "Carbon monoxide reduces oxygen delivery to the heart and brain; people with heart disease are especially susceptible.",
  },
});

const SEVERITIES = ["Good", "Fair", "Moderate", "Poor", "Very Poor"];
const SEVERITY_RANK = Object.freeze(
  Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index])),
);

// The effect summaries above and the cautious precautions below are based on
// WHO and US EPA health material. OpenWeather categories are not clinical
// diagnoses, so this mapping deliberately avoids medical directives.
// https://www.who.int/teams/environment-climate-change-and-health/air-quality-energy-and-health/health-impacts
// https://www.epa.gov/criteria-air-pollutants
export const SEVERITY_GUIDANCE = Object.freeze({
  Fair:
    "Unusually sensitive people may notice effects; consider easing prolonged or strenuous outdoor activity if symptoms occur.",
  Moderate:
    "Sensitive groups may experience effects; consider reducing prolonged or strenuous outdoor activity.",
  Poor:
    "Health effects are more likely, especially for sensitive groups; reduce prolonged or strenuous outdoor activity and follow local advice.",
  "Very Poor":
    "Health effects may be more widespread or serious; avoid prolonged or strenuous outdoor activity and follow local alerts.",
});
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

function warningReading(identifier, concentration, timeField, time) {
  const metadata = POLLUTANTS[identifier];
  const classification = classifyPollutant(identifier, concentration);
  if (classification === "Good") return null;
  const goodBoundary = metadata.boundaries[0];
  const amountAboveGoodBoundary = concentration - goodBoundary;
  return {
    pollutant: identifier,
    name: metadata.name,
    concentration: round(concentration, 2),
    unit: UNIT,
    goodBoundary,
    severity: classification,
    amountAboveGoodBoundary: round(amountAboveGoodBoundary, 2),
    percentageAboveGoodBoundary: round(
      (amountAboveGoodBoundary / goodBoundary) * 100,
    ),
    [timeField]: time,
    healthRisk: `${metadata.healthEffect} ${SEVERITY_GUIDANCE[classification]}`,
  };
}

function combineWarnings(currentWarnings, forecastWarnings) {
  const currentByPollutant = new Map(
    currentWarnings.map((warning) => [warning.pollutant, warning]),
  );
  const forecastByPollutant = new Map(
    forecastWarnings.map((warning) => [warning.pollutant, warning]),
  );

  return Object.entries(POLLUTANTS).flatMap(([pollutant, metadata]) => {
    const current = currentByPollutant.get(pollutant) ?? null;
    const forecast = forecastByPollutant.get(pollutant) ?? null;
    if (!current && !forecast) return [];
    const peakSeverity = [current?.severity, forecast?.severity]
      .filter(Boolean)
      .sort((left, right) => SEVERITY_RANK[right] - SEVERITY_RANK[left])[0];
    return [{
      pollutant,
      name: metadata.name,
      unit: UNIT,
      goodBoundary: metadata.boundaries[0],
      peakSeverity,
      current,
      forecast,
    }];
  });
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
  const currentWarnings = Object.keys(POLLUTANTS).flatMap((identifier) => {
    const warning = warningReading(
      identifier,
      current.components[identifier],
      "observedAt",
      observedAt,
    );
    return warning ? [warning] : [];
  });

  const peaks = Object.entries(POLLUTANTS).map(([identifier, metadata]) => {
    const maximumReading = readings.reduce((maximum, reading) =>
      reading.components[identifier] > maximum.components[identifier]
        ? reading
        : maximum,
    );
    const concentration = maximumReading.components[identifier];
    return {
      identifier,
      metadata,
      concentration,
      expectedAt: localDateTime(maximumReading.dt, timezoneOffsetSeconds),
    };
  });
  const maxima = peaks.map(({ identifier, metadata, concentration, expectedAt }) => {
    return {
      pollutant: identifier,
      name: metadata.name,
      concentration: round(concentration, 2),
      unit: UNIT,
      goodThreshold: metadata.boundaries[0],
      classification: classifyPollutant(identifier, concentration),
      expectedAt,
    };
  });
  const forecastWarnings = peaks.flatMap(({ identifier, concentration, expectedAt }) => {
    const warning = warningReading(
      identifier,
      concentration,
      "expectedAt",
      expectedAt,
    );
    return warning ? [warning] : [];
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
      aqiClassification: SEVERITIES[current.main.aqi - 1],
      components: measurementComponents(current.components),
      warnings: currentWarnings,
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
      warnings: forecastWarnings,
    },
    warnings: combineWarnings(currentWarnings, forecastWarnings),
    limitations,
  };
}
