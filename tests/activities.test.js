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
  assert.equal(body.activities.length, 6);
  assert.deepEqual(Object.keys(body.activities[0]), [
    "id",
    "name",
    "description",
    "environment",
  ]);
  assert.equal("preferences" in body.activities[0], false);
});
