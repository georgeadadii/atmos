export const TIMEZONE_OFFSET = 0;
export const NOW = Date.parse("2026-01-10T10:00:00.000Z");

export function epoch(value) {
  return Date.parse(value) / 1000;
}

export function weatherInterval(
  dateTime,
  {
    temperature = 12,
    minimum = temperature,
    maximum = temperature,
    windSpeed = 2,
    windGust,
    windDirection,
    rain,
    feelsLike,
    precipitationProbability,
    humidity,
    pressure,
    cloudCoverage,
    visibility,
    condition = "Clouds",
    description = "scattered clouds",
  } = {},
) {
  return {
    dt: epoch(dateTime),
    main: {
      temp: temperature,
      temp_min: minimum,
      temp_max: maximum,
      ...(feelsLike === undefined ? {} : { feels_like: feelsLike }),
      ...(humidity === undefined ? {} : { humidity }),
      ...(pressure === undefined ? {} : { pressure }),
    },
    weather: [{ main: condition, description, icon: "03d" }],
    wind: {
      speed: windSpeed,
      ...(windGust === undefined ? {} : { gust: windGust }),
      ...(windDirection === undefined ? {} : { deg: windDirection }),
    },
    ...(precipitationProbability === undefined
      ? {}
      : { pop: precipitationProbability }),
    ...(rain === undefined ? {} : { rain: { "3h": rain } }),
    ...(cloudCoverage === undefined ? {} : { clouds: { all: cloudCoverage } }),
    ...(visibility === undefined ? {} : { visibility }),
  };
}

export function forecastPayload(overrides = {}) {
  return {
    city: { timezone: TIMEZONE_OFFSET },
    list: [
      weatherInterval("2026-01-10T12:00:00Z", {
        temperature: 99,
        minimum: 99,
        maximum: 99,
        windSpeed: 20,
        rain: 50,
        condition: "Rain",
        description: "current-day rain",
      }),
      weatherInterval("2026-01-11T12:00:00Z", {
        temperature: 7,
        minimum: 6,
        maximum: 8,
        windSpeed: 2,
      }),
      weatherInterval("2026-01-11T15:00:00Z", {
        temperature: 8,
        minimum: 7,
        maximum: 9,
        windSpeed: 4,
        rain: 1.2,
        condition: "Rain",
        description: "light rain",
      }),
      weatherInterval("2026-01-12T00:00:00Z", {
        temperature: 24,
        minimum: 10,
        maximum: 24,
      }),
      weatherInterval("2026-01-13T00:00:00Z", {
        temperature: 24.1,
        minimum: 20,
        maximum: 25,
      }),
    ],
    ...overrides,
  };
}

export const goodComponents = {
  co: 400,
  no: 1,
  no2: 10,
  o3: 30,
  so2: 5,
  pm2_5: 3,
  pm10: 8,
  nh3: 1,
};

export function pollutionReading(dateTime, components = goodComponents, aqi = 1) {
  return {
    dt: epoch(dateTime),
    main: { aqi },
    components: { ...components },
  };
}

export function pollutionPayload(readings) {
  return { list: readings };
}
