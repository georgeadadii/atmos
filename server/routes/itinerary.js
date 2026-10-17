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
import { processForecast } from "../services/weatherProcessing.js";

const FORECAST_DAY_COUNT = 3;

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

export function createItineraryRouter({ openWeatherClient, now = Date.now }) {
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
        ],
      });
    } catch (error) {
      const { status, body } = errorResponse(error);
      response.status(status).json(body);
    }
  });

  return router;
}
