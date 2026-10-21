import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_ICONS,
  activityIconName,
  packingIconName,
  weatherIconName,
} from "../public/iconMappings.js";

test("maps every supported activity identifier to one Lucide icon", () => {
  const expectedIdentifiers = [
    "sightseeing",
    "beach",
    "hiking",
    "museums",
    "shopping",
    "outdoor-dining",
    "historical-sites",
    "parks-gardens",
    "art-galleries",
    "cafes",
    "cultural-attractions",
    "indoor-entertainment",
  ];

  assert.deepEqual(Object.keys(ACTIVITY_ICONS), expectedIdentifiers);
  for (const identifier of expectedIdentifiers) {
    assert.match(activityIconName(identifier), /^[a-z]+(?:-[a-z]+)*$/);
  }
  assert.equal(activityIconName("unknown"), "circle-alert");
});

test("maps OpenWeather conditions and day or night identifiers deterministically", () => {
  assert.equal(weatherIconName({ name: "Clear", icon: "01d" }), "sun");
  assert.equal(weatherIconName({ name: "Clear", icon: "01n" }), "moon");
  assert.equal(weatherIconName({ name: "Clouds", icon: "02d" }), "cloud-sun");
  assert.equal(weatherIconName({ name: "Clouds", icon: "02n" }), "cloud-moon");
  assert.equal(weatherIconName({ name: "Clouds", icon: "04d" }), "cloud");
  assert.equal(weatherIconName({ name: "Rain", description: "light rain" }), "cloud-rain");
  assert.equal(weatherIconName({ name: "Rain", description: "heavy intensity rain" }), "cloud-rain-wind");
  assert.equal(weatherIconName({ name: "Thunderstorm" }), "cloud-lightning");
  assert.equal(weatherIconName({ name: "Drizzle" }), "cloud-drizzle");
  assert.equal(weatherIconName({ name: "Snow" }), "cloud-snow");
  assert.equal(weatherIconName({ name: "Fog" }), "cloud-fog");
  assert.equal(weatherIconName({ name: "Squall" }), "wind");
  assert.equal(weatherIconName({ name: "Tornado" }), "tornado");
  assert.equal(weatherIconName({ name: "Unknown" }), "cloud");
});

test("maps packing temperature categories to Lucide weather icons", () => {
  assert.equal(packingIconName("Cold"), "snowflake");
  assert.equal(packingIconName("Mild"), "cloud-sun");
  assert.equal(packingIconName("Hot"), "sun");
  assert.equal(packingIconName("Unknown"), "backpack");
});
