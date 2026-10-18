import assert from "node:assert/strict";
import test from "node:test";

import { getActivity } from "../server/services/activityCatalogue.js";
import {
  CANDIDATE_LIMIT,
  createGooglePlacesClient,
  OUTDOOR_DINING_FIELD,
  PLACES_FIELD_MASK,
  SEARCH_RADIUS_METRES,
} from "../server/services/googlePlaces.js";

const destination = { latitude: 53.35, longitude: -6.26 };
const place = {
  id: "museum-1",
  displayName: { text: "Museum" },
  location: destination,
  types: ["museum"],
};

function response(status, payload, jsonError = false) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (jsonError) throw new SyntaxError("invalid");
      return payload;
    },
  };
}

test("Nearby Search uses the New API request, bounded radius and explicit field mask", async () => {
  let received;
  const client = createGooglePlacesClient({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      received = { url, options };
      return response(200, { places: [place] });
    },
  });
  const result = await client.search(getActivity("museums"), destination);
  const body = JSON.parse(received.options.body);
  assert.equal(received.url.href, "https://places.googleapis.com/v1/places:searchNearby");
  assert.equal(received.options.method, "POST");
  assert.equal(received.options.headers["X-Goog-FieldMask"], PLACES_FIELD_MASK);
  assert.equal(received.options.headers["X-Goog-Api-Key"], "test-key");
  assert.deepEqual(body.includedTypes, ["museum"]);
  assert.equal(body.maxResultCount, CANDIDATE_LIMIT);
  assert.equal(body.locationRestriction.circle.radius, SEARCH_RADIUS_METRES);
  assert.deepEqual(result.places, [place]);
});

test("Text Search uses pageSize, strict type filtering and a bounded rectangle", async () => {
  let body;
  let fieldMask;
  const client = createGooglePlacesClient({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      fieldMask = options.headers["X-Goog-FieldMask"];
      return response(200, { places: [] });
    },
  });
  await client.search(getActivity("outdoor-dining"), destination);
  assert.equal(body.textQuery, "outdoor dining");
  assert.equal(body.includedType, "restaurant");
  assert.equal(body.strictTypeFiltering, true);
  assert.equal(body.pageSize, CANDIDATE_LIMIT);
  assert.equal(fieldMask, `${PLACES_FIELD_MASK},${OUTDOOR_DINING_FIELD}`);
  assert.ok(body.locationRestriction.rectangle.low.latitude < destination.latitude);
  assert.ok(body.locationRestriction.rectangle.high.latitude > destination.latitude);
});

test("missing key, empty and malformed responses fail gracefully", async () => {
  let called = false;
  const missing = createGooglePlacesClient({ apiKey: "", fetchImpl: async () => { called = true; } });
  assert.equal((await missing.search(getActivity("museums"), destination)).code, "PLACES_NOT_CONFIGURED");
  assert.equal(called, false);

  const empty = createGooglePlacesClient({ apiKey: "key", fetchImpl: async () => response(200, { places: [] }) });
  assert.equal((await empty.search(getActivity("museums"), destination)).code, "PLACES_EMPTY");

  const malformed = createGooglePlacesClient({ apiKey: "key", fetchImpl: async () => response(200, [], false) });
  assert.equal((await malformed.search(getActivity("museums"), destination)).code, "PLACES_INVALID_RESPONSE");
});

test("authentication, quota, network and timeout failures are distinguished", async () => {
  for (const [status, code] of [[400, "PLACES_AUTHENTICATION_FAILED"], [403, "PLACES_AUTHENTICATION_FAILED"], [429, "PLACES_RATE_LIMITED"], [500, "PLACES_API_FAILURE"]]) {
    const client = createGooglePlacesClient({ apiKey: "key", fetchImpl: async () => response(status, {}) });
    assert.equal((await client.search(getActivity("museums"), destination)).code, code);
  }
  const network = createGooglePlacesClient({ apiKey: "key", fetchImpl: async () => { throw new Error("network"); } });
  assert.equal((await network.search(getActivity("museums"), destination)).code, "PLACES_NETWORK_ERROR");

  const timeout = createGooglePlacesClient({
    apiKey: "key",
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });
  assert.equal((await timeout.search(getActivity("museums"), destination)).code, "PLACES_TIMEOUT");
});

test("candidate retrieval is capped even for an oversized upstream response", async () => {
  const places = Array.from({ length: 15 }, (_, index) => ({ ...place, id: `place-${index}` }));
  const client = createGooglePlacesClient({ apiKey: "key", fetchImpl: async () => response(200, { places }) });
  assert.equal((await client.search(getActivity("museums"), destination)).places.length, CANDIDATE_LIMIT);
});
