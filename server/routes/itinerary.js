import { Router } from "express";

import { AppError, errorResponse } from "../errors.js";
import {
  getActivity,
  supportedActivityIds,
} from "../services/activityCatalogue.js";
import {
  explainActivityPlacement,
  scoreActivityForDay,
} from "../services/activityScoring.js";
import { selectedCoordinatesFrom } from "../services/destinationSelection.js";
import { optimiseItinerary } from "../services/itineraryPlanner.js";
import { rankPlaces } from "../services/placeRanking.js";
import { processForecast } from "../services/weatherProcessing.js";

const FORECAST_DAY_COUNT = 3;
export const MAX_SELECTED_ACTIVITIES = 6;
const MAX_PLACE_SEARCH_CONCURRENCY = 2;

export function validateItineraryRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(
      "INVALID_REQUEST_BODY",
      "A JSON request body is required.",
      400,
    );
  }
  if (typeof body.city !== "string" || !body.city.trim()) {
    throw new AppError("INVALID_CITY", "A non-empty city is required.", 400);
  }
  if (!Array.isArray(body.activities) || body.activities.length === 0) {
    throw new AppError(
      "INVALID_ACTIVITIES",
      "Select at least one supported activity.",
      400,
      { supportedActivities: supportedActivityIds() },
    );
  }
  if (body.activities.some((activity) => typeof activity !== "string")) {
    throw new AppError(
      "INVALID_ACTIVITIES",
      "Every activity must be identified by a string.",
      400,
      { supportedActivities: supportedActivityIds() },
    );
  }

  const duplicateActivities = body.activities.filter(
    (activity, index) => body.activities.indexOf(activity) !== index,
  );
  if (duplicateActivities.length > 0) {
    throw new AppError(
      "DUPLICATE_ACTIVITIES",
      "Each activity may be selected only once.",
      400,
      { duplicateActivities: [...new Set(duplicateActivities)] },
    );
  }
  if (body.activities.length > MAX_SELECTED_ACTIVITIES) {
    throw new AppError(
      "ACTIVITY_SELECTION_LIMIT_EXCEEDED",
      `Select no more than ${MAX_SELECTED_ACTIVITIES} activities for one itinerary.`,
      400,
      {
        selectedActivityCount: body.activities.length,
        maximumSelectedActivities: MAX_SELECTED_ACTIVITIES,
      },
    );
  }
  const unknownActivities = body.activities.filter(
    (identifier) => !getActivity(identifier),
  );
  if (unknownActivities.length > 0) {
    throw new AppError(
      "UNKNOWN_ACTIVITIES",
      "One or more activity identifiers are not supported.",
      400,
      { unknownActivities, supportedActivities: supportedActivityIds() },
    );
  }
  if (![1, 2, 3].includes(body.activitiesPerDay)) {
    throw new AppError(
      "INVALID_DAILY_CAPACITY",
      "activitiesPerDay must be 1, 2 or 3.",
      400,
    );
  }

  const availableSlots = FORECAST_DAY_COUNT * body.activitiesPerDay;
  if (body.activities.length > availableSlots) {
    throw new AppError(
      "ITINERARY_CAPACITY_EXCEEDED",
      `The selected activities require more than the ${availableSlots} available itinerary slots.`,
      400,
      { selectedActivityCount: body.activities.length, availableSlots },
    );
  }

  return {
    city: body.city.trim(),
    activityIds: [...body.activities],
    activitiesPerDay: body.activitiesPerDay,
    selectedCoordinates: selectedCoordinatesFrom(body),
  };
}

async function searchPlacesBounded(activities, destination, googlePlacesClient) {
  const results = new Map();
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < activities.length) {
      const activity = activities[nextIndex];
      nextIndex += 1;
      try {
        results.set(activity.id, await googlePlacesClient.search(activity, destination));
      } catch {
        results.set(activity.id, {
          places: [],
          code: "PLACES_UNAVAILABLE",
          message: "Real-place suggestions are temporarily unavailable.",
        });
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(MAX_PLACE_SEARCH_CONCURRENCY, activities.length) },
      worker,
    ),
  );
  return results;
}

export async function enrichActivitiesWithPlaces(
  activities,
  destination,
  googlePlacesClient,
) {
  const searchResults = await searchPlacesBounded(
    activities,
    destination,
    googlePlacesClient,
  );
  const usedPlaceIds = new Set();
  return new Map(
    activities.map((activity) => {
      const result = searchResults.get(activity.id) ?? { places: [] };
      const ranked = rankPlaces(result.places, activity, destination);
      const places = ranked
        .filter((place) => !usedPlaceIds.has(place.id))
        .slice(0, 3);
      places.forEach((place) => usedPlaceIds.add(place.id));
      const message = places.length
        ? result.message
        : result.code === "PLACES_AVAILABLE"
          ? "No sufficiently relevant real-place suggestions were found in the search area."
          : result.message ?? "No suitable real-place suggestions were found in the search area.";
      return [activity.id, { places, placeAvailability: { code: result.code, message } }];
    }),
  );
}

export function createItineraryRouter({
  openWeatherClient,
  googlePlacesClient,
  now = Date.now,
}) {
  const router = Router();

  router.post("/", async (request, response) => {
    try {
      const preferences = validateItineraryRequest(request.body);
      const destination = await openWeatherClient.geocode(
        preferences.city,
        preferences.selectedCoordinates,
      );
      const forecastPayload = await openWeatherClient.getForecast(
        destination.latitude,
        destination.longitude,
      );
      const weather = processForecast(forecastPayload, { now: now() });
      const activities = preferences.activityIds.map(getActivity);
      const scoreMatrix = Object.fromEntries(
        activities.map((activity) => [
          activity.id,
          weather.dates.map((date) =>
            scoreActivityForDay(activity, weather.intervalsByDate[date]),
          ),
        ]),
      );
      const plan = optimiseItinerary(
        activities,
        scoreMatrix,
        preferences.activitiesPerDay,
      );
      const placeRecommendations = await enrichActivitiesWithPlaces(
        activities,
        destination,
        googlePlacesClient,
      );

      const days = weather.days.map((forecastDay, dayIndex) => ({
        date: forecastDay.date,
        forecast: forecastDay,
        activities: activities
          .filter((activity) => plan.assignments[activity.id] === dayIndex)
          .map((activity) => {
            const result = scoreMatrix[activity.id][dayIndex];
            const bestScore = Math.max(
              ...scoreMatrix[activity.id].map((day) => day.score),
            );
            return {
              id: activity.id,
              name: activity.name,
              description: activity.description,
              environment: activity.environment,
              suitabilityScore: result.score,
              reason: explainActivityPlacement(activity, result, {
                isBestDay: result.score === bestScore,
                activitiesPerDay: preferences.activitiesPerDay,
              }),
              ...(placeRecommendations.get(activity.id) ?? {
                places: [],
                placeAvailability: {
                  code: "PLACES_UNAVAILABLE",
                  message: "Real-place suggestions are temporarily unavailable.",
                },
              }),
            };
          }),
      }));

      response.status(200).json({
        destination,
        preferences: {
          activities: preferences.activityIds,
          activitiesPerDay: preferences.activitiesPerDay,
        },
        forecast: {
          interpretation:
            "Three destination-local calendar days including the current day.",
          timezoneOffsetSeconds: weather.timezoneOffsetSeconds,
        },
        itinerary: { days, overallScore: plan.overallScore },
        limitations: [
          ...weather.warnings,
          "Suitability scores are application-defined weather heuristics, not safety guarantees.",
          "Activities are assigned to whole days; the itinerary does not choose an hour or a venue.",
          "Atmos Place Scores are application-specific ranking heuristics, not measures of quality, safety or accessibility.",
          "Place distances are approximate straight-line distances from the destination centre, not routes or journey times.",
        ],
      });
    } catch (error) {
      const { status, body } = errorResponse(error);
      response.status(status).json(body);
    }
  });

  return router;
}
