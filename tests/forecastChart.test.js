import assert from "node:assert/strict";
import test from "node:test";

import { createTemperatureChart } from "../public/forecastChart.js";

const period = (localTime, temperatureCelsius) => ({
  localTime,
  temperatureCelsius,
});

test("temperature chart handles empty and missing observations", () => {
  const chart = createTemperatureChart([
    period("06:00", null),
    period("09:00", Number.NaN),
  ]);
  assert.deepEqual(chart.points, []);
  assert.equal(chart.polyline, "");
  assert.deepEqual(chart.segments, []);
  assert.equal(chart.minimumTemperature, null);
});

test("temperature chart centres one observation with finite coordinates", () => {
  const chart = createTemperatureChart([period("09:00", 11)]);
  assert.equal(chart.points.length, 1);
  assert.equal(chart.points[0].x, 332);
  assert.equal(chart.polyline, `${chart.points[0].x},${chart.points[0].y}`);
  assert.ok(Number.isFinite(chart.points[0].y));
});

test("temperature chart connects two chronological observations", () => {
  const chart = createTemperatureChart([
    period("09:00", 4),
    period("12:00", 8),
  ]);
  assert.deepEqual(chart.points.map((point) => point.x), [48, 616]);
  assert.match(chart.polyline, /^48,[\d.]+ 616,[\d.]+$/);
  assert.deepEqual(chart.segments, [chart.polyline]);
});

test("temperature chart does not connect across a missing observation", () => {
  const chart = createTemperatureChart([
    period("06:00", 3),
    period("09:00", null),
    period("12:00", 7),
  ]);
  assert.deepEqual(chart.points.map((point) => point.x), [48, 616]);
  assert.deepEqual(chart.segments, []);
});

test("temperature chart supports flat and negative temperature series", () => {
  const flat = createTemperatureChart([
    period("00:00", -5),
    period("03:00", -5),
    period("06:00", -5),
  ]);
  assert.equal(flat.minimumTemperature, -6);
  assert.equal(flat.maximumTemperature, -4);
  assert.equal(new Set(flat.points.map((point) => point.y)).size, 1);
  for (const point of flat.points) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
  }
});

test("temperature chart output is deterministic and bounded", () => {
  const periods = [
    period("06:00", -2.4),
    period("09:00", 1.1),
    period("12:00", 6.8),
    period("15:00", 3.2),
  ];
  const first = createTemperatureChart(periods);
  assert.deepEqual(first, createTemperatureChart(periods));
  for (const point of first.points) {
    assert.ok(point.x >= first.plot.left);
    assert.ok(point.x <= first.width - first.plot.right);
    assert.ok(point.y >= first.plot.top);
    assert.ok(point.y <= first.height - first.plot.bottom);
  }
});
