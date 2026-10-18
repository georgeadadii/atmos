import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_CATALOGUE,
  getActivity,
} from "../server/services/activityCatalogue.js";
import { scoreActivityForDay } from "../server/services/activityScoring.js";

function intervals({ temperature = 22, rainfall = 0, windSpeedKmh = 12, count = 8 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: index,
    temperature,
    minimum: temperature,
    maximum: temperature,
    rainfall,
    windSpeedKmh,
    condition: { name: "Clear", description: "clear sky", icon: null },
  }));
}

test("ideal weather produces a high, deterministic, bounded score", () => {
  const activity = getActivity("beach");
  const forecast = intervals({ temperature: 25, windSpeedKmh: 10 });
  const first = scoreActivityForDay(activity, forecast);
  const second = scoreActivityForDay(activity, forecast);

  assert.deepEqual(first, second);
  assert.equal(first.score, 100);
  assert.ok(first.score >= 0 && first.score <= 100);
});

test("rain, cold, and high winds apply activity-specific outdoor penalties", () => {
  const rainyBeach = scoreActivityForDay(
    getActivity("beach"),
    intervals({ rainfall: 2 }),
  );
  const coldBeach = scoreActivityForDay(
    getActivity("beach"),
    intervals({ temperature: 5 }),
  );
  const windyHike = scoreActivityForDay(
    getActivity("hiking"),
    intervals({ windSpeedKmh: 60 }),
  );

  assert.ok(rainyBeach.score < 50);
  assert.ok(coldBeach.score < 50);
  assert.ok(windyHike.score < 50);
});

test("museums remain relatively suitable in poor weather", () => {
  const forecast = intervals({
    temperature: 4,
    rainfall: 3,
    windSpeedKmh: 65,
  });
  const museum = scoreActivityForDay(getActivity("museums"), forecast);
  const beach = scoreActivityForDay(getActivity("beach"), forecast);

  assert.ok(museum.score >= 80);
  assert.ok(museum.score > beach.score);
});

test("scores clamp to zero and partial coverage is not treated as favourable", () => {
  const activity = getActivity("hiking");
  const extreme = scoreActivityForDay(
    activity,
    intervals({ temperature: 45, rainfall: 20, windSpeedKmh: 120 }),
  );
  const complete = scoreActivityForDay(activity, intervals({ count: 8 }));
  const partial = scoreActivityForDay(activity, intervals({ count: 3 }));

  assert.equal(extreme.score, 0);
  assert.ok(partial.score < complete.score);
  assert.ok(partial.penalties.incompleteCoverage > 0);
});

test("the catalogue has unique identifiers and complete weather preferences", () => {
  assert.equal(ACTIVITY_CATALOGUE.length, 12);
  assert.equal(
    new Set(ACTIVITY_CATALOGUE.map((activity) => activity.id)).size,
    ACTIVITY_CATALOGUE.length,
  );
  for (const activity of ACTIVITY_CATALOGUE) {
    assert.ok(["indoor", "outdoor"].includes(activity.environment));
    assert.ok(
      activity.preferences.minimumTemperature <
        activity.preferences.maximumTemperature,
    );
    assert.ok(activity.preferences.rainPenaltyPerMillimetre >= 0);
    assert.ok(activity.preferences.maximumWindSpeedKmh > 0);
    for (const forecast of [
      intervals(),
      intervals({ temperature: -20, rainfall: 25, windSpeedKmh: 150 }),
    ]) {
      const { score } = scoreActivityForDay(activity, forecast);
      assert.ok(score >= 0 && score <= 100);
    }
  }
});
