import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPollutant,
  POLLUTANTS,
  processAirQuality,
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
const current = pollutionPayload([
  pollutionReading("2026-01-10T10:00:00Z"),
]);

test("all pollutant values below Good thresholds produce no warning", () => {
  const result = processAirQuality(
    current,
    pollutionPayload([
      pollutionReading("2026-01-10T11:00:00Z"),
      pollutionReading("2026-01-12T23:00:00Z"),
    ]),
    context,
  );
  assert.equal(result.forecast.warnings.length, 0);
  assert.equal(result.forecast.maxima.length, 6);
  assert.equal(result.current.components.nh3.unit, "µg/m³");
});

test("one and multiple elevated pollutants include threshold details", () => {
  const components = { ...goodComponents, so2: 20, pm2_5: 30 };
  const result = processAirQuality(
    current,
    pollutionPayload([pollutionReading("2026-01-11T12:00:00Z", components, 3)]),
    context,
  );
  assert.deepEqual(
    result.forecast.warnings.map((warning) => warning.pollutant),
    ["so2", "pm2_5"],
  );
  assert.deepEqual(result.forecast.warnings[0], {
    pollutant: "so2",
    name: "Sulphur dioxide (SO₂)",
    concentration: 20,
    unit: "µg/m³",
    goodThreshold: 20,
    classification: "Fair",
    expectedAt: "2026-01-11T12:00:00+00:00",
    amountAboveGoodThreshold: 0,
    percentageAboveGoodThreshold: 0,
    risk: POLLUTANTS.so2.risk,
  });
  assert.equal(result.forecast.warnings[1].classification, "Moderate");
});

test("classification observes inclusive lower boundaries", () => {
  assert.equal(classifyPollutant("no2", 39.999), "Good");
  assert.equal(classifyPollutant("no2", 40), "Fair");
  assert.equal(classifyPollutant("no2", 70), "Moderate");
  assert.equal(classifyPollutant("no2", 150), "Poor");
  assert.equal(classifyPollutant("no2", 200), "Very Poor");
});

test("air-quality processing only uses readings inside the selected local dates", () => {
  const result = processAirQuality(
    current,
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

test("missing or malformed pollution data is rejected", () => {
  assert.throws(
    () => processAirQuality({}, pollutionPayload([]), context),
    { code: "INVALID_POLLUTION_DATA" },
  );
  assert.throws(
    () => processAirQuality(current, pollutionPayload([{ dt: 1 }]), context),
    { code: "INSUFFICIENT_POLLUTION_DATA" },
  );
});
