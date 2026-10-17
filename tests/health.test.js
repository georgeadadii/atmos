import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { app } from "../server/index.js";

test("GET /api/health returns the Atmos service status", async (context) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  context.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/health`,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "atmos",
  });
});
