import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createTravelRouter } from "./routes/travel.js";
import { createOpenWeatherClient } from "./services/openWeather.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(currentDirectory, "..", "public");

export function createApp({
  openWeatherClient = createOpenWeatherClient(),
  now = Date.now,
} = {}) {
  const app = express();

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
  app.use(express.static(publicDirectory));
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
