import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createItineraryRouter } from "./routes/itinerary.js";
import { createTravelRouter } from "./routes/travel.js";
import { createOpenWeatherClient } from "./services/openWeather.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "..", "public");

export function createApp({
  openWeatherClient = createOpenWeatherClient(),
  now = Date.now,
} = {}) {
  const app = express();

  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "atmos",
    });
  });

  app.use(
    "/api/travel",
    createTravelRouter({ openWeatherClient, now }),
  );
  app.use(
    "/api/itinerary",
    createItineraryRouter({ openWeatherClient, now }),
  );
  app.use(express.static(publicDirectory));
  app.use((error, _request, response, _next) => {
    if (
      error instanceof SyntaxError &&
      error.status === 400 &&
      "body" in error
    ) {
      response.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "The request body contains invalid JSON.",
        },
      });
      return;
    }
    if (error?.type === "entity.too.large") {
      response.status(413).json({
        error: {
          code: "REQUEST_BODY_TOO_LARGE",
          message: "The request body is too large.",
        },
      });
      return;
    }
    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
      },
    });
  });
  return app;
}

export const app = createApp();

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`Atmos is running at http://localhost:${port}`);
  });
}
