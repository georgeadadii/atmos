import { Router } from "express";

import { AppError, errorResponse } from "../errors.js";
import { processAirQuality } from "../services/airQuality.js";
import { createPackingRecommendations } from "../services/packingRecommendations.js";
import { processForecast } from "../services/weatherProcessing.js";

export function createTravelRouter({ openWeatherClient, now = Date.now }) {
  const router = Router();

  router.get("/", async (request, response) => {
    try {
      const hasLatitude = request.query.latitude !== undefined;
      const hasLongitude = request.query.longitude !== undefined;
      let selectedCoordinates;
      if (hasLatitude || hasLongitude) {
        const latitude = Number(request.query.latitude);
        const longitude = Number(request.query.longitude);
        if (
          !hasLatitude ||
          !hasLongitude ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90 ||
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180
        ) {
          throw new AppError(
            "INVALID_DESTINATION_SELECTION",
            "The selected destination coordinates are invalid.",
            400,
          );
        }
        selectedCoordinates = { latitude, longitude };
      }

      const destination = await openWeatherClient.geocode(
        request.query.city,
        selectedCoordinates,
      );
      const { latitude, longitude } = destination;
      const [forecastPayload, currentAirPayload, forecastAirPayload] =
        await Promise.all([
          openWeatherClient.getForecast(latitude, longitude),
          openWeatherClient.getCurrentAirPollution(latitude, longitude),
          openWeatherClient.getAirPollutionForecast(latitude, longitude),
        ]);
      const weather = processForecast(forecastPayload, { now: now() });
      const packing = createPackingRecommendations(weather.intervals);
      const airQuality = processAirQuality(
        currentAirPayload,
        forecastAirPayload,
        weather,
      );
      const limitations = [...weather.warnings, ...airQuality.limitations];

      response.status(200).json({
        destination,
        forecast: {
          interpretation:
            "Three destination-local calendar days including the current day.",
          timezoneOffsetSeconds: weather.timezoneOffsetSeconds,
          days: weather.days,
        },
        packing,
        airQuality: {
          current: airQuality.current,
          forecast: airQuality.forecast,
        },
        limitations,
      });
    } catch (error) {
      const { status, body } = errorResponse(error);
      response.status(status).json(body);
    }
  });

  return router;
}
