import assert from "node:assert/strict";
import test from "node:test";

import { processAirQuality } from "../server/services/airQuality.js";
import {
  goodComponents,
  pollutionPayload,
  pollutionReading,
} from "./helpers.js";

const context = {
  dates: ["2026-01-10", "2026-01-11", "2026-01-12"],
  timezoneOffsetSeconds: 0,
};
const goodCurrent = () => pollutionPayload([
  pollutionReading("2026-01-10T10:00:00Z"),
]);
const goodForecast = () => pollutionPayload([
  pollutionReading("2026-01-10T11:00:00Z"),
  pollutionReading("2026-01-12T23:00:00Z"),
]);

test("air-quality processing returns raw observations and forecast maxima", () => {
  const result = processAirQuality(goodCurrent(), goodForecast(), context);

  assert.equal(result.current.observedAt, "2026-01-10T10:00:00+00:00");
  assert.equal(result.current.aqi, 1);
  assert.equal(result.current.aqiClassification, "Good");
  assert.deepEqual(result.current.components.o3, {
    concentration: 30,
    unit: "µg/m³",
  });
  assert.equal(result.forecast.maxima.length, 6);
  assert.deepEqual(
    result.forecast.maxima.find(({ pollutant }) => pollutant === "o3"),
    {
      pollutant: "o3",
      name: "Ozone (O₃)",
      concentration: 30,
      unit: "µg/m³",
      expectedAt: "2026-01-10T11:00:00+00:00",
    },
  );
  assert.equal(result.warnings, undefined);
  assert.equal(result.current.warnings, undefined);
  assert.equal(result.forecast.warnings, undefined);
});

test("forecast maxima retain peak values and their timestamps without classifications", () => {
  const forecast = pollutionPayload([
    pollutionReading("2026-01-10T11:00:00Z", { ...goodComponents, o3: 75 }),
    pollutionReading("2026-01-12T16:00:00Z", { ...goodComponents, o3: 145 }),
  ]);
  const result = processAirQuality(goodCurrent(), forecast, context);
  const ozone = result.forecast.maxima.find(({ pollutant }) => pollutant === "o3");

  assert.deepEqual(ozone, {
    pollutant: "o3",
    name: "Ozone (O₃)",
    concentration: 145,
    unit: "µg/m³",
    expectedAt: "2026-01-12T16:00:00+00:00",
  });
  assert.equal(ozone.classification, undefined);
  assert.equal(ozone.goodThreshold, undefined);
});

test("OpenWeather AQI values retain their provider classifications", async (testContext) => {
  for (const [aqi, classification] of [
    [1, "Good"],
    [2, "Fair"],
    [3, "Moderate"],
    [4, "Poor"],
    [5, "Very Poor"],
  ]) {
    await testContext.test(classification, () => {
      const current = pollutionPayload([
        pollutionReading("2026-01-10T10:00:00Z", goodComponents, aqi),
      ]);
      assert.equal(
        processAirQuality(current, goodForecast(), context).current.aqiClassification,
        classification,
      );
    });
  }
});

test("NO and NH3 remain current measurements but are not forecast maxima", () => {
  const result = processAirQuality(goodCurrent(), goodForecast(), context);
  assert.deepEqual(result.current.components.no, {
    concentration: 1,
    unit: "µg/m³",
  });
  assert.deepEqual(result.current.components.nh3, {
    concentration: 1,
    unit: "µg/m³",
  });
  assert.equal(result.forecast.maxima.some(({ pollutant }) => pollutant === "no"), false);
  assert.equal(result.forecast.maxima.some(({ pollutant }) => pollutant === "nh3"), false);
});

test("air-quality processing only uses forecast readings inside the selected local dates", () => {
  const result = processAirQuality(
    goodCurrent(),
    pollutionPayload([
      pollutionReading("2026-01-09T23:00:00Z", { ...goodComponents, o3: 200 }),
      pollutionReading("2026-01-11T12:00:00Z"),
      pollutionReading("2026-01-13T00:00:00Z", { ...goodComponents, o3: 200 }),
    ]),
    context,
  );
  const ozone = result.forecast.maxima.find(({ pollutant }) => pollutant === "o3");

  assert.equal(result.forecast.readingCount, 1);
  assert.equal(ozone.concentration, 30);
  assert.equal(result.forecast.coverage.complete, false);
  assert.equal(result.limitations.length, 1);
});

test("air-quality boundaries use destination-local midnights and exclude the current day", () => {
  const result = processAirQuality(
    goodCurrent(),
    pollutionPayload([
      pollutionReading("2026-01-10T21:59:00Z", { ...goodComponents, o3: 200 }),
      pollutionReading("2026-01-10T22:00:00Z", { ...goodComponents, o3: 80 }),
      pollutionReading("2026-01-13T21:59:00Z", { ...goodComponents, o3: 90 }),
      pollutionReading("2026-01-13T22:00:00Z", { ...goodComponents, o3: 210 }),
    ]),
    {
      dates: ["2026-01-11", "2026-01-12", "2026-01-13"],
      timezoneOffsetSeconds: 7_200,
    },
  );
  const ozone = result.forecast.maxima.find(({ pollutant }) => pollutant === "o3");

  assert.equal(result.forecast.readingCount, 2);
  assert.equal(ozone.concentration, 90);
  assert.equal(ozone.expectedAt, "2026-01-13T23:59:00+02:00");
});

test("complete forecast coverage is preserved as aggregation metadata", () => {
  const result = processAirQuality(
    goodCurrent(),
    pollutionPayload([
      pollutionReading("2026-01-10T00:00:00Z"),
      pollutionReading("2026-01-12T23:00:00Z"),
    ]),
    context,
  );

  assert.deepEqual(result.forecast.coverage, {
    complete: true,
    firstReadingAt: "2026-01-10T00:00:00+00:00",
    lastReadingAt: "2026-01-12T23:00:00+00:00",
  });
});

test("malformed readings are rejected or disclosed when valid forecast data remains", () => {
  assert.throws(
    () => processAirQuality({}, pollutionPayload([]), context),
    { code: "INVALID_POLLUTION_DATA" },
  );
  const malformedCurrent = pollutionReading("2026-01-10T10:00:00Z");
  malformedCurrent.components.nh3 = -1;
  assert.throws(
    () => processAirQuality(
      pollutionPayload([malformedCurrent]),
      goodForecast(),
      context,
    ),
    { code: "INVALID_POLLUTION_DATA" },
  );
  assert.throws(
    () => processAirQuality(goodCurrent(), pollutionPayload([{ dt: 1 }]), context),
    { code: "INSUFFICIENT_POLLUTION_DATA" },
  );

  const malformed = pollutionReading("2026-01-11T11:00:00Z");
  malformed.components.pm10 = Number.NaN;
  const result = processAirQuality(
    goodCurrent(),
    pollutionPayload([
      malformed,
      pollutionReading("2026-01-11T12:00:00Z"),
    ]),
    context,
  );
  assert.match(result.limitations.at(-1), /1 malformed/);
});
