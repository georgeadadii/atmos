import assert from "node:assert/strict";
import test from "node:test";

import { optimiseItinerary } from "../server/services/itineraryPlanner.js";

const activities = ["beach", "museums", "hiking"].map((id) => ({ id }));
const result = (score) => ({ score });

test("the optimiser finds the known optimal assignment rather than sequential placement", () => {
  const scores = {
    beach: [result(10), result(95), result(20)],
    museums: [result(90), result(89), result(88)],
    hiking: [result(80), result(10), result(100)],
  };
  const plan = optimiseItinerary(activities, scores, 1);
  const naiveSequentialScore = 10 + 89 + 100;

  assert.deepEqual(plan.assignments, { beach: 1, hiking: 2, museums: 0 });
  assert.equal(plan.totalScore, 285);
  assert.ok(plan.totalScore > naiveSequentialScore);
  assert.equal(plan.overallScore, 95);
});

test("all activities are scheduled once and daily capacity is respected", () => {
  const sixActivities = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
  const scores = Object.fromEntries(
    sixActivities.map(({ id }, index) => [
      id,
      [result(90 - index), result(80 + index), result(70)],
    ]),
  );
  const plan = optimiseItinerary(sixActivities, scores, 2);
  const assignedDays = Object.values(plan.assignments);

  assert.equal(assignedDays.length, 6);
  assert.equal(new Set(Object.keys(plan.assignments)).size, 6);
  for (const dayIndex of [0, 1, 2]) {
    assert.ok(assignedDays.filter((day) => day === dayIndex).length <= 2);
  }
});

test("rain-sensitive activities favour dry days while indoor activities use rainy days", () => {
  const scores = {
    beach: [result(20), result(98), result(30)],
    museums: [result(95), result(96), result(94)],
    hiking: [result(15), result(70), result(99)],
  };
  const plan = optimiseItinerary(activities, scores, 1);

  assert.deepEqual(plan.assignments, { beach: 1, hiking: 2, museums: 0 });
});

test("tie-breaking is deterministic and independent of input ordering", () => {
  const scores = {
    beach: [result(100), result(100), result(100)],
    museums: [result(100), result(100), result(100)],
    hiking: [result(100), result(100), result(100)],
  };
  const first = optimiseItinerary(activities, scores, 1);
  const second = optimiseItinerary([...activities].reverse(), scores, 1);

  assert.deepEqual(first, second);
  assert.deepEqual(first.assignments, { beach: 0, hiking: 1, museums: 2 });
});
