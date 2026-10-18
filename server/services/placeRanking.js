const EARTH_RADIUS_KM = 6371;
export const MAX_PLACE_DISTANCE_KM = 25;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));
const round = (value, places = 1) => Number(value.toFixed(places));

export function haversineDistanceKm(origin, destination) {
  if (
    !Number.isFinite(origin?.latitude) ||
    !Number.isFinite(origin?.longitude) ||
    !Number.isFinite(destination?.latitude) ||
    !Number.isFinite(destination?.longitude)
  ) {
    return null;
  }
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(destination.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function relevanceFor(types, configuration) {
  const verifiedTypes = new Set(Array.isArray(types) ? types : []);
  if (configuration.strongTypes.some((type) => verifiedTypes.has(type))) {
    return { score: 35, level: "strong" };
  }
  if (configuration.relatedTypes.some((type) => verifiedTypes.has(type))) {
    return { score: 22, level: "related" };
  }
  return null;
}

function explanationFor({
  relevance,
  rating,
  userRatingCount,
  distanceKm,
  verifiedAmenity,
}) {
  const parts = [
    relevance.level === "strong"
      ? "its verified Google place types directly match this activity"
      : "its verified Google place types are related to this activity",
  ];
  if (verifiedAmenity === "outdoorSeating") {
    parts.push("Google reports that it has outdoor seating");
  }
  if (rating === null) {
    parts.push("no Google rating was available, so a neutral rating score was used");
  } else {
    parts.push(`its Google rating is ${rating.toFixed(1)} out of 5`);
  }
  if (userRatingCount === null) {
    parts.push("the review count was unavailable, so no review-confidence points were awarded");
  } else if (userRatingCount < 20) {
    parts.push("that rating is supported by only a small review sample");
  } else if (userRatingCount >= 1000) {
    parts.push("that rating is supported by a large review sample");
  } else {
    parts.push("the available review count provides some confidence in the rating");
  }
  parts.push(
    distanceKm === null
      ? "its distance could not be calculated"
      : `it is about ${round(distanceKm)} km in a straight line from the destination centre`,
  );
  return `Ranked on Atmos because ${parts.join(", and ")}.`;
}

export function scorePlace(candidate, activity, destination) {
  if (
    !candidate ||
    typeof candidate.id !== "string" ||
    !candidate.id ||
    typeof candidate.displayName?.text !== "string" ||
    !candidate.displayName.text.trim()
  ) {
    return null;
  }
  if (
    activity.places.requiredBooleanField &&
    candidate[activity.places.requiredBooleanField] !== true
  ) {
    return null;
  }
  const relevance = relevanceFor(candidate.types, activity.places);
  if (!relevance) return null;

  const rating =
    Number.isFinite(candidate.rating) && candidate.rating >= 0 && candidate.rating <= 5
      ? candidate.rating
      : null;
  const userRatingCount =
    Number.isInteger(candidate.userRatingCount) && candidate.userRatingCount >= 0
      ? candidate.userRatingCount
      : null;
  const distanceKm = haversineDistanceKm(destination, candidate.location);
  if (distanceKm !== null && distanceKm > MAX_PLACE_DISTANCE_KM) return null;

  // A missing rating receives the neutral midpoint, never the maximum.
  const visitorRating = rating === null ? 15 : (rating / 5) * 30;
  // log10 growth reaches the 20-point cap at 10,000 reviews.
  const reviewConfidence =
    userRatingCount === null
      ? 0
      : clamp((Math.log10(userRatingCount + 1) / 4) * 20, 0, 20);
  // This is straight-line distance, with a linear decline to zero at 25 km.
  const proximity =
    distanceKm === null
      ? 0
      : clamp(15 * (1 - distanceKm / MAX_PLACE_DISTANCE_KM), 0, 15);

  const scoreBreakdown = {
    activityRelevance: { score: round(relevance.score), maximum: 35 },
    visitorRating: { score: round(visitorRating), maximum: 30 },
    reviewConfidence: { score: round(reviewConfidence), maximum: 20 },
    proximity: { score: round(proximity), maximum: 15 },
  };
  const placeScore = round(
    Object.values(scoreBreakdown).reduce((sum, component) => sum + component.score, 0),
  );
  const preciseScore =
    relevance.score + visitorRating + reviewConfidence + proximity;

  return {
    id: candidate.id,
    name: candidate.displayName.text.trim(),
    ...(typeof candidate.formattedAddress === "string" && candidate.formattedAddress.trim()
      ? { address: candidate.formattedAddress.trim() }
      : {}),
    ...(rating === null ? {} : { rating }),
    ...(userRatingCount === null ? {} : { userRatingCount }),
    ...(distanceKm === null ? {} : { distanceKm: round(distanceKm) }),
    ...(typeof candidate.googleMapsUri === "string" &&
    candidate.googleMapsUri.startsWith("https://")
      ? { googleMapsUri: candidate.googleMapsUri }
      : {}),
    types: Array.isArray(candidate.types) ? [...candidate.types] : [],
    placeScore,
    scoreBreakdown,
    rankingExplanation: explanationFor({
      relevance,
      rating,
      userRatingCount,
      distanceKm,
      verifiedAmenity: activity.places.requiredBooleanField,
    }),
    _relevanceLevel: relevance.level,
    _preciseScore: preciseScore,
  };
}

export function rankPlaces(candidates, activity, destination) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((candidate) => scorePlace(candidate, activity, destination))
    .filter(Boolean)
    .sort(
      (left, right) =>
        right._preciseScore - left._preciseScore ||
        right.scoreBreakdown.activityRelevance.score -
          left.scoreBreakdown.activityRelevance.score ||
        right.scoreBreakdown.reviewConfidence.score -
          left.scoreBreakdown.reviewConfidence.score ||
        left.id.localeCompare(right.id),
    )
    .map(({ _relevanceLevel, _preciseScore, ...place }) => place);
}
