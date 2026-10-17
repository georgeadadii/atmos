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
