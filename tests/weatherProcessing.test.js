import assert from "node:assert/strict";
import test from "node:test";

import { processForecast } from "../server/services/weatherProcessing.js";
import { forecastPayload, NOW, weatherInterval } from "./helpers.js";

test("forecast groups intervals into three destination-local days and aggregates values", () => {
  const result = processForecast(forecastPayload(), { now: NOW });
  assert.deepEqual(result.days.map((day) => day.date), [
    "2026-01-10",
    "2026-01-11",
    "2026-01-12",
  ]);
  assert.deepEqual(result.days[0], {
    date: "2026-01-10",
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
    partialCoverage: true,
  });
});

test("forecast uses destination offset rather than machine timezone", () => {
  const payload = {
    city: { timezone: 7_200 },
    list: [
      weatherInterval("2026-01-09T22:00:00Z"),
      weatherInterval("2026-01-10T22:00:00Z"),
      weatherInterval("2026-01-11T22:00:00Z"),
    ],
  };
  const result = processForecast(payload, {
    now: Date.parse("2026-01-09T23:00:00Z"),
  });
  assert.deepEqual(result.days.map((day) => day.date), [
    "2026-01-10",
    "2026-01-11",
    "2026-01-12",
  ]);
});

test("missing rain contributes zero and malformed records are disclosed", () => {
  const payload = forecastPayload();
  payload.list.push({ dt: 1, main: {} });
  const result = processForecast(payload, { now: NOW });
  assert.equal(result.days[1].totalRainfallMm, 0);
  assert.match(result.warnings.at(-1), /1 malformed/);
});

test("forecast marks a full eight-interval day as complete", () => {
  const payload = forecastPayload();
  payload.list = payload.list.filter((item) => item.dt >= Date.parse("2026-01-11") / 1000);
  for (let hour = 0; hour < 24; hour += 3) {
    payload.list.push(weatherInterval(`2026-01-10T${String(hour).padStart(2, "0")}:00:00Z`));
  }
  const result = processForecast(payload, { now: NOW });
  assert.equal(result.days[0].intervalCount, 8);
  assert.equal(result.days[0].partialCoverage, false);
});

test("forecast rejects malformed and insufficient data", () => {
  assert.throws(() => processForecast({ list: [] }, { now: NOW }), {
    code: "INVALID_FORECAST_DATA",
  });
  assert.throws(
    () =>
      processForecast(
        { city: { timezone: 0 }, list: [weatherInterval("2026-01-10T12:00:00Z")] },
        { now: NOW },
      ),
    { code: "INSUFFICIENT_FORECAST_DATA" },
  );
});
