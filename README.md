# Atmos

Atmos is a weather-aware travel planning application for CSU44000 Internet Applications at Trinity College Dublin. It provides a responsive Vue 3 dashboard, an Express backend, a health endpoint, and a server-side travel weather API. There is no frontend build process or scaffolding system.

## Technologies

- HTML5, CSS3, JavaScript, and Vue 3 loaded from a CDN
- Node.js 22+ and Express
- Native `fetch` and the OpenWeather Geocoding, 5 day / 3 hour Forecast, and Air Pollution APIs
- Node.js built-in test runner

## Project structure

```text
atmos/
├── public/
├── server/
│   ├── routes/travel.js
│   ├── routes/itinerary.js
│   ├── services/
│   │   ├── activityCatalogue.js
│   │   ├── activityScoring.js
│   │   ├── airQuality.js
│   │   ├── destinationSelection.js
│   │   ├── itineraryPlanner.js
│   │   ├── openWeather.js
│   │   ├── packingRecommendations.js
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

Set `OPENWEATHER_API_KEY` in `.env`. The key is read only by the backend and must not be placed in `public/` or committed. `PORT` is optional and defaults to `3000`.

Start the application with `npm start`. For automatic server restarts during development, use `npm run dev`. The application is served at <http://localhost:3000>, and `GET /api/health` returns the service status.

The dashboard lets a user search by city or city/country combination, then presents the destination-local three-day forecast, partial-coverage labels, server-generated packing advice, current AQI, pollutant warnings, all pollutant maxima, and data limitations. It uses Vue's `v-model`, `v-if`/`v-else`, `v-for`, event directives, computed values, and moustache interpolation directly in `public/index.html`. Requests use native `fetch`; an `AbortController` and request identifier prevent an older response replacing a newer search.

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
        "partialCoverage": true
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

`POST /api/itinerary` creates a three-day, weather-aware itinerary from a destination, one or more supported activity identifiers, and a daily capacity of 1, 2 or 3. It reuses the travel API's geocoding and coordinate-selection workflow, but makes only one forecast request and does not request air-quality data.

Supported activities and their principal preferences are:

| Identifier | Environment | Preferred temperature | Rain sensitivity | Wind limit |
| --- | --- | ---: | --- | ---: |
| `sightseeing` | Outdoor | 10–26°C | Moderate | 35 km/h |
| `beach` | Outdoor | 20–30°C | Very high | 25 km/h |
| `hiking` | Outdoor | 8–24°C | High | 30 km/h |
| `museums` | Indoor | 4–32°C | Very low | 60 km/h |
| `shopping` | Indoor | 4–32°C | Low | 55 km/h |
| `outdoor-dining` | Outdoor | 15–28°C | Very high | 25 km/h |

The exact penalty weights are points per unit plus the maximum interval-share penalty. For example, beach rain costs 9 points/mm plus up to 30 points when every available interval is rainy.

| Identifier | Temperature / °C outside range | Rain / mm + rainy share | Wind / km/h over limit + windy share | Missing interval |
| --- | ---: | ---: | ---: | ---: |
| `sightseeing` | 2 | 5 + 20 | 1 + 8 | 2 |
| `beach` | 4 | 9 + 30 | 2 + 12 | 2.5 |
| `hiking` | 2.5 | 7 + 28 | 2 + 15 | 2.5 |
| `museums` | 0.4 | 0.2 + 1 | 0.2 + 1 | 0.5 |
| `shopping` | 0.5 | 0.4 + 2 | 0.25 + 1 | 0.5 |
| `outdoor-dining` | 2.5 | 8 + 30 | 1.5 + 12 | 2 |

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

They cover health, geocoding, ambiguity, malformed responses, failure mapping and timeouts, destination-local forecast aggregation, incomplete coverage, rain and temperature packing rules, pollutant thresholds and time windows, the complete travel response, activity scoring, optimal assignment and tie-breaking, itinerary validation, and the complete itinerary response. A known three-activity fixture proves the optimiser beats naive sequential placement.
