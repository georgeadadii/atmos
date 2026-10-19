import assert from "node:assert/strict";
import test from "node:test";

import {
  createDailyOverview,
  createWeatherChart,
  FORECAST_METRICS,
  nextExpandedDate,
} from "../public/forecastChart.js";

const period = (localTime, values = {}) => ({ localTime, ...values });

test("forecast metrics expose the supported labels and units", () => {
  assert.deepEqual(
    FORECAST_METRICS.map(({ key, unit }) => [key, unit]),
    [
      ["temperature", "°C"],
      ["rain-chance", "%"],
      ["rainfall", "mm"],
      ["wind", "km/h"],
      ["humidity", "%"],
      ["cloud-coverage", "%"],
      ["pressure", "hPa"],
      ["visibility", "km"],
    ],
  );
});

test("temperature chart includes actual and feels-like series", () => {
  const chart = createWeatherChart([
    period("06:00", { temperatureCelsius: -3, feelsLikeCelsius: -6 }),
    period("09:00", { temperatureCelsius: 2, feelsLikeCelsius: -1 }),
  ]);
  assert.equal(chart.metric.key, "temperature");
  assert.deepEqual(chart.series.map((series) => series.label), [
    "Temperature",
    "Feels like",
  ]);
  assert.deepEqual(chart.series[0].points.map((point) => point.value), [-3, 2]);
  assert.deepEqual(chart.series[1].points.map((point) => point.value), [-6, -1]);
});

test("wind chart keeps gusts separate and does not bridge missing gusts", () => {
  const chart = createWeatherChart([
    period("06:00", { windSpeedKmh: 10, windGustKmh: 18 }),
    period("09:00", { windSpeedKmh: 12, windGustKmh: null }),
    period("12:00", { windSpeedKmh: 9, windGustKmh: 15 }),
  ], "wind");
  assert.equal(chart.metric.unit, "km/h");
  assert.equal(chart.series[0].segments.length, 1);
  assert.deepEqual(chart.series[1].segments, []);
});

test("rainfall chart uses bars and a zero-based millimetre scale", () => {
  const chart = createWeatherChart([
    period("06:00", { rainfallMm: 0 }),
    period("09:00", { rainfallMm: 2.4 }),
  ], "rainfall");
  assert.equal(chart.metric.presentation, "bar");
  assert.equal(chart.metric.unit, "mm");
  assert.equal(chart.minimum, 0);
  assert.ok(chart.barWidth > 0);
});

test("percentage metrics use a stable zero to one hundred scale", () => {
  for (const [metric, field] of [
    ["rain-chance", "precipitationProbabilityPercent"],
    ["humidity", "humidityPercent"],
    ["cloud-coverage", "cloudCoveragePercent"],
  ]) {
    const chart = createWeatherChart([
      period("09:00", { [field]: 64 }),
    ], metric);
    assert.equal(chart.minimum, 0);
    assert.equal(chart.maximum, 100);
    assert.equal(chart.metric.unit, "%");
  }
});

test("visibility is converted from metres to kilometres", () => {
  const chart = createWeatherChart([
    period("09:00", { visibilityMetres: 9_500 }),
  ], "visibility");
  assert.equal(chart.series[0].points[0].value, 9.5);
  assert.equal(chart.metric.unit, "km");
});

test("missing optional values produce an honest unavailable chart", () => {
  const chart = createWeatherChart([
    period("06:00", { humidityPercent: null }),
    period("09:00", { humidityPercent: Number.NaN }),
  ], "humidity");
  assert.equal(chart.available, false);
  assert.deepEqual(chart.points, []);
  assert.deepEqual(chart.series[0].segments, []);
});

test("single and flat observations always produce finite geometry", () => {
  const single = createWeatherChart([
    period("09:00", { pressureHpa: 1013 }),
  ], "pressure", { width: 320 });
  assert.equal(single.points.length, 1);
  assert.equal(single.points[0].x, (single.plot.left + 320 - single.plot.right) / 2);

  const flat = createWeatherChart([
    period("06:00", { temperatureCelsius: -5 }),
    period("09:00", { temperatureCelsius: -5 }),
  ], "temperature");
  for (const point of [...single.points, ...flat.points]) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }
  assert.equal(new Set(flat.series[0].points.map((point) => point.y)).size, 1);
});

test("chart geometry responds to its supplied container width", () => {
  const periods = [
    period("06:00", { temperatureCelsius: 4 }),
    period("09:00", { temperatureCelsius: 8 }),
  ];
  const mobile = createWeatherChart(periods, "temperature", { width: 320 });
  const desktop = createWeatherChart(periods, "temperature", { width: 960 });
  assert.equal(mobile.width, 320);
  assert.equal(desktop.width, 960);
  assert.ok(mobile.height < desktop.height);
  assert.equal(mobile.series[0].points.at(-1).x, 320 - mobile.plot.right);
  assert.equal(desktop.series[0].points.at(-1).x, 960 - desktop.plot.right);
});

test("daily overview derives concise statistics from available periods", () => {
  const overview = createDailyOverview({
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 13,
    totalRainfallMm: 2.6,
    partialCoverage: true,
    periods: [
      period("06:00", {
        precipitationProbabilityPercent: 20,
        windGustKmh: 18,
        humidityPercent: 70,
        cloudCoveragePercent: 40,
      }),
      period("09:00", {
        precipitationProbabilityPercent: 65,
        windGustKmh: null,
        humidityPercent: 80,
        cloudCoveragePercent: 90,
      }),
    ],
  });
  assert.deepEqual(
    Object.fromEntries(overview.map((item) => [item.key, item.value])),
    {
      "temperature-range": "4 to 13",
      "maximum-rain-chance": 65,
      "total-rainfall": 2.6,
      "maximum-wind-gust": 18,
      "average-humidity": 75,
      "average-cloud-coverage": 65,
    },
  );
});

test("daily overview reports unavailable optional summaries honestly", () => {
  const overview = createDailyOverview({ periods: [], partialCoverage: true });
  assert.ok(overview.every((item) => item.value === null));
});

test("disclosure state toggles and keeps only one date expanded", () => {
  assert.equal(nextExpandedDate(null, "2026-10-19"), "2026-10-19");
  assert.equal(
    nextExpandedDate("2026-10-19", "2026-10-20"),
    "2026-10-20",
  );
  assert.equal(nextExpandedDate("2026-10-20", "2026-10-20"), null);
});
