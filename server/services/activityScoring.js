const EXPECTED_INTERVALS_PER_DAY = 8;
const round = (value, places = 1) => Number(value.toFixed(places));
const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

function distanceOutsideRange(value, minimum, maximum) {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function scoreActivityForDay(activity, intervals) {
  if (
    !activity?.preferences ||
    !Array.isArray(intervals) ||
    intervals.length === 0
  ) {
    throw new TypeError(
      "An activity and at least one forecast interval are required.",
    );
  }

  const preferences = activity.preferences;
  const temperatures = intervals.map((interval) => interval.temperature);
  const windSpeeds = intervals.map((interval) => interval.windSpeedKmh);
  const rainfall = intervals.map((interval) => interval.rainfall);
  if (
    temperatures.some((value) => !Number.isFinite(value)) ||
    windSpeeds.some((value) => !Number.isFinite(value) || value < 0) ||
    rainfall.some((value) => !Number.isFinite(value) || value < 0)
  ) {
    throw new TypeError("Forecast intervals contain invalid weather values.");
  }

  const temperaturePenalty =
    average(
      temperatures.map((temperature) =>
        distanceOutsideRange(
          temperature,
          preferences.minimumTemperature,
          preferences.maximumTemperature,
        ),
      ),
    ) * preferences.temperaturePenaltyPerDegree;

  const rainyIntervalCount = rainfall.filter((amount) => amount > 0).length;
  const totalRainfallMm = rainfall.reduce((sum, amount) => sum + amount, 0);
  const rainPenalty =
    totalRainfallMm * preferences.rainPenaltyPerMillimetre +
    (rainyIntervalCount / intervals.length) * preferences.rainyIntervalPenalty;

  const windExcesses = windSpeeds.map((speed) =>
    Math.max(0, speed - preferences.maximumWindSpeedKmh),
  );
  const windyIntervalCount = windExcesses.filter((excess) => excess > 0).length;
  const windPenalty =
    average(windExcesses) * preferences.windPenaltyPerKmh +
    (windyIntervalCount / intervals.length) * preferences.windyIntervalPenalty;

  const missingIntervalCount = Math.max(
    0,
    EXPECTED_INTERVALS_PER_DAY - intervals.length,
  );
  const coveragePenalty =
    missingIntervalCount * preferences.missingIntervalPenalty;
  const penalties = {
    temperature: round(temperaturePenalty),
    rain: round(rainPenalty),
    wind: round(windPenalty),
    incompleteCoverage: round(coveragePenalty),
  };
  const totalPenalty = Object.values(penalties).reduce(
    (sum, penalty) => sum + penalty,
    0,
  );

  return {
    score: Math.round(clamp(100 - totalPenalty, 0, 100)),
    penalties,
    conditions: {
      averageTemperatureCelsius: round(average(temperatures)),
      minimumTemperatureCelsius: round(Math.min(...temperatures)),
      maximumTemperatureCelsius: round(Math.max(...temperatures)),
      totalRainfallMm: round(totalRainfallMm),
      rainyIntervalCount,
      averageWindSpeedKmh: round(average(windSpeeds)),
      maximumWindSpeedKmh: round(Math.max(...windSpeeds)),
      intervalCount: intervals.length,
      partialCoverage: missingIntervalCount > 0,
    },
  };
}

export function explainActivityPlacement(
  activity,
  result,
  { isBestDay, activitiesPerDay },
) {
  const { conditions } = result;
  const preferences = activity.preferences;
  const minimumTemperature = conditions.minimumTemperatureCelsius;
  const maximumTemperature = conditions.maximumTemperatureCelsius;
  let temperatureText;
  if (maximumTemperature < preferences.minimumTemperature) {
    temperatureText = `${minimumTemperature}–${maximumTemperature}°C temperatures are below its preferred ${preferences.minimumTemperature}–${preferences.maximumTemperature}°C range`;
  } else if (minimumTemperature > preferences.maximumTemperature) {
    temperatureText = `${minimumTemperature}–${maximumTemperature}°C temperatures are above its preferred ${preferences.minimumTemperature}–${preferences.maximumTemperature}°C range`;
  } else if (
    minimumTemperature < preferences.minimumTemperature ||
    maximumTemperature > preferences.maximumTemperature
  ) {
    temperatureText = `${minimumTemperature}–${maximumTemperature}°C temperatures are partly outside its preferred ${preferences.minimumTemperature}–${preferences.maximumTemperature}°C range`;
  } else {
    temperatureText = `${minimumTemperature}–${maximumTemperature}°C temperatures are within its preferred ${preferences.minimumTemperature}–${preferences.maximumTemperature}°C range`;
  }

  const rainText =
    conditions.rainyIntervalCount === 0
      ? "no rain appears in the available intervals"
      : `${conditions.totalRainfallMm} mm of rain appears across ${conditions.rainyIntervalCount} of ${conditions.intervalCount} intervals`;
  const windText =
    conditions.maximumWindSpeedKmh > preferences.maximumWindSpeedKmh
      ? `winds peak at ${conditions.maximumWindSpeedKmh} km/h, above its preferred ${preferences.maximumWindSpeedKmh} km/h limit`
      : `winds peak at ${conditions.maximumWindSpeedKmh} km/h`;
  const placementText = isBestDay
    ? "This is its highest-scoring forecast day."
    : `The optimiser placed it here to maximise the itinerary total while respecting the ${activitiesPerDay}-per-day capacity.`;
  const coverageText = conditions.partialCoverage
    ? " Incomplete forecast coverage reduced the score."
    : "";

  return `${placementText} ${temperatureText}; ${rainText}; and ${windText}.${coverageText}`;
}
