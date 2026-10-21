import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPollutant,
  POLLUTANTS,
  processAirQuality,
  SEVERITY_GUIDANCE,
} from "../server/services/airQuality.js";
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

test("every exact Good/Fair boundary is inclusive in Fair", async (context) => {
  for (const [pollutant, metadata] of Object.entries(POLLUTANTS)) {
    await context.test(pollutant, () => {
      const boundary = metadata.boundaries[0];
      assert.equal(classifyPollutant(pollutant, boundary - 0.001), "Good");
      assert.equal(classifyPollutant(pollutant, boundary), "Fair");
    });
  }
});

test("classification covers all five half-open severities", () => {
  assert.equal(classifyPollutant("no2", 39.999), "Good");
  assert.equal(classifyPollutant("no2", 40), "Fair");
  assert.equal(classifyPollutant("no2", 70), "Moderate");
  assert.equal(classifyPollutant("no2", 150), "Poor");
  assert.equal(classifyPollutant("no2", 200), "Very Poor");
  assert.deepEqual(Object.keys(SEVERITY_GUIDANCE), [
    "Fair",
    "Moderate",
    "Poor",
    "Very Poor",
  ]);
  assert.equal(new Set(Object.values(SEVERITY_GUIDANCE)).size, 4);
});

test("all classified pollutants below Good boundaries produce the honest no-warning state", () => {
  const result = processAirQuality(goodCurrent(), goodForecast(), context);
  assert.deepEqual(result.current.warnings, []);
  assert.deepEqual(result.forecast.warnings, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.forecast.maxima.length, 6);
});

test("current-only elevation includes source-specific threshold, time and health details", () => {
  const current = pollutionPayload([
    pollutionReading("2026-01-10T10:00:00Z", {
      ...goodComponents,
      so2: 20,
    }),
  ]);
  const result = processAirQuality(current, goodForecast(), context);

  assert.equal(result.current.warnings.length, 1);
  assert.deepEqual(result.forecast.warnings, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].forecast, null);
  assert.deepEqual(result.warnings[0].current, {
    pollutant: "so2",
    name: "Sulphur dioxide (SO₂)",
    concentration: 20,
    unit: "µg/m³",
    goodBoundary: 20,
    severity: "Fair",
    amountAboveGoodBoundary: 0,
    percentageAboveGoodBoundary: 0,
    observedAt: "2026-01-10T10:00:00+00:00",
    healthRisk: `${POLLUTANTS.so2.healthEffect} ${SEVERITY_GUIDANCE.Fair}`,
  });
});

test("forecast-only elevation reports the peak inside the selected travel window", () => {
  const forecast = pollutionPayload([
    pollutionReading("2026-01-11T12:00:00Z", {
      ...goodComponents,
      pm2_5: 30,
    }),
  ]);
  const result = processAirQuality(goodCurrent(), forecast, context);

  assert.deepEqual(result.current.warnings, []);
  assert.equal(result.forecast.warnings.length, 1);
  assert.equal(result.warnings[0].current, null);
  assert.equal(result.warnings[0].forecast.severity, "Moderate");
  assert.equal(result.warnings[0].forecast.amountAboveGoodBoundary, 20);
  assert.equal(result.warnings[0].forecast.percentageAboveGoodBoundary, 200);
  assert.equal(
    result.warnings[0].forecast.expectedAt,
    "2026-01-11T12:00:00+00:00",
  );
});

test("the same elevated pollutant is combined without hiding either period or peak severity", () => {
  const current = pollutionPayload([
    pollutionReading("2026-01-10T10:00:00Z", {
      ...goodComponents,
      o3: 75,
    }),
  ]);
  const forecast = pollutionPayload([
    pollutionReading("2026-01-12T16:00:00Z", {
      ...goodComponents,
      o3: 145,
    }),
  ]);
  const result = processAirQuality(current, forecast, context);

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].peakSeverity, "Poor");
  assert.equal(result.warnings[0].current.severity, "Fair");
  assert.equal(result.warnings[0].forecast.severity, "Poor");
  assert.notEqual(
    result.warnings[0].current.healthRisk,
    result.warnings[0].forecast.healthRisk,
  );
});

test("multiple elevated pollutants create one combined warning per pollutant", () => {
  const current = pollutionPayload([
    pollutionReading("2026-01-10T10:00:00Z", {
      ...goodComponents,
      co: 5000,
      no2: 75,
    }),
  ]);
  const forecast = pollutionPayload([
    pollutionReading("2026-01-11T12:00:00Z", {
      ...goodComponents,
      co: 16000,
      pm10: 100,
    }),
  ]);
  const result = processAirQuality(current, forecast, context);

  assert.deepEqual(
    result.warnings.map((warning) => warning.pollutant),
    ["no2", "pm10", "co"],
  );
  assert.equal(result.warnings.find((warning) => warning.pollutant === "co").peakSeverity, "Very Poor");
});

test("NO and NH3 remain measurements without invented classifications", () => {
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
  assert.equal(result.warnings.some(({ pollutant }) => pollutant === "nh3"), false);
  assert.throws(() => classifyPollutant("no", 10), {
    code: "INVALID_POLLUTION_DATA",
  });
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
  assert.equal(result.forecast.readingCount, 1);
  assert.equal(result.forecast.warnings.length, 0);
  assert.equal(result.forecast.coverage.complete, false);
  assert.equal(result.limitations.length, 1);
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
