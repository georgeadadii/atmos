import assert from "node:assert/strict";
import test from "node:test";

import { getActivity } from "../server/services/activityCatalogue.js";
import {
  haversineDistanceKm,
  rankPlaces,
  scorePlace,
} from "../server/services/placeRanking.js";

const centre = { latitude: 53.35, longitude: -6.26 };
const museum = getActivity("museums");

function candidate(overrides = {}) {
  return {
    id: "place-a",
    displayName: { text: "Example Museum" },
    formattedAddress: "Dublin",
    location: { latitude: 53.351, longitude: -6.26 },
    googleMapsUri: "https://maps.google.com/example",
    types: ["museum"],
    rating: 4.5,
    userRatingCount: 100,
    ...overrides,
  };
}

test("place scores are bounded, deterministic and internally consistent", () => {
  const first = scorePlace(candidate(), museum, centre);
  const second = scorePlace(candidate(), museum, centre);
  assert.deepEqual(first, second);
  assert.ok(first.placeScore >= 0 && first.placeScore <= 100);
  assert.equal(
    first.placeScore,
    Object.values(first.scoreBreakdown).reduce((sum, part) => sum + part.score, 0),
  );
});

test("rating, review confidence and proximity affect their documented components", () => {
  const baseline = scorePlace(candidate(), museum, centre);
  const higherRating = scorePlace(candidate({ rating: 5 }), museum, centre);
  const moreReviews = scorePlace(candidate({ userRatingCount: 10_000 }), museum, centre);
  const farther = scorePlace(
    candidate({ location: { latitude: 53.45, longitude: -6.26 } }),
    museum,
    centre,
  );
  assert.ok(higherRating.scoreBreakdown.visitorRating.score > baseline.scoreBreakdown.visitorRating.score);
  assert.ok(moreReviews.scoreBreakdown.reviewConfidence.score > baseline.scoreBreakdown.reviewConfidence.score);
  assert.ok(farther.scoreBreakdown.proximity.score < baseline.scoreBreakdown.proximity.score);
});

test("strong relevance outranks related relevance and irrelevant candidates are rejected", () => {
  const gallery = getActivity("art-galleries");
  const ranked = rankPlaces([
    candidate({ id: "related", types: ["museum"], rating: 5 }),
    candidate({ id: "strong", types: ["art_gallery"], rating: 4 }),
    candidate({ id: "irrelevant", types: ["restaurant"] }),
  ], gallery, centre);
  assert.deepEqual(ranked.map(({ id }) => id), ["strong", "related"]);
});

test("missing fields receive honest non-maximum treatment", () => {
  const missing = scorePlace(candidate({
    rating: undefined,
    userRatingCount: undefined,
    location: undefined,
    formattedAddress: undefined,
    googleMapsUri: undefined,
  }), museum, centre);
  assert.equal(missing.scoreBreakdown.visitorRating.score, 15);
  assert.equal(missing.scoreBreakdown.reviewConfidence.score, 0);
  assert.equal(missing.scoreBreakdown.proximity.score, 0);
  assert.equal("address" in missing, false);
  assert.equal("googleMapsUri" in missing, false);
});

test("ranking ties use the stable place identifier", () => {
  const ranked = rankPlaces([
    candidate({ id: "z-place" }),
    candidate({ id: "a-place" }),
  ], museum, centre);
  assert.deepEqual(ranked.map(({ id }) => id), ["a-place", "z-place"]);
});

test("haversine reports straight-line distance and distant candidates are excluded", () => {
  assert.ok(haversineDistanceKm(centre, { latitude: 53.36, longitude: -6.26 }) > 1);
  assert.equal(
    scorePlace(candidate({ location: { latitude: 54, longitude: -6.26 } }), museum, centre),
    null,
  );
});

test("outdoor dining requires provider evidence of outdoor seating", () => {
  const dining = getActivity("outdoor-dining");
  const restaurant = candidate({ types: ["restaurant"] });
  assert.equal(scorePlace(restaurant, dining, centre), null);
  assert.ok(scorePlace({ ...restaurant, outdoorSeating: true }, dining, centre));
});
