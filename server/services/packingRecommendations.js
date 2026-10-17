export function temperatureCategory(temperatureCelsius) {
  if (temperatureCelsius < 8) return "Cold";
  if (temperatureCelsius > 24) return "Hot";
  return "Mild";
}

const CATEGORY_ADVICE = {
  Cold: "Pack warm layers and an insulated outer layer.",
  Mild: "Pack light layers that can be adjusted through the day.",
  Hot: "Pack lightweight clothing, sun protection, and water.",
};

export function createPackingRecommendations(intervals) {
  const categorySet = new Set(
    intervals.map((interval) => temperatureCategory(interval.temperature)),
  );
  const categories = ["Cold", "Mild", "Hot"].filter((category) =>
    categorySet.has(category),
  );
  const umbrellaRecommended = intervals.some(
    (interval) => interval.rainfall > 0,
  );

  return {
    umbrella: {
      recommended: umbrellaRecommended,
      reason: umbrellaRecommended
        ? "Rain is forecast during at least one three-hour interval."
        : "No rainfall is forecast in the selected intervals.",
    },
    temperature: {
      categories,
      mixedConditions: categories.length > 1,
      advice: categories.map((category) => ({
        category,
        message: CATEGORY_ADVICE[category],
      })),
    },
  };
}
