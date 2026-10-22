import { Router } from "express";

import { errorResponse } from "../errors.js";
import { processAirQuality } from "../services/airQuality.js";
import { selectedCoordinatesFrom } from "../services/destinationSelection.js";
import { processForecast } from "../services/weatherProcessing.js";

export function createTravelRouter({ openWeatherClient, now = Date.now }) {
  const router = Router();

  router.get("/", async (request, response) => {
    try {
      const selectedCoordinates = selectedCoordinatesFrom(request.query);

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
            "The next three full destination-local calendar days, excluding the current day.",
          timezoneOffsetSeconds: weather.timezoneOffsetSeconds,
          days: weather.days,
          intervalsByDate: weather.intervalsByDate,
        },
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
