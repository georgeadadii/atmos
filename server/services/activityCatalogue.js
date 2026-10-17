const activities = [
  {
    id: "sightseeing",
    name: "Sightseeing",
    description: "Explore a destination's outdoor landmarks and streets.",
    environment: "outdoor",
    preferences: {
      minimumTemperature: 10,
      maximumTemperature: 26,
      temperaturePenaltyPerDegree: 2,
      rainPenaltyPerMillimetre: 5,
      rainyIntervalPenalty: 20,
      maximumWindSpeedKmh: 35,
      windPenaltyPerKmh: 1,
      windyIntervalPenalty: 8,
      missingIntervalPenalty: 2,
    },
  },
  {
    id: "beach",
    name: "Beach",
    description: "Spend time relaxing at the beach.",
    environment: "outdoor",
    preferences: {
      minimumTemperature: 20,
      maximumTemperature: 30,
      temperaturePenaltyPerDegree: 4,
      rainPenaltyPerMillimetre: 9,
      rainyIntervalPenalty: 30,
      maximumWindSpeedKmh: 25,
      windPenaltyPerKmh: 2,
      windyIntervalPenalty: 12,
      missingIntervalPenalty: 2.5,
    },
  },
  {
    id: "hiking",
    name: "Hiking",
    description: "Take a day hike on local trails.",
    environment: "outdoor",
    preferences: {
      minimumTemperature: 8,
      maximumTemperature: 24,
      temperaturePenaltyPerDegree: 2.5,
      rainPenaltyPerMillimetre: 7,
      rainyIntervalPenalty: 28,
      maximumWindSpeedKmh: 30,
      windPenaltyPerKmh: 2,
      windyIntervalPenalty: 15,
      missingIntervalPenalty: 2.5,
    },
  },
  {
    id: "museums",
    name: "Museums",
    description: "Visit indoor museums and exhibitions.",
    environment: "indoor",
    preferences: {
      minimumTemperature: 4,
      maximumTemperature: 32,
      temperaturePenaltyPerDegree: 0.4,
      rainPenaltyPerMillimetre: 0.2,
      rainyIntervalPenalty: 1,
      maximumWindSpeedKmh: 60,
      windPenaltyPerKmh: 0.2,
      windyIntervalPenalty: 1,
      missingIntervalPenalty: 0.5,
    },
  },
  {
    id: "shopping",
    name: "Shopping",
    description: "Browse indoor shops and covered shopping areas.",
    environment: "indoor",
    preferences: {
      minimumTemperature: 4,
      maximumTemperature: 32,
      temperaturePenaltyPerDegree: 0.5,
      rainPenaltyPerMillimetre: 0.4,
      rainyIntervalPenalty: 2,
      maximumWindSpeedKmh: 55,
      windPenaltyPerKmh: 0.25,
      windyIntervalPenalty: 1,
      missingIntervalPenalty: 0.5,
    },
  },
  {
    id: "outdoor-dining",
    name: "Outdoor dining",
    description: "Enjoy a meal at an outdoor table or terrace.",
    environment: "outdoor",
    preferences: {
      minimumTemperature: 15,
      maximumTemperature: 28,
      temperaturePenaltyPerDegree: 2.5,
      rainPenaltyPerMillimetre: 8,
      rainyIntervalPenalty: 30,
      maximumWindSpeedKmh: 25,
      windPenaltyPerKmh: 1.5,
      windyIntervalPenalty: 12,
      missingIntervalPenalty: 2,
    },
  },
];

export const ACTIVITY_CATALOGUE = Object.freeze(
  activities.map((activity) =>
    Object.freeze({
      ...activity,
      preferences: Object.freeze({ ...activity.preferences }),
    }),
  ),
);

const activitiesById = new Map(
  ACTIVITY_CATALOGUE.map((activity) => [activity.id, activity]),
);

export function getActivity(identifier) {
  return activitiesById.get(identifier);
}

export function supportedActivityIds() {
  return ACTIVITY_CATALOGUE.map((activity) => activity.id);
}
