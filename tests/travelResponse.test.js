import assert from "node:assert/strict";
import test from "node:test";

import { isTravelResponse } from "../public/travelResponse.js";
import { processAirQuality } from "../server/services/airQuality.js";
import {
  goodComponents,
  pollutionPayload,
  pollutionReading,
} from "./helpers.js";

function responseWithAirQuality() {
  const processed = processAirQuality(
    pollutionPayload([
      pollutionReading("2026-01-10T10:00:00Z", {
        ...goodComponents,
        o3: 75,
      }),
    ]),
    pollutionPayload([
      pollutionReading("2026-01-11T12:00:00Z", {
        ...goodComponents,
        o3: 145,
      }),
    ]),
    {
      dates: ["2026-01-10", "2026-01-11", "2026-01-12"],
      timezoneOffsetSeconds: 0,
    },
  );
  const days = ["2026-01-10", "2026-01-11", "2026-01-12"]
    .map((date) => ({ date, periods: [] }));
  const intervalsByDate = Object.fromEntries(days.map(({ date }, index) => [
    date,
    [{
      temperature: 12 + index,
      rainfall: index === 0 ? 1.2 : 0,
      windSpeedKmh: 10 + index,
    }],
  ]));
  return {
    destination: { name: "Dublin", latitude: 53.35, longitude: -6.26 },
    forecast: {
      days,
      intervalsByDate,
    },
    airQuality: {
      current: processed.current,
      forecast: processed.forecast,
      warnings: processed.warnings,
    },
    limitations: [],
  };
}

test("UI response validation accepts a complete response without server packing", () => {
  const response = responseWithAirQuality();
  assert.equal(isTravelResponse(response), true);
  assert.equal(response.packing, undefined);
  assert.ok(response.airQuality.current.components.no);
  assert.ok(response.airQuality.current.components.nh3);
});

test("UI response validation rejects malformed forecast intervals", async (context) => {
  for (const [name, field, value] of [
    ["non-finite temperature", "temperature", Number.NaN],
    ["non-finite rainfall", "rainfall", Number.POSITIVE_INFINITY],
    ["negative rainfall", "rainfall", -0.1],
    ["non-finite wind speed", "windSpeedKmh", Number.NEGATIVE_INFINITY],
    ["negative wind speed", "windSpeedKmh", -1],
  ]) {
    await context.test(name, () => {
      const response = responseWithAirQuality();
      response.forecast.intervalsByDate["2026-01-10"][0][field] = value;
      assert.equal(isTravelResponse(response), false);
    });
  }

  await context.test("missing intervals for a requested date", () => {
    const response = responseWithAirQuality();
    response.forecast.intervalsByDate["2026-01-10"] = [];
    assert.equal(isTravelResponse(response), false);
  });

  await context.test("intervals must be an object keyed by date", () => {
    const response = responseWithAirQuality();
    response.forecast.intervalsByDate = Object.values(
      response.forecast.intervalsByDate,
    );
    assert.equal(isTravelResponse(response), false);
  });
});

test("UI response validation rejects malformed warning shapes", async (context) => {
  await context.test("missing combined warning collection", () => {
    const response = responseWithAirQuality();
    delete response.airQuality.warnings;
    assert.equal(isTravelResponse(response), false);
  });

  await context.test("missing forecast warning timing", () => {
    const response = responseWithAirQuality();
    delete response.airQuality.warnings[0].forecast.expectedAt;
    assert.equal(isTravelResponse(response), false);
  });

  await context.test("Good is not a warning severity", () => {
    const response = responseWithAirQuality();
    response.airQuality.current.warnings[0].severity = "Good";
    assert.equal(isTravelResponse(response), false);
  });

  await context.test("classified component measurements are required", () => {
    const response = responseWithAirQuality();
    delete response.airQuality.current.components.pm2_5;
    assert.equal(isTravelResponse(response), false);
  });
});
