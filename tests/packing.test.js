import assert from "node:assert/strict";
import test from "node:test";

import {
  createPackingAdvice,
  rainfallLevel,
  RAINFALL_THRESHOLDS,
  temperatureCategory,
} from "../public/packing.js";

const DATES = ["2026-01-10", "2026-01-11", "2026-01-12"];

const interval = (temperature, rainfall = 0, extra = {}) => ({
  temperature,
  rainfall,
  ...extra,
});

const grouped = (first = [], second = [], third = []) => ({
  [DATES[0]]: first,
  [DATES[1]]: second,
  [DATES[2]]: third,
});

test("temperature boundaries use the assignment classifications", () => {
  assert.equal(temperatureCategory(7.9), "Cold");
  assert.equal(temperatureCategory(8), "Mild");
  assert.equal(temperatureCategory(24), "Mild");
  assert.equal(temperatureCategory(24.1), "Hot");
});

test("temperature classification safely handles invalid values", () => {
  for (const value of [undefined, null, "8", Number.NaN, Infinity, -Infinity]) {
    assert.equal(temperatureCategory(value), "Unavailable");
  }
});

test("daily rainfall levels use the application thresholds", () => {
  assert.deepEqual(RAINFALL_THRESHOLDS, {
    NONE_MM: 0,
    MODERATE_MIN_MM: 2.5,
    HEAVY_MIN_MM: 10,
  });
  for (const [amount, expected] of [
    [0, { id: "none", label: "None" }],
    [0.1, { id: "light", label: "Light" }],
    [2.49, { id: "light", label: "Light" }],
    [2.5, { id: "moderate", label: "Moderate" }],
    [9.99, { id: "moderate", label: "Moderate" }],
    [10, { id: "heavy", label: "Heavy" }],
  ]) {
    assert.deepEqual(rainfallLevel(amount), expected);
  }
});

test("invalid rainfall levels remain unavailable", () => {
  for (const value of [undefined, null, "0", -0.1, Number.NaN, Infinity]) {
    assert.deepEqual(rainfallLevel(value), {
      id: "unavailable",
      label: "Unavailable",
    });
  }
});

test("umbrella advice detects rain only on day one", () => {
  const result = createPackingAdvice(
    grouped([interval(12, 1, { forecastAt: "2026-01-10T09:00:00+00:00" })], [interval(13)], [interval(14)]),
    DATES,
  );
  assert.equal(result.umbrella.recommended, true);
  assert.match(result.umbrella.reason, /1 three-hour interval/);
  assert.match(result.umbrella.reason, /2026-01-10T09:00/);
});

test("umbrella advice detects rain only on day three", () => {
  const result = createPackingAdvice(
    grouped([interval(12)], [interval(13)], [interval(14, 2)]),
    DATES,
  );
  assert.equal(result.umbrella.recommended, true);
  assert.match(result.umbrella.reason, /2026-01-12/);
});

test("a single interval with 0.1 mm rainfall recommends an umbrella", () => {
  const result = createPackingAdvice(grouped([], [interval(18, 0.1)], []), DATES);
  assert.equal(result.umbrella.recommended, true);
  assert.match(result.umbrella.reason, /1 three-hour interval/);
});

test("all valid dry intervals do not recommend an umbrella", () => {
  const result = createPackingAdvice(
    grouped([interval(12)], [interval(13, 0)], [interval(14, 0)]),
    DATES,
  );
  assert.deepEqual(result.umbrella, {
    recommended: false,
    reason: "No rainfall is forecast in the selected intervals.",
  });
});

test("temperature advice is distinct and ordered Cold, Mild, Hot", () => {
  const result = createPackingAdvice(
    grouped([interval(25)], [interval(7)], [interval(12), interval(30), interval(-2)]),
    DATES,
  );
  assert.deepEqual(result.temperature.categories, ["Cold", "Mild", "Hot"]);
  assert.equal(result.temperature.mixedConditions, true);
});

test("single-category forecasts are not mixed", () => {
  const result = createPackingAdvice(
    grouped([interval(10)], [interval(20)], [interval(24)]),
    DATES,
  );
  assert.deepEqual(result.temperature.categories, ["Mild"]);
  assert.equal(result.temperature.mixedConditions, false);
});

test("missing intervals return safe fallback values", () => {
  const result = createPackingAdvice({}, DATES);
  assert.deepEqual(result, {
    umbrella: {
      recommended: false,
      reason: "Rainfall data is unavailable for the selected intervals.",
    },
    temperature: {
      categories: [],
      mixedConditions: false,
      advice: [],
    },
  });
});

test("invalid interval observations are ignored and disclosed", () => {
  const result = createPackingAdvice(grouped([
    interval(Number.NaN, Number.NaN),
    interval(Infinity, -1),
    interval("12", "0"),
    null,
  ]), DATES);
  assert.deepEqual(result.temperature.categories, []);
  assert.equal(result.temperature.mixedConditions, false);
  assert.equal(result.umbrella.recommended, false);
  assert.match(result.umbrella.reason, /unavailable/);
});

test("unavailable rainfall is not presented as confirmed dry weather", () => {
  const result = createPackingAdvice(
    grouped([
      interval(12, 0),
      interval(13, 0, { rainfallMm: null }),
    ]),
    DATES,
  );
  assert.equal(result.umbrella.recommended, false);
  assert.match(result.umbrella.reason, /available selected intervals/);
  assert.match(result.umbrella.reason, /unavailable for 1 interval/);
});

test("intervals outside the requested dates are ignored", () => {
  const intervalsByDate = {
    ...grouped([interval(12)], [interval(13)], [interval(14)]),
    "2026-01-13": [interval(30, 12)],
  };
  const result = createPackingAdvice(intervalsByDate, DATES);
  assert.equal(result.umbrella.recommended, false);
  assert.deepEqual(result.temperature.categories, ["Mild"]);
});

test("packing advice retains the existing category messages", () => {
  const result = createPackingAdvice(
    grouped([interval(7)], [interval(12)], [interval(25)]),
    DATES,
  );
  assert.deepEqual(result.temperature.advice, [
    {
      category: "Cold",
      message: "Pack warm layers and an insulated outer layer.",
    },
    {
      category: "Mild",
      message: "Pack light layers that can be adjusted through the day.",
    },
    {
      category: "Hot",
      message: "Pack lightweight clothing, sun protection, and water.",
    },
  ]);
});

test("packing advice does not mutate forecast data", () => {
  const intervalsByDate = grouped(
    [interval(25, 0)],
    [interval(7, 1)],
    [interval(12, 0)],
  );
  const before = structuredClone(intervalsByDate);
  createPackingAdvice(intervalsByDate, DATES);
  assert.deepEqual(intervalsByDate, before);
});
