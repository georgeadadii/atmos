import { AppError } from "../errors.js";
import { addLocalDays, localDate, localDateTime } from "./time.js";

const round = (value, places = 1) => Number(value.toFixed(places));

function optionalNumber(value, { minimum = -Infinity, maximum = Infinity } = {}) {
  return Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function parseInterval(interval) {
  const timestamp = interval?.dt;
  const rain = interval?.rain;
  const measuredRainfall = optionalNumber(rain?.["3h"], { minimum: 0 });
  const rainfall = measuredRainfall ?? 0;
  const condition = interval?.weather?.[0];
  const temperature = interval?.main?.temp;
  const minimum = interval?.main?.temp_min ?? temperature;
  const maximum = interval?.main?.temp_max ?? temperature;

  if (
    !Number.isFinite(timestamp) ||
    !Number.isFinite(timestamp * 1000) ||
    Number.isNaN(new Date(timestamp * 1000).getTime()) ||
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
    timestamp,
    temperature,
    minimum,
    maximum,
    windSpeedKmh: interval.wind.speed * 3.6,
    rainfall,
    feelsLikeCelsius: optionalNumber(interval?.main?.feels_like),
    precipitationProbabilityPercent:
      optionalNumber(interval?.pop, { minimum: 0, maximum: 1 }) === null
        ? null
        : round(interval.pop * 100),
    rainfallMm: rain === undefined ? 0 : measuredRainfall,
    windGustKmh:
      optionalNumber(interval?.wind?.gust, { minimum: 0 }) === null
        ? null
        : round(interval.wind.gust * 3.6),
    windDirectionDegrees: optionalNumber(interval?.wind?.deg, {
      minimum: 0,
      maximum: 360,
    }),
    humidityPercent: optionalNumber(interval?.main?.humidity, {
      minimum: 0,
      maximum: 100,
    }),
    cloudCoveragePercent: optionalNumber(interval?.clouds?.all, {
      minimum: 0,
      maximum: 100,
    }),
    pressureHpa: optionalNumber(interval?.main?.pressure, { minimum: 0 }),
    visibilityMetres: optionalNumber(interval?.visibility, { minimum: 0 }),
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
  const dates = [1, 2, 3].map((days) => addLocalDays(today, days));
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
    if (dateSet.has(date)) {
      const forecastAt = localDateTime(
        interval.timestamp,
        timezoneOffsetSeconds,
      );
      grouped.get(date).push({
        ...interval,
        forecastAt,
        localTime: forecastAt.slice(11, 16),
      });
    }
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
      periods: intervals.map((interval) => ({
        forecastAt: interval.forecastAt,
        localTime: interval.localTime,
        temperatureCelsius: interval.temperature,
        feelsLikeCelsius: interval.feelsLikeCelsius,
        precipitationProbabilityPercent:
          interval.precipitationProbabilityPercent,
        rainfallMm: interval.rainfallMm,
        windSpeedKmh: round(interval.windSpeedKmh),
        windGustKmh: interval.windGustKmh,
        windDirectionDegrees: interval.windDirectionDegrees,
        humidityPercent: interval.humidityPercent,
        cloudCoveragePercent: interval.cloudCoveragePercent,
        pressureHpa: interval.pressureHpa,
        visibilityMetres: interval.visibilityMetres,
        condition: interval.condition,
      })),
    };
  });

  const intervalsByDate = Object.fromEntries(
    dates.map((date) => [date, [...grouped.get(date)]]),
  );
  const intervals = dates.flatMap((date) => intervalsByDate[date]);
  const warnings = [];
  if (days.some((day) => day.intervalCount < 8)) {
    warnings.push(
      "One or more days contain fewer than eight three-hour forecast intervals; summaries use the available intervals only.",
    );
  }
  if (ignoredMalformedIntervals > 0) {
    warnings.push(
      `${ignoredMalformedIntervals} malformed forecast interval(s) were excluded.`,
    );
  }

  return {
    days,
    intervals,
    intervalsByDate,
    dates,
    timezoneOffsetSeconds,
    warnings,
  };
}
