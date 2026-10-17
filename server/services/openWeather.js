import { AppError } from "../errors.js";

const BASE_URL = "https://api.openweathermap.org";
const DEFAULT_TIMEOUT_MS = 8_000;

function validateCityQuery(city) {
  if (typeof city !== "string" || !city.trim()) {
    throw new AppError("INVALID_CITY", "A non-empty city is required.", 400);
  }

  const normalized = city.trim();
  if (
    normalized.length > 100 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new AppError(
      "INVALID_CITY",
      "The city query contains invalid characters or is too long.",
      400,
    );
  }
  return normalized;
}

function validateCoordinate(value, minimum, maximum, label) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AppError(
      "INVALID_UPSTREAM_RESPONSE",
      `OpenWeather returned an invalid ${label}.`,
      502,
    );
  }
}

function mapUpstreamStatus(status) {
  if (status === 401 || status === 403) {
    return new AppError(
      "WEATHER_API_AUTHENTICATION_FAILED",
      "The weather service credentials are not active or valid.",
      502,
    );
  }
  if (status === 429) {
    return new AppError(
      "WEATHER_API_RATE_LIMITED",
      "The weather service rate limit has been reached. Try again later.",
      503,
    );
  }
  return new AppError(
    "WEATHER_API_FAILURE",
    "The weather service could not complete the request.",
    502,
  );
}

async function requestJson(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) {
      throw mapUpstreamStatus(response.status);
    }
    try {
      return await response.json();
    } catch {
      throw new AppError(
        "INVALID_UPSTREAM_RESPONSE",
        "The weather service returned invalid JSON.",
        502,
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error?.name === "AbortError") {
      throw new AppError(
        "WEATHER_API_TIMEOUT",
        "The weather service did not respond in time.",
        504,
      );
    }
    throw new AppError(
      "WEATHER_API_UNAVAILABLE",
      "The weather service is temporarily unavailable.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenWeatherClient({
  apiKey = process.env.OPENWEATHER_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  function requireConfiguration() {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new AppError(
        "WEATHER_API_NOT_CONFIGURED",
        "The weather service is not configured.",
        503,
      );
    }
    if (typeof fetchImpl !== "function") {
      throw new AppError(
        "WEATHER_API_UNAVAILABLE",
        "The weather service is unavailable.",
        503,
      );
    }
  }

  async function get(path, parameters) {
    requireConfiguration();
    const url = new URL(path, BASE_URL);
    for (const [name, value] of Object.entries(parameters)) {
      url.searchParams.set(name, String(value));
    }
    url.searchParams.set("appid", apiKey);
    return requestJson(fetchImpl, url, timeoutMs);
  }

  return {
    async geocode(city, selectedCoordinates) {
      const query = validateCityQuery(city);
      const data = await get("/geo/1.0/direct", { q: query, limit: 5 });
      if (!Array.isArray(data)) {
        throw new AppError(
          "INVALID_UPSTREAM_RESPONSE",
          "The weather service returned invalid location data.",
          502,
        );
      }

      const candidates = data.map((item) => {
        if (
          !item ||
          typeof item.name !== "string" ||
          typeof item.country !== "string"
        ) {
          throw new AppError(
            "INVALID_UPSTREAM_RESPONSE",
            "The weather service returned invalid location data.",
            502,
          );
        }
        validateCoordinate(item.lat, -90, 90, "latitude");
        validateCoordinate(item.lon, -180, 180, "longitude");
        return {
          name: item.name,
          country: item.country,
          ...(typeof item.state === "string" ? { state: item.state } : {}),
          latitude: item.lat,
          longitude: item.lon,
        };
      });

      if (candidates.length === 0) {
        throw new AppError(
          "CITY_NOT_FOUND",
          "No matching destination was found.",
          404,
        );
      }
      if (selectedCoordinates !== undefined) {
        const { latitude, longitude } = selectedCoordinates;
        validateCoordinate(latitude, -90, 90, "selected latitude");
        validateCoordinate(longitude, -180, 180, "selected longitude");
        const selected = candidates.find(
          (candidate) =>
            Math.abs(candidate.latitude - latitude) < 0.000001 &&
            Math.abs(candidate.longitude - longitude) < 0.000001,
        );
        if (!selected) {
          throw new AppError(
            "DESTINATION_SELECTION_EXPIRED",
            "The selected destination is no longer available. Search again.",
            409,
          );
        }
        return selected;
      }
      if (candidates.length > 1) {
        throw new AppError(
          "AMBIGUOUS_CITY",
          "Multiple destinations matched. Use a more specific query such as 'Dublin,IE'.",
          300,
          { candidates },
        );
      }
      return candidates[0];
    },

    getForecast(latitude, longitude) {
      return get("/data/2.5/forecast", {
        lat: latitude,
        lon: longitude,
        units: "metric",
      });
    },

    getCurrentAirPollution(latitude, longitude) {
      return get("/data/2.5/air_pollution", {
        lat: latitude,
        lon: longitude,
      });
    },

    getAirPollutionForecast(latitude, longitude) {
      return get("/data/2.5/air_pollution/forecast", {
        lat: latitude,
        lon: longitude,
      });
    },
  };
}
