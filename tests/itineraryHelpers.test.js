import assert from "node:assert/strict";
import test from "node:test";

import {
  isItineraryResponse,
  selectionValidation,
} from "../public/itineraryHelpers.js";

test("selection validation explains empty and over-capacity choices", () => {
  assert.deepEqual(selectionValidation(0, 2), {
    availableSlots: 6,
    valid: false,
    message: "Select at least one activity to build your itinerary.",
  });
  assert.deepEqual(selectionValidation(5, 1), {
    availableSlots: 3,
    valid: false,
    message: "You selected 5 activities, but your current settings allow only 3. Increase your daily limit or remove 2 activities.",
  });
  assert.deepEqual(selectionValidation(6, 2), {
    availableSlots: 6,
    valid: true,
    message: "",
  });
  assert.deepEqual(selectionValidation(7, 3), {
    availableSlots: 9,
    valid: false,
    message: "Select no more than 6 activities for one itinerary.",
  });
});

test("itinerary response validation requires exactly three complete day records", () => {
  const activity = {
    id: "hiking",
    name: "Hiking",
    suitabilityScore: 88,
    reason: "Dry weather is favourable.",
  };
  const day = {
    date: "2026-10-17",
    forecast: { representativeCondition: { name: "Clear" } },
    activities: [activity],
  };
  const response = {
    destination: { name: "Dublin" },
    preferences: { activities: ["hiking"], activitiesPerDay: 2 },
    itinerary: { days: [day, { ...day, activities: [] }, day], overallScore: 88 },
    limitations: [],
  };

  assert.equal(isItineraryResponse(response), true);
  assert.equal(
    isItineraryResponse({ ...response, itinerary: { days: [day], overallScore: 88 } }),
    false,
  );
  assert.equal(
    isItineraryResponse({
      ...response,
      itinerary: {
        days: [day, day, { ...day, activities: [{ ...activity, reason: null }] }],
        overallScore: 88,
      },
    }),
    false,
  );
});

test("itinerary response validation accepts ranked places and rejects malformed scores", () => {
  const place = {
    id: "place-1",
    name: "Museum",
    placeScore: 82.5,
    rankingExplanation: "Direct match with strong rating evidence.",
    scoreBreakdown: {
      activityRelevance: { score: 35, maximum: 35 },
      visitorRating: { score: 27, maximum: 30 },
      reviewConfidence: { score: 12, maximum: 20 },
      proximity: { score: 8.5, maximum: 15 },
    },
  };
  const activity = {
    id: "museums",
    name: "Museums",
    suitabilityScore: 90,
    reason: "Weather explanation.",
    places: [place],
    placeAvailability: { code: "PLACES_AVAILABLE", message: "Place data provided by Google Maps." },
  };
  const day = { date: "2026-10-17", forecast: { representativeCondition: { name: "Clear" } }, activities: [activity] };
  const response = {
    destination: { name: "Dublin" },
    preferences: { activities: ["museums"], activitiesPerDay: 1 },
    itinerary: { days: [day, { ...day, activities: [] }, { ...day, activities: [] }], overallScore: 90 },
    limitations: [],
  };
  assert.equal(isItineraryResponse(response), true);
  assert.equal(isItineraryResponse({
    ...response,
    itinerary: { ...response.itinerary, days: [{ ...day, activities: [{ ...activity, places: [{ ...place, placeScore: 101 }] }] }, { ...day, activities: [] }, { ...day, activities: [] }] },
  }), false);
});
