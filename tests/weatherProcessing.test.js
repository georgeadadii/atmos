import assert from "node:assert/strict";
import test from "node:test";

import { processForecast } from "../server/services/weatherProcessing.js";
import { forecastPayload, NOW, weatherInterval } from "./helpers.js";

test("forecast groups intervals into three destination-local days and aggregates values", () => {
  const result = processForecast(forecastPayload(), { now: NOW });
  assert.deepEqual(result.days.map((day) => day.date), [
    "2026-01-11",
    "2026-01-12",
    "2026-01-13",
  ]);
  const { periods, ...summary } = result.days[0];
  assert.deepEqual(summary, {
    date: "2026-01-11",
    minimumTemperatureCelsius: 6,
    maximumTemperatureCelsius: 9,
    averageWindSpeedKmh: 10.8,
    totalRainfallMm: 1.2,
    representativeCondition: {
      name: "Clouds",
      description: "scattered clouds",
      icon: "03d",
    },
    intervalCount: 2,
  });
  assert.equal(periods.length, 2);
  assert.equal(result.intervals.some(({ timestamp }) => timestamp === Date.parse("2026-01-10T12:00:00Z") / 1000), false);
});

test("forecast uses destination offset rather than machine timezone", () => {
  const payload = {
    city: { timezone: 7_200 },
    list: [
      weatherInterval("2026-01-10T22:00:00Z"),
      weatherInterval("2026-01-11T22:00:00Z"),
      weatherInterval("2026-01-12T22:00:00Z"),
    ],
  };
  const result = processForecast(payload, {
    now: Date.parse("2026-01-09T23:00:00Z"),
  });
  assert.deepEqual(result.days.map((day) => day.date), [
    "2026-01-11",
    "2026-01-12",
    "2026-01-13",
  ]);
  assert.equal(result.days[0].periods[0].forecastAt, "2026-01-11T00:00:00+02:00");
  assert.equal(result.days[0].periods[0].localTime, "00:00");
});

test("missing rain contributes zero and malformed records are disclosed", () => {
  const payload = forecastPayload();
  payload.list.push({ dt: 1, main: {} });
  const result = processForecast(payload, { now: NOW });
  assert.equal(result.days[1].totalRainfallMm, 0);
  assert.match(result.warnings.at(-1), /1 malformed/);
});

test("forecast retains all eight intervals in a complete future day", () => {
  const payload = forecastPayload();
  payload.list = payload.list.filter((item) => item.dt >= Date.parse("2026-01-12") / 1000);
  for (let hour = 0; hour < 24; hour += 3) {
    payload.list.push(weatherInterval(`2026-01-11T${String(hour).padStart(2, "0")}:00:00Z`));
  }
  const result = processForecast(payload, { now: NOW });
  assert.equal(result.days[0].intervalCount, 8);
});

test("detailed periods are chronological and map available measurements", () => {
  const payload = forecastPayload();
  payload.list = [
    weatherInterval("2026-01-11T15:00:00Z", { temperature: 8 }),
    weatherInterval("2026-01-11T12:00:00Z", {
      temperature: -1.5,
      feelsLike: -4,
      precipitationProbability: 0.375,
      rain: 1.25,
      windSpeed: 3,
      windGust: 5,
      windDirection: 225,
      humidity: 78,
      cloudCoverage: 85,
      pressure: 1013,
      visibility: 9_500,
    }),
    weatherInterval("2026-01-12T00:00:00Z"),
    weatherInterval("2026-01-13T00:00:00Z"),
  ];

  const result = processForecast(payload, { now: NOW });
  assert.deepEqual(result.days[0].periods.map((period) => period.localTime), [
    "12:00",
    "15:00",
  ]);
  assert.deepEqual(result.days[0].periods[0], {
    forecastAt: "2026-01-11T12:00:00+00:00",
    localTime: "12:00",
    temperatureCelsius: -1.5,
    feelsLikeCelsius: -4,
    precipitationProbabilityPercent: 37.5,
    rainfallMm: 1.25,
    windSpeedKmh: 10.8,
    windGustKmh: 18,
    windDirectionDegrees: 225,
    humidityPercent: 78,
    cloudCoveragePercent: 85,
    pressureHpa: 1013,
    visibilityMetres: 9_500,
    condition: {
      name: "Clouds",
      description: "scattered clouds",
      icon: "03d",
    },
  });
});

test("missing and malformed optional measurements remain unavailable", () => {
  const payload = forecastPayload();
  Object.assign(payload.list[1].main, {
    feels_like: Number.NaN,
    humidity: 101,
    pressure: "1013",
  });
  Object.assign(payload.list[1], {
    pop: 1.2,
    visibility: -1,
    clouds: { all: Number.POSITIVE_INFINITY },
    rain: { "3h": "unknown" },
  });
  Object.assign(payload.list[1].wind, { gust: -2, deg: 361 });

  const result = processForecast(payload, { now: NOW });
  const period = result.days[0].periods[0];
  assert.equal(result.days[0].periods.length, 2);
  assert.equal(period.feelsLikeCelsius, null);
  assert.equal(period.precipitationProbabilityPercent, null);
  assert.equal(period.rainfallMm, null);
  assert.equal(period.windGustKmh, null);
  assert.equal(period.windDirectionDegrees, null);
  assert.equal(period.humidityPercent, null);
  assert.equal(period.cloudCoveragePercent, null);
  assert.equal(period.pressureHpa, null);
  assert.equal(period.visibilityMetres, null);
});

test("destination offset groups periods across UTC date boundaries", () => {
  const payload = {
    city: { timezone: -18_000 },
    list: [
      weatherInterval("2026-01-12T02:00:00Z"),
      weatherInterval("2026-01-12T08:00:00Z"),
      weatherInterval("2026-01-13T08:00:00Z"),
    ],
  };
  const result = processForecast(payload, {
    now: Date.parse("2026-01-10T06:00:00Z"),
  });
  assert.equal(result.days[0].periods[0].localTime, "21:00");
  assert.equal(result.days[0].periods[0].forecastAt, "2026-01-11T21:00:00-05:00");
  assert.deepEqual(result.days.map((day) => day.periods.length), [1, 1, 1]);
});

test("forecast rejects malformed and insufficient data", () => {
  assert.throws(() => processForecast({ list: [] }, { now: NOW }), {
    code: "INVALID_FORECAST_DATA",
  });
  assert.throws(
    () =>
      processForecast(
        { city: { timezone: 0 }, list: [weatherInterval("2026-01-11T12:00:00Z")] },
        { now: NOW },
      ),
    { code: "INSUFFICIENT_FORECAST_DATA" },
  );
});

test("forecast excludes timestamps outside the supported date range", () => {
  const payload = forecastPayload();
  payload.list.push(weatherInterval("2026-01-11T18:00:00Z"));
  payload.list.at(-1).dt = Number.MAX_VALUE;
  const result = processForecast(payload, { now: NOW });
  assert.match(result.warnings.at(-1), /1 malformed/);
  assert.equal(result.days[0].periods.length, 2);
});

test("a query just before destination-local midnight still starts with tomorrow", () => {
  const payload = {
    city: { timezone: -18_000 },
    list: [
      weatherInterval("2026-01-11T04:30:00Z"),
      weatherInterval("2026-01-11T05:00:00Z"),
      weatherInterval("2026-01-12T05:00:00Z"),
      weatherInterval("2026-01-13T05:00:00Z"),
    ],
  };
  const result = processForecast(payload, {
    now: Date.parse("2026-01-11T04:59:59Z"),
  });

  assert.deepEqual(result.dates, ["2026-01-11", "2026-01-12", "2026-01-13"]);
  assert.equal(result.intervals.some(({ timestamp }) => timestamp === Date.parse("2026-01-11T04:30:00Z") / 1000), false);
});
