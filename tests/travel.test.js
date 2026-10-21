import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { AppError } from "../server/errors.js";
import { createApp } from "../server/index.js";
import {
  forecastPayload,
  goodComponents,
  NOW,
  pollutionPayload,
  pollutionReading,
} from "./helpers.js";

const destination = {
  name: "Dublin",
  country: "IE",
  latitude: 53.35,
  longitude: -6.26,
};

function successfulClient() {
  return {
    async geocode() {
      return destination;
    },
    async getForecast() {
      return forecastPayload();
    },
    async getCurrentAirPollution() {
      return pollutionPayload([pollutionReading("2026-01-10T10:00:00Z")]);
    },
    async getAirPollutionForecast() {
      return pollutionPayload([
        pollutionReading("2026-01-10T11:00:00Z", goodComponents),
        pollutionReading("2026-01-12T23:00:00Z", goodComponents),
      ]);
    },
  };
}

async function withServer(client, callback) {
  const server = createApp({ openWeatherClient: client, now: () => NOW }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/travel returns the documented structured response", async () => {
  await withServer(successfulClient(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/travel?city=Dublin%2CIE`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.destination, destination);
    assert.equal(body.forecast.days.length, 3);
    assert.deepEqual(Object.keys(body.forecast.intervalsByDate), [
      "2026-01-10",
      "2026-01-11",
      "2026-01-12",
    ]);
    assert.equal(body.forecast.intervalsByDate["2026-01-10"].length, 2);
    assert.equal(body.forecast.days[0].periods.length, 2);
    assert.equal(body.forecast.days[0].periods[0].localTime, "12:00");
    assert.equal(body.forecast.days[0].minimumTemperatureCelsius, 6);
    assert.equal(body.packing.umbrella.recommended, true);
    assert.ok(body.airQuality.current);
    assert.ok(body.airQuality.forecast.maxima);
    assert.ok(Array.isArray(body.limitations));
  });
});

test("GET /api/travel forwards a deterministic destination selection", async () => {
  const client = successfulClient();
  let receivedSelection;
  client.geocode = async (_city, selection) => {
    receivedSelection = selection;
    return destination;
  };

  await withServer(client, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/travel?city=Springfield&latitude=53.35&longitude=-6.26`,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(receivedSelection, {
      latitude: 53.35,
      longitude: -6.26,
    });
  });
});

test("GET /api/travel rejects invalid destination coordinates", async (context) => {
  for (const [name, query] of [
    ["empty latitude and longitude", "latitude=&longitude="],
    ["latitude without longitude", "latitude=53.35"],
    ["longitude without latitude", "longitude=-6.26"],
    ["non-numeric coordinates", "latitude=north&longitude=west"],
    ["out-of-range latitude", "latitude=90.01&longitude=-6.26"],
    ["out-of-range longitude", "latitude=53.35&longitude=-180.01"],
  ]) {
    await context.test(name, async () => {
      const client = successfulClient();
      let geocodeCalled = false;
      client.geocode = async () => {
        geocodeCalled = true;
        return destination;
      };

      await withServer(client, async (baseUrl) => {
        const response = await fetch(
          `${baseUrl}/api/travel?city=Springfield&${query}`,
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: {
            code: "INVALID_DESTINATION_SELECTION",
            message: "The selected destination coordinates are invalid.",
          },
        });
        assert.equal(geocodeCalled, false);
      });
    });
  }
});

test("GET /api/travel returns consistent errors for invalid and upstream requests", async (context) => {
  for (const [name, error, expectedStatus, expectedCode] of [
    ["missing city", new AppError("INVALID_CITY", "A non-empty city is required.", 400), 400, "INVALID_CITY"],
    ["unknown city", new AppError("CITY_NOT_FOUND", "No matching destination was found.", 404), 404, "CITY_NOT_FOUND"],
    ["upstream failure", new AppError("WEATHER_API_FAILURE", "The weather service could not complete the request.", 502), 502, "WEATHER_API_FAILURE"],
    ["timeout", new AppError("WEATHER_API_TIMEOUT", "The weather service did not respond in time.", 504), 504, "WEATHER_API_TIMEOUT"],
  ]) {
    await context.test(name, async () => {
      const client = successfulClient();
      client.geocode = async () => {
        throw error;
      };
      await withServer(client, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/travel`);
        assert.equal(response.status, expectedStatus);
        assert.deepEqual(await response.json(), {
          error: { code: expectedCode, message: error.message },
        });
      });
    });
  }
});
