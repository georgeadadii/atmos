import { AppError } from "../errors.js";
import { addLocalDays, localDate } from "./time.js";

const round = (value, places = 1) => Number(value.toFixed(places));

function parseInterval(interval) {
  const rain = interval?.rain;
  const rainfall = rain === undefined ? 0 : rain?.["3h"];
  const condition = interval?.weather?.[0];
  const temperature = interval?.main?.temp;
  const minimum = interval?.main?.temp_min ?? temperature;
  const maximum = interval?.main?.temp_max ?? temperature;

  if (
    !Number.isFinite(interval?.dt) ||
    !Number.isFinite(temperature) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    !Number.isFinite(interval?.wind?.speed) ||
    interval.wind.speed < 0 ||
    !Number.isFinite(rainfall) ||
    rainfall < 0 ||
    typeof condition?.main !== "string" ||
    typeof condition?.description !== "string"
  ) {
    return null;
  }

  return {
    timestamp: interval.dt,
    temperature,
    minimum,
    maximum,
    windSpeedKmh: interval.wind.speed * 3.6,
    rainfall,
    condition: {
      name: condition.main,
      description: condition.description,
      icon: typeof condition.icon === "string" ? condition.icon : null,
    },
  };
}

function representativeCondition(intervals) {
  const counts = new Map();
  for (const interval of intervals) {
    const key = `${interval.condition.name}\0${interval.condition.description}`;
    const current = counts.get(key) ?? {
      count: 0,
      first: interval.timestamp,
      condition: interval.condition,
    };
    current.count += 1;
    counts.set(key, current);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)[0]
    .condition;
}

export function processForecast(payload, { now = Date.now() } = {}) {
  const timezoneOffsetSeconds = payload?.city?.timezone;
  if (
    !Number.isInteger(timezoneOffsetSeconds) ||
    timezoneOffsetSeconds < -64_800 ||
    timezoneOffsetSeconds > 64_800 ||
    !Array.isArray(payload?.list)
  ) {
    throw new AppError(
      "INVALID_FORECAST_DATA",
      "The weather service returned malformed forecast data.",
      502,
    );
  }

  const today = localDate(Math.floor(now / 1000), timezoneOffsetSeconds);
  const dates = [today, addLocalDays(today, 1), addLocalDays(today, 2)];
  const dateSet = new Set(dates);
  const grouped = new Map(dates.map((date) => [date, []]));
  let ignoredMalformedIntervals = 0;

  for (const rawInterval of payload.list) {
    const interval = parseInterval(rawInterval);
    if (!interval) {
      ignoredMalformedIntervals += 1;
      continue;
    }
    const date = localDate(interval.timestamp, timezoneOffsetSeconds);
    if (dateSet.has(date)) grouped.get(date).push(interval);
  }

  if (dates.some((date) => grouped.get(date).length === 0)) {
    throw new AppError(
      "INSUFFICIENT_FORECAST_DATA",
      "Forecast data is not available for all three destination-local days.",
      502,
    );
  }

  const days = dates.map((date) => {
    const intervals = grouped.get(date).sort((a, b) => a.timestamp - b.timestamp);
    return {
      date,
      minimumTemperatureCelsius: round(
        Math.min(...intervals.map((item) => item.minimum)),
      ),
      maximumTemperatureCelsius: round(
        Math.max(...intervals.map((item) => item.maximum)),
      ),
      averageWindSpeedKmh: round(
        intervals.reduce((sum, item) => sum + item.windSpeedKmh, 0) /
          intervals.length,
      ),
      totalRainfallMm: round(
        intervals.reduce((sum, item) => sum + item.rainfall, 0),
      ),
      representativeCondition: representativeCondition(intervals),
      intervalCount: intervals.length,
      partialCoverage: intervals.length < 8,
    };
  });

  const intervals = dates.flatMap((date) => grouped.get(date));
  const warnings = [];
  if (days.some((day) => day.partialCoverage)) {
    warnings.push(
      "One or more days contain fewer than eight three-hour forecast intervals and are marked as partial.",
    );
  }
  if (ignoredMalformedIntervals > 0) {
    warnings.push(
      `${ignoredMalformedIntervals} malformed forecast interval(s) were excluded.`,
    );
  }

  return { days, intervals, dates, timezoneOffsetSeconds, warnings };
}
