import assert from "node:assert/strict";
import test from "node:test";

import {
  createPackingRecommendations,
  temperatureCategory,
} from "../server/services/packingRecommendations.js";

const interval = (temperature, rainfall = 0) => ({ temperature, rainfall });

test("temperature boundaries use the assignment's exact classifications", () => {
  assert.equal(temperatureCategory(7.9), "Cold");
  assert.equal(temperatureCategory(8), "Mild");
  assert.equal(temperatureCategory(24), "Mild");
  assert.equal(temperatureCategory(24.1), "Hot");
});

test("packing recommendations support cold, mild, hot, and mixed conditions", () => {
  const result = createPackingRecommendations([
    interval(7.9),
    interval(8),
    interval(24),
    interval(24.1),
  ]);
  assert.deepEqual(result.temperature.categories, ["Cold", "Mild", "Hot"]);
  assert.equal(result.temperature.mixedConditions, true);
  assert.equal(result.temperature.advice.length, 3);
});

test("umbrella advice checks rainfall in every interval", async (context) => {
  for (const [name, intervals, expected] of [
    ["none", [interval(12), interval(13)], false],
    ["first", [interval(12, 0.1), interval(13)], true],
    ["final", [interval(12), interval(13, 0.1)], true],
  ]) {
    await context.test(name, () => {
      assert.equal(
        createPackingRecommendations(intervals).umbrella.recommended,
        expected,
      );
    });
  }
});
