# Atmos

Atmos is a weather-aware travel planning application for CSU44000 Internet Applications at Trinity College Dublin. It provides a responsive Vue 3 dashboard, an Express backend, a health endpoint, and a server-side travel weather API. There is no frontend build process or scaffolding system.

## Technologies

- HTML5, CSS3, JavaScript, and Vue 3 loaded from a CDN
- Node.js 22+ and Express
- Native `fetch`, the OpenWeather APIs, and Google Places API (New)
- Node.js built-in test runner

## Project structure

```text
atmos/
├── public/
│   ├── forecastChart.js
├── server/
│   ├── routes/activities.js
│   ├── routes/travel.js
│   ├── routes/itinerary.js
│   ├── services/
│   │   ├── activityCatalogue.js
│   │   ├── activityScoring.js
│   │   ├── airQuality.js
│   │   ├── destinationSelection.js
│   │   ├── itineraryPlanner.js
│   │   ├── googlePlaces.js
│   │   ├── openWeather.js
│   │   ├── packingRecommendations.js
│   │   ├── placeRanking.js
│   │   ├── time.js
│   │   └── weatherProcessing.js
│   ├── errors.js
│   └── index.js
├── tests/
├── .env.example
├── package.json
└── README.md
```

## Setup and run

Install dependencies and create the local configuration:

```sh
npm install
cp .env.example .env
```

Set `OPENWEATHER_API_KEY` in `.env`. To enable real-place suggestions, also set `GOOGLE_PLACES_API_KEY`. Both keys are read only by the backend and must not be placed in `public/` or committed. `PORT` is optional and defaults to `3000`. Atmos still generates its complete weather itinerary when the Places key is absent.

Enable **Places API (New)** and billing for the Google Cloud project that owns the Places key. Restrict the key to the Places API and, where deployment permits, to the backend's server IPs. Set project quotas and billing budget alerts appropriate to expected use; these controls reduce risk but do not guarantee that unexpected charges cannot occur. Ratings and review counts raise a search request to Google's Enterprise field tier. Outdoor dining additionally requests `outdoorSeating`, an Enterprise + Atmosphere field, because Atmos otherwise cannot make that claim honestly. The service uses explicit per-category field masks and requests no other fields from those tiers.

Start the application with `npm start`. For automatic server restarts during development, use `npm run dev`. The application is served at <http://localhost:3000>, and `GET /api/health` returns the service status.

The dashboard lets a user search by city or city/country combination, then presents the destination-local three-day forecast, partial-coverage labels, server-generated packing advice, current AQI, pollutant warnings, all pollutant maxima, and data limitations. Each daily summary row is an accessible disclosure for an interactive, full-width chart of the available three-hour periods. The chart selector switches between temperature, rain chance, rainfall, wind, humidity, cloud coverage, pressure and visibility without another API request. A compact overview summarises the available periods, while a chart data table provides the accessible numeric equivalent. Its itinerary planner loads the supported activities, lets the user select activities and a daily maximum, and renders the server-optimised three-day plan with suitability scores and explanations. It uses Vue's `v-model`, `v-if`/`v-else`, `v-for`, event directives, computed values, watchers, and moustache interpolation directly in `public/index.html`.

To use the planner, search for and resolve a destination, select at least one activity, choose a maximum of 1–3 activities per day, and select **Generate my itinerary**. The client explains capacity mismatches before submission. Changing a selection marks the displayed plan as out of date until it is regenerated. Starting a destination search clears the previous itinerary and aborts any pending itinerary request, while retaining activity preferences for convenient replanning.

Both travel and itinerary requests use native `fetch`. Independent `AbortController` instances and request identifiers prevent stale destination or itinerary responses from replacing current state. For ambiguous searches, the exact candidate coordinates selected in the dashboard are retained and included in the itinerary request.

## Travel API

`GET /api/travel?city=<city>` resolves a destination and returns its three-day weather summary, packing recommendations, and air-quality analysis. URL-encode the query when needed:

```text
GET /api/travel?city=Dublin%2CIE
```

The city may include a country code or state, such as `Dublin,IE` or `Springfield,Illinois,US`. Geocoding never silently selects the first of several results. An ambiguous query returns HTTP `300` with `error.details.candidates`; the dashboard presents those candidates as keyboard-accessible choices. Selecting one resubmits the city with the candidate's `latitude` and `longitude`, which the backend matches against fresh geocoding results for deterministic resolution. No result returns `404`, invalid input returns `400`, and upstream/configuration failures return a consistent error object with an appropriate `5xx` status.

An abbreviated success response is:

```json
{
  "destination": {
    "name": "Dublin",
    "country": "IE",
    "state": "Leinster",
    "latitude": 53.3498,
    "longitude": -6.2603
  },
  "forecast": {
    "interpretation": "Three destination-local calendar days including the current day.",
    "timezoneOffsetSeconds": 0,
    "days": [
      {
        "date": "2026-10-17",
        "minimumTemperatureCelsius": 8.2,
        "maximumTemperatureCelsius": 13.1,
        "averageWindSpeedKmh": 17.6,
        "totalRainfallMm": 2.4,
        "representativeCondition": {
          "name": "Rain",
          "description": "light rain",
          "icon": "10d"
        },
        "intervalCount": 4,
        "partialCoverage": true,
        "periods": [
          {
            "forecastAt": "2026-10-17T12:00:00+00:00",
            "localTime": "12:00",
            "temperatureCelsius": 11.2,
            "feelsLikeCelsius": 10.1,
            "precipitationProbabilityPercent": 30,
            "rainfallMm": 0.4,
            "windSpeedKmh": 14.8,
            "windGustKmh": 22.1,
            "windDirectionDegrees": 240,
            "humidityPercent": 78,
            "cloudCoveragePercent": 85,
            "pressureHpa": 1013,
            "visibilityMetres": 10000,
            "condition": {
              "name": "Rain",
              "description": "light rain",
              "icon": "10d"
            }
          }
        ]
      }
    ]
  },
  "packing": {
    "umbrella": {
      "recommended": true,
      "reason": "Rain is forecast during at least one three-hour interval."
    },
    "temperature": {
      "categories": ["Mild"],
      "mixedConditions": false,
      "advice": [
        {
          "category": "Mild",
          "message": "Pack light layers that can be adjusted through the day."
        }
      ]
    }
  },
  "airQuality": {
    "current": {
      "observedAt": "2026-10-17T12:00:00+00:00",
      "aqi": 1,
      "aqiClassification": "Good",
      "components": {
        "pm2_5": { "concentration": 7.2, "unit": "µg/m³" }
      }
    },
    "forecast": {
      "period": { "startDate": "2026-10-17", "endDate": "2026-10-19" },
      "readingCount": 60,
      "coverage": {
        "complete": false,
        "firstReadingAt": "2026-10-17T13:00:00+00:00",
        "lastReadingAt": "2026-10-19T23:00:00+00:00"
      },
      "maxima": [
        {
          "pollutant": "o3",
          "name": "Ozone (O₃)",
          "concentration": 81.03,
          "unit": "µg/m³",
          "goodThreshold": 60,
          "classification": "Fair",
          "expectedAt": "2026-10-18T16:00:00+01:00",
          "amountAboveGoodThreshold": 21.03,
          "percentageAboveGoodThreshold": 35.1,
          "risk": "Elevated ground-level ozone may cause breathing discomfort and aggravate respiratory conditions."
        }
      ],
      "warnings": [
        {
          "pollutant": "o3",
          "classification": "Fair",
          "concentration": 81.03,
          "unit": "µg/m³"
        }
      ]
    }
  },
  "limitations": [
    "One or more days contain fewer than eight three-hour forecast intervals and are marked as partial."
  ]
}
```

The `periods` arrays are derived from the same OpenWeather 5-day / 3-hour response used for daily summaries, so this feature needs no additional OpenWeather subscription or request. Periods are chronological and are grouped and labelled using OpenWeather's fixed offset for the destination. This avoids applying the browser's timezone, but a fixed offset cannot model every daylight-saving transition like an IANA timezone can.

OpenWeather supplies observations at three-hour resolution rather than for every clock hour. The current day and occasional later days can therefore have partial coverage. Atmos shows only the available periods and never fills gaps. Optional measurements are returned as `null` and shown as unavailable when the provider omits them or supplies invalid values. In line with OpenWeather's forecast semantics and the established daily aggregation, an omitted `rain` object means no rain is forecast and is shown as `0 mm`; a present but malformed rain measurement remains unavailable.

The detailed chart observes its container width and recalculates SVG coordinates when the layout changes. Temperature and wind use separate primary and secondary lines for actual versus feels-like temperature and wind versus gusts. Rainfall uses bars, percentage measurements use a stable 0 to 100 scale, and missing values are never joined across a gap. Chart points can be inspected with a pointer or keyboard, and the currently selected time and value are also displayed as text.

The daily overview uses the existing daily temperature range and rainfall total. It derives maximum precipitation probability, maximum wind gust, average humidity and average cloud coverage from only the valid values in the available periods. When coverage is partial, the interface states that these values do not represent a complete eight-period day.

Errors never include the API key or a stack trace:

```json
{
  "error": {
    "code": "CITY_NOT_FOUND",
    "message": "No matching destination was found."
  }
}
```

## Itinerary API

`GET /api/activities` returns the twelve supported activities with only their public display fields: `id`, `name`, `description`, and `environment`, plus the global `maximumSelectedActivities` value. The dashboard uses this endpoint instead of duplicating the server catalogue or exposing internal scoring or Places search configuration.

`POST /api/itinerary` creates a three-day, weather-aware itinerary from a destination, one to six supported activity identifiers, and a daily capacity of 1, 2 or 3. It reuses the travel API's validated geocoding coordinates, makes one forecast request, and does not request air-quality data. The catalogue is larger for browsing, but the six-selection cap keeps the exhaustive scheduler's search space bounded. Both browser and server enforce this cap.

Supported activities and their principal preferences are:

| Identifier | Environment | Preferred temperature | Rain sensitivity | Wind limit |
| --- | --- | ---: | --- | ---: |
| `sightseeing` | Outdoor | 10–26°C | Moderate | 35 km/h |
| `beach` | Outdoor | 20–30°C | Very high | 25 km/h |
| `hiking` | Outdoor | 8–24°C | High | 30 km/h |
| `museums` | Indoor | 4–32°C | Very low | 60 km/h |
| `shopping` | Indoor | 4–32°C | Low | 55 km/h |
| `outdoor-dining` | Outdoor | 15–28°C | Very high | 25 km/h |
| `historical-sites` | Outdoor | 8–27°C | Moderate | 38 km/h |
| `parks-gardens` | Outdoor | 10–28°C | Moderate | 35 km/h |
| `art-galleries` | Indoor | 4–32°C | Very low | 60 km/h |
| `cafes` | Indoor | 3–33°C | Very low | 60 km/h |
| `cultural-attractions` | Indoor | 7–29°C | Low | 45 km/h |
| `indoor-entertainment` | Indoor | 3–33°C | Very low | 60 km/h |

The exact penalty weights are points per unit plus the maximum interval-share penalty. For example, beach rain costs 9 points/mm plus up to 30 points when every available interval is rainy.

| Identifier | Temperature / °C outside range | Rain / mm + rainy share | Wind / km/h over limit + windy share | Missing interval |
| --- | ---: | ---: | ---: | ---: |
| `sightseeing` | 2 | 5 + 20 | 1 + 8 | 2 |
| `beach` | 4 | 9 + 30 | 2 + 12 | 2.5 |
| `hiking` | 2.5 | 7 + 28 | 2 + 15 | 2.5 |
| `museums` | 0.4 | 0.2 + 1 | 0.2 + 1 | 0.5 |
| `shopping` | 0.5 | 0.4 + 2 | 0.25 + 1 | 0.5 |
| `outdoor-dining` | 2.5 | 8 + 30 | 1.5 + 12 | 2 |
| `historical-sites` | 1.8 | 4 + 16 | 0.8 + 6 | 2 |
| `parks-gardens` | 2 | 5 + 20 | 1 + 8 | 2 |
| `art-galleries` | 0.4 | 0.2 + 1 | 0.2 + 1 | 0.5 |
| `cafes` | 0.4 | 0.3 + 1.5 | 0.2 + 1 | 0.5 |
| `cultural-attractions` | 1 | 2 + 8 | 0.5 + 4 | 1 |
| `indoor-entertainment` | 0.35 | 0.2 + 1 | 0.2 + 1 | 0.5 |

Example request:

```http
POST /api/itinerary
Content-Type: application/json

{
  "city": "Barcelona,ES",
  "activities": ["beach", "sightseeing", "museums", "hiking"],
  "activitiesPerDay": 2
}
```

When resolving a candidate returned by an `AMBIGUOUS_CITY` response, include its validated coordinates in the same body:

```json
{
  "city": "Springfield",
  "latitude": 39.7817,
  "longitude": -89.6501,
  "activities": ["sightseeing", "museums"],
  "activitiesPerDay": 1
}
```

An abbreviated success response is:

```json
{
  "destination": {
    "name": "Barcelona",
    "country": "ES",
    "latitude": 41.3829,
    "longitude": 2.1774
  },
  "preferences": {
    "activities": ["beach", "sightseeing", "museums", "hiking"],
    "activitiesPerDay": 2
  },
  "forecast": {
    "interpretation": "Three destination-local calendar days including the current day.",
    "timezoneOffsetSeconds": 7200
  },
  "itinerary": {
    "days": [
      {
        "date": "2026-10-17",
        "forecast": {
          "date": "2026-10-17",
          "minimumTemperatureCelsius": 20.2,
          "maximumTemperatureCelsius": 26.1,
          "averageWindSpeedKmh": 12.4,
          "totalRainfallMm": 0,
          "representativeCondition": {
            "name": "Clear",
            "description": "clear sky",
            "icon": "01d"
          },
          "intervalCount": 4,
          "partialCoverage": true
        },
        "activities": [
          {
            "id": "beach",
            "name": "Beach",
            "description": "Spend time relaxing at the beach.",
            "environment": "outdoor",
            "suitabilityScore": 90,
            "reason": "This is its highest-scoring forecast day. 20.2–26.1°C temperatures are within its preferred 20–30°C range; no rain appears in the available intervals; and winds peak at 15.1 km/h. Incomplete forecast coverage reduced the score."
          }
        ]
      }
    ],
    "overallScore": 86
  },
  "limitations": [
    "One or more days contain fewer than eight three-hour forecast intervals and are marked as partial.",
    "Suitability scores are application-defined weather heuristics, not safety guarantees.",
    "Activities are assigned to whole days; the itinerary does not choose an hour or a venue."
  ]
}
```

The score for each activity/day pair starts at 100 and is clamped to 0–100 after four documented penalties:

- Temperature: the mean distance of the three-hour temperatures outside the activity's preferred range, multiplied by its activity-specific temperature weight.
- Rain: total millimetres multiplied by the activity's rain weight, plus a penalty based on the fraction of intervals containing rain. This prevents a daily summary from hiding a rainy interval.
- Wind: the mean amount by which intervals exceed the activity's wind limit, plus a penalty based on the fraction of over-limit intervals.
- Coverage: each missing interval from the expected eight reduces the score. Outdoor activities receive a larger reduction, so missing data is not treated as favourable weather.

These weights are deliberately stronger for beach, hiking, and outdoor dining and much lighter for museums and shopping. They are application heuristics rather than scientifically validated safety guidance. The response explains the actual temperature range, interval rainfall, peak wind, partial coverage, and whether capacity caused placement on a day other than the activity's best-scoring day.

The scheduler evaluates every assignment of the selected activities to the three days, rejects assignments that exceed `activitiesPerDay`, and chooses the assignment with the greatest sum of suitability scores. Each selected activity is scheduled exactly once. Activities are sorted by identifier and equal-score assignments prefer the lexicographically earliest day-index sequence, making ties deterministic. For `A` activities the search is `O(3^A × A)` with small constant memory; the fixed catalogue limits `A` to six, so at most 729 complete assignments exist before capacity pruning. This bounded exhaustive search is simpler and more auditable than an optimisation dependency.

Requests fail with predictable JSON errors for a missing body or city, empty/non-string selections, duplicate or unknown identifiers, invalid coordinates, capacities outside 1–3, and more activities than the available `3 × activitiesPerDay` slots. Ambiguous cities return the same `300` candidate response as the travel API. Missing days, malformed upstream data, authentication failures, rate limits, timeouts, and network failures retain the existing safe weather-service errors. No activity is silently discarded and no weather is fabricated.

The browser adds only presentational score labels (Excellent, Good, Moderate, and Limited); the numeric scores, placement, capacity enforcement, and explanations all come from the server. An empty day is shown as returned and is never filled with a fabricated activity.

## Two independent recommendation systems

Atmos deliberately separates **when** from **where**:

1. The weather scheduler scores every selected activity against each forecast day and remains the sole authority for assigning activities to days.
2. Only after that plan is complete, the place recommender searches around the already validated destination coordinates and ranks possible venues. Google ratings never affect day assignment.

The backend uses Places API (New) `places:searchNearby` for supported Table A place types. Outdoor dining uses `places:searchText` because its semantic query is more specific; it applies strict `restaurant` type filtering and a bounded location rectangle, requests Google's `outdoorSeating` field, and rejects results unless that field is explicitly `true`. Every other category uses explicit nearby types, including `hiking_area`, `museum`, `historical_landmark`, `park`, `art_gallery`, `cafe`, `cultural_center`, and `movie_theater` with closely related types where appropriate.

Each search requests at most 10 candidates within a 25 km destination-level area. At most two searches run concurrently. Text results outside the same 25 km straight-line ranking boundary are rejected, and malformed or irrelevant candidates are omitted. Atmos does not persist or pre-fetch Places content and avoids duplicate place IDs across activities when an alternative is available. A result set can therefore contain fewer than three recommendations.

The field mask is:

```text
places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.types,places.rating,places.userRatingCount
```

These are the only fields needed for identity, display, relevance, rating evidence, distance and Maps linking. Search responses are not sent to the browser until the server has filtered and ranked them; the API key is never part of a client request.

Outdoor-dining searches add `places.outdoorSeating` to that mask and use it only as a required boolean filter. No other category requests that higher-tier field.

### Atmos Place Score

The Atmos Place Score is a deterministic application heuristic, not a scientific measure of quality, safety, accessibility or availability:

```text
Place score = activity relevance + visitor rating + review confidence + proximity
Maximum     =          35       +       30       +        20         +    15 = 100
```

- **Activity relevance (0, 22 or 35):** 35 for a verified Google type in the activity's direct-match set, 22 for a verified related type, and rejection when neither set matches. No name-based or unsupported amenity inference is used.
- **Visitor rating (0–30):** a present Google rating is normalised linearly as `rating ÷ 5 × 30`. A missing or invalid rating receives the neutral midpoint of 15, never a maximum. The raw rating component is intentionally separate from review confidence.
- **Review confidence (0–20):** `min(20, log10(review count + 1) ÷ 4 × 20)`. Confidence grows gradually and reaches its cap at 10,000 reviews. A missing or invalid count receives 0. This rewards the amount of evidence without altering Google's rating value.
- **Proximity (0–15):** haversine straight-line distance from the resolved destination centre declines linearly from 15 at the centre to 0 at 25 km. A missing coordinate receives 0; a known distance beyond 25 km is rejected. This is not route distance or journey time.

Components are calculated at full precision for sorting, rounded to one decimal for the response, and the displayed total is the sum of those rounded components. Sorting uses the unrounded total, then activity relevance, review confidence, and finally the stable Google place ID. Identical inputs therefore produce identical output. Addresses and HTTPS Maps links are omitted when missing or malformed rather than invented. A missing display name or stable place ID makes a candidate unusable.

Each scheduled activity always includes `places` and `placeAvailability`. Missing configuration, rejected credentials, quota/rate limiting, network errors, timeouts, malformed payloads, empty results and sparse relevant results all produce an empty or shorter `places` array plus an honest availability message. None of these failures changes or removes the weather itinerary.

### Google Maps attribution and data use

Place cards label their Google-supplied content **Google Maps** and keep it visually separate from Atmos's own weather and ranking output. Maps links open the provider URL returned by Google. If the product later displays reviews, photos, or third-party-attributed fields, their additional author/provider attribution requirements must also be implemented before those fields are shipped.

Google Maps Platform generally restricts caching and storage of Places content (place IDs have a documented exception). This implementation keeps results only in the request/response lifecycle and adds no persistent cache or database. Review the current Places policies and the Google Maps Platform EEA Terms before deployment, especially for an EEA billing account. Google controls supported types, pricing tiers, policy and regional availability, so these should be reviewed again before submission or production use.

Primary references: [Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search), [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search), [Place Types (New)](https://developers.google.com/maps/documentation/places/web-service/place-types), [Place data fields and billing tiers](https://developers.google.com/maps/documentation/places/web-service/data-fields), and [Places policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies).

Known limitations: recommendations use a destination-centre radius rather than neighbourhood context; straight-line proximity is not travel effort; a broad city centre can underrepresent outer districts; place types do not prove opening hours, outdoor seating, accessibility, trail conditions, ticket price or current availability; and some genuine venues may be excluded by conservative type matching.

## Processing decisions

The three-day period means the current destination-local calendar day plus the following two calendar days. Dates are calculated with the UTC offset in the forecast response, not the server timezone. Each day uses all valid three-hour intervals in that local date: temperature minima/maxima are extrema, wind is averaged and converted from m/s to km/h, and `rain["3h"]` is summed in millimetres. A missing rain field means zero; a malformed interval is excluded and disclosed. A day with fewer than the expected eight intervals is marked `partialCoverage`. If any of the three dates has no usable interval, the request fails rather than presenting a misleading summary.

The representative condition is the most frequent condition among the day's intervals, with the earliest occurrence breaking a tie. Umbrella advice checks every selected interval and is enabled for any rainfall. Temperatures are classified across every interval using the assignment boundaries: Cold below 8°C, Mild from 8°C through 24°C inclusive, and Hot above 24°C. More than one observed class produces mixed-condition advice.

Air pollution is requested from both the current and hourly forecast endpoints. Current readings are reported separately. Forecast analysis uses only timestamps within the same three local dates and reports the maximum expected concentration and time for each classified pollutant. OpenWeather's half-open component bands are centralized in `server/services/airQuality.js`: SO₂, NO₂, PM₁₀, PM₂.₅, O₃, and CO are Good only below 20, 40, 20, 10, 60, and 4400 µg/m³ respectively; a value exactly at a boundary enters the next category. NO and NH₃ are returned as measurements, but no warning category is invented because OpenWeather does not include them in its component AQI bands. General risk text is informational, not medical advice.

The dashboard intentionally does not add packing or health conclusions beyond the API response. Its forecast and pollution coverage are limited by OpenWeather's available readings; any detected gaps are shown in the data-notes disclosure.

The air-pollution forecast is hourly and OpenWeather normally supplies four days. Because a request made partway through today cannot cover past hours, `coverage.complete` may be false; maxima then describe only available readings and the limitation is explicit. Times are rendered in destination-local time using the forecast's fixed UTC offset. This API does not attempt daylight-saving transitions that occur within the three-day window because the 5-day forecast provides an offset rather than an IANA timezone.

## Tests

Tests use deterministic mocked responses and never require a live API key:

```sh
npm test
```

They cover health, geocoding, ambiguity, malformed responses, failure mapping and timeouts, destination-local forecast aggregation, incomplete coverage, rain and temperature packing rules, pollutant thresholds and time windows, the complete travel response, public activity catalogue, activity scoring, optimal assignment and tie-breaking, itinerary validation, response-shape checks, and the complete itinerary response. A known three-activity fixture proves the optimiser beats naive sequential placement.
