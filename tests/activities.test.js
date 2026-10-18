import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../server/index.js";
import { ACTIVITY_CATALOGUE } from "../server/services/activityCatalogue.js";

test("GET /api/activities returns the public activity catalogue", async (context) => {
  const server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/activities`,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.deepEqual(
    body.activities.map(({ id }) => id),
    ACTIVITY_CATALOGUE.map(({ id }) => id),
  );
  assert.equal(body.activities.length, 12);
  assert.equal(body.maximumSelectedActivities, 6);
  assert.deepEqual(Object.keys(body.activities[0]), [
    "id",
    "name",
    "description",
    "environment",
  ]);
  assert.equal("preferences" in body.activities[0], false);
  assert.equal("places" in body.activities[0], false);
});

test("the expanded catalogue preserves existing activities and valid unique definitions", () => {
  const identifiers = ACTIVITY_CATALOGUE.map(({ id }) => id);
  for (const existing of [
    "sightseeing",
    "beach",
    "hiking",
    "museums",
    "shopping",
    "outdoor-dining",
  ]) {
    assert.ok(identifiers.includes(existing));
  }
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const activity of ACTIVITY_CATALOGUE) {
    assert.ok(["indoor", "outdoor"].includes(activity.environment));
    assert.ok(activity.preferences.minimumTemperature < activity.preferences.maximumTemperature);
    assert.ok(["nearby", "text"].includes(activity.places.method));
    assert.ok(activity.places.strongTypes.length > 0);
  }
});
