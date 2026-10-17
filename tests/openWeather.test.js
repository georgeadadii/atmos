import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../server/errors.js";
import { createOpenWeatherClient } from "../server/services/openWeather.js";

function jsonResponse(data, { status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("geocoding returns a single valid destination", async () => {
  let requestedUrl;
  const client = createOpenWeatherClient({
    apiKey: "test-secret",
    fetchImpl: async (url) => {
      requestedUrl = url;
      return jsonResponse([
        { name: "Dublin", state: "Leinster", country: "IE", lat: 53.35, lon: -6.26 },
      ]);
    },
  });

  assert.deepEqual(await client.geocode(" Dublin,IE "), {
    name: "Dublin",
    state: "Leinster",
    country: "IE",
    latitude: 53.35,
    longitude: -6.26,
  });
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get("q"), "Dublin,IE");
  assert.equal(url.searchParams.get("appid"), "test-secret");
});

test("geocoding rejects unknown and ambiguous destinations", async (context) => {
  await context.test("unknown", async () => {
    const client = createOpenWeatherClient({
      apiKey: "key",
      fetchImpl: async () => jsonResponse([]),
    });
    await assert.rejects(client.geocode("Atlantis"), {
      code: "CITY_NOT_FOUND",
      status: 404,
    });
  });

  await context.test("ambiguous", async () => {
    const client = createOpenWeatherClient({
      apiKey: "key",
      fetchImpl: async () =>
        jsonResponse([
          { name: "Springfield", state: "Illinois", country: "US", lat: 1, lon: 2 },
          { name: "Springfield", state: "Oregon", country: "US", lat: 3, lon: 4 },
        ]),
    });
    await assert.rejects(
      client.geocode("Springfield"),
      (error) =>
        error.code === "AMBIGUOUS_CITY" &&
        error.status === 300 &&
        error.details.candidates.length === 2,
    );
  });
});

test("geocoding resolves an ambiguous destination by selected coordinates", async () => {
  const client = createOpenWeatherClient({
    apiKey: "key",
    fetchImpl: async () =>
      jsonResponse([
        { name: "Springfield", state: "Illinois", country: "US", lat: 1, lon: 2 },
        { name: "Springfield", state: "Oregon", country: "US", lat: 3, lon: 4 },
      ]),
  });

  assert.deepEqual(
    await client.geocode("Springfield", { latitude: 3, longitude: 4 }),
    {
      name: "Springfield",
      state: "Oregon",
      country: "US",
      latitude: 3,
      longitude: 4,
    },
  );
});

test("geocoding rejects invalid input and malformed upstream data", async (context) => {
  const client = createOpenWeatherClient({
    apiKey: "key",
    fetchImpl: async () => jsonResponse({ unexpected: true }),
  });
  await context.test("empty input", async () => {
    await assert.rejects(client.geocode("  "), { code: "INVALID_CITY" });
  });
  await context.test("invalid response", async () => {
    await assert.rejects(client.geocode("Dublin"), {
      code: "INVALID_UPSTREAM_RESPONSE",
    });
  });
});

test("OpenWeather client maps authentication, rate limit, network, and timeout failures", async (context) => {
  for (const [name, status, code] of [
    ["authentication", 401, "WEATHER_API_AUTHENTICATION_FAILED"],
    ["rate limit", 429, "WEATHER_API_RATE_LIMITED"],
    ["upstream", 500, "WEATHER_API_FAILURE"],
  ]) {
    await context.test(name, async () => {
      const client = createOpenWeatherClient({
        apiKey: "key",
        fetchImpl: async () => jsonResponse({}, { status }),
      });
      await assert.rejects(client.geocode("Dublin"), { code });
    });
  }

  await context.test("network", async () => {
    const client = createOpenWeatherClient({
      apiKey: "key",
      fetchImpl: async () => {
        throw new TypeError("network failure");
      },
    });
    await assert.rejects(client.geocode("Dublin"), {
      code: "WEATHER_API_UNAVAILABLE",
    });
  });

  await context.test("timeout", async () => {
    const client = createOpenWeatherClient({
      apiKey: "key",
      timeoutMs: 5,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    await assert.rejects(client.geocode("Dublin"), {
      code: "WEATHER_API_TIMEOUT",
    });
  });
});

test("missing API key fails without making a request", async () => {
  let called = false;
  const client = createOpenWeatherClient({
    apiKey: "",
    fetchImpl: async () => {
      called = true;
    },
  });
  await assert.rejects(client.geocode("Dublin"), {
    code: "WEATHER_API_NOT_CONFIGURED",
  });
  assert.equal(called, false);
});
