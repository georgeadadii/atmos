import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { AppError } from "../server/errors.js";
import { createApp } from "../server/index.js";
import {
  enrichActivitiesWithPlaces,
  validateItineraryRequest,
} from "../server/routes/itinerary.js";
import { getActivity } from "../server/services/activityCatalogue.js";
import { NOW, weatherInterval } from "./helpers.js";

const destination = {
  name: "Dublin",
  country: "IE",
  latitude: 53.35,
  longitude: -6.26,
};

function dayIntervals(date, options, hours = [0, 3, 6, 9, 12, 15, 18, 21]) {
  return hours.map((hour) =>
    weatherInterval(`${date}T${String(hour).padStart(2, "0")}:00:00Z`, options),
  );
}

function itineraryForecast() {
  return {
    city: { timezone: 0 },
    list: [
      ...dayIntervals(
        "2026-01-10",
        { temperature: 16, windSpeed: 3 },
        [12, 15, 18, 21],
      ),
      ...dayIntervals("2026-01-11", {
        temperature: 12,
        windSpeed: 4,
        rain: 2,
        condition: "Rain",
        description: "moderate rain",
      }),
      ...dayIntervals("2026-01-12", {
        temperature: 25,
        windSpeed: 2,
        condition: "Clear",
        description: "clear sky",
      }),
    ],
  };
}

function successfulClient() {
  return {
    async geocode() {
      return destination;
    },
    async getForecast() {
      return itineraryForecast();
    },
  };
}

async function withServer(client, callback, googlePlacesClient = { async search() { return { places: [], code: "PLACES_NOT_CONFIGURED", message: "Not configured." }; } }) {
  const server = createApp({ openWeatherClient: client, googlePlacesClient, now: () => NOW }).listen(
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

function validBody(overrides = {}) {
  return {
    city: "Dublin,IE",
    activities: ["beach", "museums", "hiking"],
    activitiesPerDay: 1,
    ...overrides,
  };
}

test("request validation rejects missing, unknown, duplicate, and over-capacity activities", async (context) => {
  for (const [name, body, code] of [
    ["missing body", undefined, "INVALID_REQUEST_BODY"],
    ["missing destination", validBody({ city: "" }), "INVALID_CITY"],
    ["missing activities", validBody({ activities: undefined }), "INVALID_ACTIVITIES"],
    ["empty activities", validBody({ activities: [] }), "INVALID_ACTIVITIES"],
    ["unknown activities", validBody({ activities: ["skiing"] }), "UNKNOWN_ACTIVITIES"],
    ["duplicate activities", validBody({ activities: ["beach", "beach"] }), "DUPLICATE_ACTIVITIES"],
    ["invalid capacity", validBody({ activitiesPerDay: 4 }), "INVALID_DAILY_CAPACITY"],
    [
      "too many activities",
      validBody({
        activities: [
          "beach",
          "museums",
          "hiking",
          "shopping",
        ],
        activitiesPerDay: 1,
      }),
      "ITINERARY_CAPACITY_EXCEEDED",
    ],
  ]) {
    await context.test(name, () => {
      assert.throws(() => validateItineraryRequest(body), { code });
    });
  }
});

test("request validation rejects incomplete and non-numeric coordinate selections", () => {
  for (const coordinates of [
    { latitude: 53.35 },
    { latitude: null, longitude: -6.26 },
    { latitude: "", longitude: -6.26 },
    { latitude: 91, longitude: -6.26 },
  ]) {
    assert.throws(
      () => validateItineraryRequest(validBody(coordinates)),
      { code: "INVALID_DESTINATION_SELECTION" },
    );
  }
});

test("request validation accepts six activities and rejects seven", () => {
  const six = ["beach", "museums", "hiking", "shopping", "cafes", "art-galleries"];
  assert.equal(validateItineraryRequest(validBody({ activities: six, activitiesPerDay: 2 })).activityIds.length, 6);
  assert.throws(
    () => validateItineraryRequest(validBody({
      activities: [...six, "historical-sites"],
      activitiesPerDay: 3,
    })),
    { code: "ACTIVITY_SELECTION_LIMIT_EXCEEDED" },
  );
});

test("POST /api/itinerary returns the optimal structured three-day itinerary", async () => {
  await withServer(successfulClient(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.destination, destination);
    assert.deepEqual(body.preferences, {
      activities: ["beach", "museums", "hiking"],
      activitiesPerDay: 1,
    });
    assert.equal(body.itinerary.days.length, 3);
    assert.equal(body.itinerary.days[0].forecast.periods, undefined);
    assert.equal(body.itinerary.days[0].activities[0].id, "hiking");
    assert.equal(body.itinerary.days[1].activities[0].id, "museums");
    assert.equal(body.itinerary.days[2].activities[0].id, "beach");
    assert.ok(body.itinerary.overallScore >= 0);
    assert.ok(body.itinerary.overallScore <= 100);
    assert.match(body.itinerary.days[2].activities[0].reason, /25–25°C/);
    assert.deepEqual(body.itinerary.days[2].activities[0].places, []);
    assert.equal(body.itinerary.days[2].activities[0].placeAvailability.code, "PLACES_NOT_CONFIGURED");
    assert.ok(Array.isArray(body.limitations));
  });
});

test("POST /api/itinerary enriches activities after weather scheduling and survives Places failures", async () => {
  const candidate = {
    id: "museum-1",
    displayName: { text: "National Museum" },
    formattedAddress: "Museum Street, Dublin",
    location: { latitude: 53.351, longitude: -6.26 },
    googleMapsUri: "https://maps.google.com/?cid=1",
    types: ["museum"],
    rating: 4.7,
    userRatingCount: 1200,
  };
  const placesClient = {
    async search(activity) {
      if (activity.id === "museums") {
        return { places: [candidate], code: "PLACES_AVAILABLE", message: "Place data provided by Google Maps." };
      }
      throw new Error("outage");
    },
  };
  await withServer(successfulClient(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    const scheduled = body.itinerary.days.flatMap((day) => day.activities);
    const museum = scheduled.find((activity) => activity.id === "museums");
    assert.ok(museum.suitabilityScore >= 0 && museum.suitabilityScore <= 100);
    assert.equal(museum.places.length, 1);
    assert.equal(museum.places[0].name, "National Museum");
    assert.notEqual(museum.places[0].placeScore, museum.suitabilityScore);
    assert.ok(museum.places[0].placeScore <= 100);
    assert.equal(scheduled.find((activity) => activity.id === "beach").places.length, 0);
  }, placesClient);
});

test("place enrichment returns at most three and avoids duplicate place IDs", async () => {
  const shared = {
    id: "shared",
    displayName: { text: "Shared cultural venue" },
    location: destination,
    types: ["museum", "art_gallery"],
    rating: 5,
    userRatingCount: 1000,
  };
  const galleryAlternative = {
    ...shared,
    id: "gallery-only",
    displayName: { text: "Gallery alternative" },
    types: ["art_gallery"],
    rating: 4,
  };
  const activities = [getActivity("museums"), getActivity("art-galleries")];
  const placesClient = {
    async search(activity) {
      return {
        places: activity.id === "museums" ? [shared] : [shared, galleryAlternative],
        code: "PLACES_AVAILABLE",
        message: "Place data provided by Google Maps.",
      };
    },
  };
  const enriched = await enrichActivitiesWithPlaces(activities, destination, placesClient);
  assert.deepEqual(enriched.get("museums").places.map(({ id }) => id), ["shared"]);
  assert.deepEqual(enriched.get("art-galleries").places.map(({ id }) => id), ["gallery-only"]);
  assert.ok([...enriched.values()].every(({ places }) => places.length <= 3));
});

test("POST /api/itinerary supports validated coordinates and makes one forecast request", async () => {
  const client = successfulClient();
  let receivedSelection;
  let forecastRequests = 0;
  client.geocode = async (_city, selection) => {
    receivedSelection = selection;
    return destination;
  };
  client.getForecast = async () => {
    forecastRequests += 1;
    return itineraryForecast();
  };

  await withServer(client, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        validBody({ city: "Springfield", latitude: 53.35, longitude: -6.26 }),
      ),
    });
    assert.equal(response.status, 200);
  });

  assert.deepEqual(receivedSelection, { latitude: 53.35, longitude: -6.26 });
  assert.equal(forecastRequests, 1);
});

test("POST /api/itinerary returns predictable validation and malformed JSON errors", async () => {
  await withServer(successfulClient(), async (baseUrl) => {
    const invalidRequest = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city: "Dublin", activities: [], activitiesPerDay: 1 }),
    });
    assert.equal(invalidRequest.status, 400);
    assert.equal((await invalidRequest.json()).error.code, "INVALID_ACTIVITIES");

    const malformedJson = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    assert.equal(malformedJson.status, 400);
    assert.deepEqual(await malformedJson.json(), {
      error: {
        code: "INVALID_JSON",
        message: "The request body contains invalid JSON.",
      },
    });
  });
});

test("POST /api/itinerary preserves ambiguous, unknown, and upstream errors", async (context) => {
  for (const [name, error, status, code] of [
    [
      "ambiguous city",
      new AppError("AMBIGUOUS_CITY", "Multiple destinations matched.", 300, {
        candidates: [destination],
      }),
      300,
      "AMBIGUOUS_CITY",
    ],
    [
      "unknown city",
      new AppError("CITY_NOT_FOUND", "No matching destination was found.", 404),
      404,
      "CITY_NOT_FOUND",
    ],
    [
      "upstream failure",
      new AppError("WEATHER_API_FAILURE", "Weather failed.", 502),
      502,
      "WEATHER_API_FAILURE",
    ],
  ]) {
    await context.test(name, async () => {
      const client = successfulClient();
      client.geocode = async () => {
        throw error;
      };
      await withServer(client, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/itinerary`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(validBody()),
        });
        assert.equal(response.status, status);
        assert.equal((await response.json()).error.code, code);
      });
    });
  }
});

test("POST /api/itinerary rejects insufficient forecast data", async () => {
  const client = successfulClient();
  client.getForecast = async () => ({
    city: { timezone: 0 },
    list: dayIntervals("2026-01-10", { temperature: 20 }),
  });

  await withServer(client, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/itinerary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    assert.equal(response.status, 502);
    assert.equal(
      (await response.json()).error.code,
      "INSUFFICIENT_FORECAST_DATA",
    );
  });
});
