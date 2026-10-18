const BASE_URL = "https://places.googleapis.com/v1/";
const DEFAULT_TIMEOUT_MS = 6_000;
export const SEARCH_RADIUS_METRES = 25_000;
export const CANDIDATE_LIMIT = 10;
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.types",
  "places.rating",
  "places.userRatingCount",
].join(",");
export const OUTDOOR_DINING_FIELD = "places.outdoorSeating";

const unavailable = (code, message) => ({ places: [], code, message });

function validateDestination(destination) {
  return (
    Number.isFinite(destination?.latitude) &&
    destination.latitude >= -90 &&
    destination.latitude <= 90 &&
    Number.isFinite(destination?.longitude) &&
    destination.longitude >= -180 &&
    destination.longitude <= 180
  );
}

function textSearchRectangle(destination) {
  const latitudeDelta = SEARCH_RADIUS_METRES / 111_320;
  const longitudeScale = Math.max(
    Math.cos((destination.latitude * Math.PI) / 180),
    0.1,
  );
  const longitudeDelta = SEARCH_RADIUS_METRES / (111_320 * longitudeScale);
  return {
    low: {
      latitude: Math.max(-90, destination.latitude - latitudeDelta),
      longitude: Math.max(-180, destination.longitude - longitudeDelta),
    },
    high: {
      latitude: Math.min(90, destination.latitude + latitudeDelta),
      longitude: Math.min(180, destination.longitude + longitudeDelta),
    },
  };
}

function buildRequest(activity, destination) {
  if (activity.places.method === "text") {
    return {
      path: "places:searchText",
      body: {
        textQuery: activity.places.textQuery,
        includedType: activity.places.includedType,
        strictTypeFiltering: true,
        pageSize: CANDIDATE_LIMIT,
        locationRestriction: { rectangle: textSearchRectangle(destination) },
      },
    };
  }
  return {
    path: "places:searchNearby",
    body: {
      includedTypes: activity.places.includedTypes,
      maxResultCount: CANDIDATE_LIMIT,
      rankPreference: "POPULARITY",
      locationRestriction: {
        circle: {
          center: {
            latitude: destination.latitude,
            longitude: destination.longitude,
          },
          radius: SEARCH_RADIUS_METRES,
        },
      },
    },
  };
}

function errorResult(status) {
  if (status === 400 || status === 401 || status === 403) {
    return unavailable(
      "PLACES_AUTHENTICATION_FAILED",
      "Real-place suggestions are unavailable because the Google Places credentials were rejected.",
    );
  }
  if (status === 429) {
    return unavailable(
      "PLACES_RATE_LIMITED",
      "Real-place suggestions are temporarily unavailable because the Google Places rate limit was reached.",
    );
  }
  return unavailable(
    "PLACES_API_FAILURE",
    "Real-place suggestions are temporarily unavailable because Google Places could not complete the search.",
  );
}

export function createGooglePlacesClient({
  apiKey = process.env.GOOGLE_PLACES_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return {
    async search(activity, destination) {
      if (typeof apiKey !== "string" || !apiKey.trim()) {
        return unavailable(
          "PLACES_NOT_CONFIGURED",
          "Real-place suggestions are unavailable because Google Places is not configured.",
        );
      }
      if (typeof fetchImpl !== "function" || !validateDestination(destination)) {
        return unavailable(
          "PLACES_UNAVAILABLE",
          "Real-place suggestions are temporarily unavailable.",
        );
      }

      const request = buildRequest(activity, destination);
      const fieldMask = activity.places.requiredBooleanField === "outdoorSeating"
        ? `${PLACES_FIELD_MASK},${OUTDOOR_DINING_FIELD}`
        : PLACES_FIELD_MASK;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(new URL(`${BASE_URL}${request.path}`), {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
          body: JSON.stringify(request.body),
        });
        if (!response.ok) return errorResult(response.status);
        let payload;
        try {
          payload = await response.json();
        } catch {
          return unavailable(
            "PLACES_INVALID_RESPONSE",
            "Real-place suggestions are unavailable because Google Places returned invalid data.",
          );
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          return unavailable(
            "PLACES_INVALID_RESPONSE",
            "Real-place suggestions are unavailable because Google Places returned invalid data.",
          );
        }
        if (payload.places === undefined) return { places: [], code: "PLACES_EMPTY", message: "No suitable real-place suggestions were found in the search area." };
        if (!Array.isArray(payload.places)) {
          return unavailable(
            "PLACES_INVALID_RESPONSE",
            "Real-place suggestions are unavailable because Google Places returned invalid data.",
          );
        }
        return {
          places: payload.places.slice(0, CANDIDATE_LIMIT),
          code: payload.places.length ? "PLACES_AVAILABLE" : "PLACES_EMPTY",
          message: payload.places.length
            ? "Place data provided by Google Maps."
            : "No suitable real-place suggestions were found in the search area.",
        };
      } catch (error) {
        if (error?.name === "AbortError") {
          return unavailable(
            "PLACES_TIMEOUT",
            "Real-place suggestions are unavailable because Google Places took too long to respond.",
          );
        }
        return unavailable(
          "PLACES_NETWORK_ERROR",
          "Real-place suggestions are unavailable because Google Places could not be reached.",
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
