# Atmos

Atmos is a weather-aware travel planning application for CSU44000 Internet Applications at Trinity College Dublin. It currently provides a Vue 3 CDN frontend, an Express backend, a health endpoint, and a server-side travel weather API. There is no frontend build process or scaffolding system.

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
│   ├── services/
│   │   ├── airQuality.js
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

## Travel API

`GET /api/travel?city=<city>` resolves a destination and returns its three-day weather summary, packing recommendations, and air-quality analysis. URL-encode the query when needed:

```text
GET /api/travel?city=Dublin%2CIE
```

The city may include a country code or state, such as `Dublin,IE` or `Springfield,Illinois,US`. Geocoding never silently selects the first of several results. An ambiguous query returns HTTP `300` with `error.details.candidates`; the client can resubmit a more specific query. No result returns `404`, invalid input returns `400`, and upstream/configuration failures return a consistent error object with an appropriate `5xx` status.

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

## Processing decisions

The three-day period means the current destination-local calendar day plus the following two calendar days. Dates are calculated with the UTC offset in the forecast response, not the server timezone. Each day uses all valid three-hour intervals in that local date: temperature minima/maxima are extrema, wind is averaged and converted from m/s to km/h, and `rain["3h"]` is summed in millimetres. A missing rain field means zero; a malformed interval is excluded and disclosed. A day with fewer than the expected eight intervals is marked `partialCoverage`. If any of the three dates has no usable interval, the request fails rather than presenting a misleading summary.

The representative condition is the most frequent condition among the day's intervals, with the earliest occurrence breaking a tie. Umbrella advice checks every selected interval and is enabled for any rainfall. Temperatures are classified across every interval using the assignment boundaries: Cold below 8°C, Mild from 8°C through 24°C inclusive, and Hot above 24°C. More than one observed class produces mixed-condition advice.

Air pollution is requested from both the current and hourly forecast endpoints. Current readings are reported separately. Forecast analysis uses only timestamps within the same three local dates and reports the maximum expected concentration and time for each classified pollutant. OpenWeather's half-open component bands are centralized in `server/services/airQuality.js`: SO₂, NO₂, PM₁₀, PM₂.₅, O₃, and CO are Good only below 20, 40, 20, 10, 60, and 4400 µg/m³ respectively; a value exactly at a boundary enters the next category. NO and NH₃ are returned as measurements, but no warning category is invented because OpenWeather does not include them in its component AQI bands. General risk text is informational, not medical advice.

The air-pollution forecast is hourly and OpenWeather normally supplies four days. Because a request made partway through today cannot cover past hours, `coverage.complete` may be false; maxima then describe only available readings and the limitation is explicit. Times are rendered in destination-local time using the forecast's fixed UTC offset. This API does not attempt daylight-saving transitions that occur within the three-day window because the 5-day forecast provides an offset rather than an IANA timezone.

## Tests

Tests use deterministic mocked responses and never require a live API key:

```sh
npm test
```

They cover health, geocoding, ambiguity, malformed responses, failure mapping and timeouts, destination-local forecast aggregation, incomplete coverage, rain and temperature packing rules, pollutant thresholds and time windows, and the complete travel response.
