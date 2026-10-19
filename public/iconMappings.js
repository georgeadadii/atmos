export const ACTIVITY_ICONS = Object.freeze({
  sightseeing: "landmark",
  beach: "umbrella",
  hiking: "mountain",
  museums: "university",
  shopping: "shopping-bag",
  "outdoor-dining": "utensils-crossed",
  "historical-sites": "castle",
  "parks-gardens": "trees",
  "art-galleries": "palette",
  cafes: "coffee",
  "cultural-attractions": "drama",
  "indoor-entertainment": "clapperboard",
});

export function activityIconName(activityId) {
  return ACTIVITY_ICONS[activityId] ?? "circle-alert";
}

export function weatherIconName(condition = {}) {
  const name = String(condition.name ?? condition).toLowerCase();
  const description = String(condition.description ?? "").toLowerCase();
  const openWeatherIcon = String(condition.icon ?? "").toLowerCase();
  const isNight = openWeatherIcon.endsWith("n");

  if (name === "thunderstorm") return "cloud-lightning";
  if (name === "drizzle") return "cloud-drizzle";
  if (name === "rain") {
    return /heavy|extreme|very heavy/.test(description)
      ? "cloud-rain-wind"
      : "cloud-rain";
  }
  if (name === "snow") return "cloud-snow";
  if (["mist", "smoke", "haze", "dust", "fog", "sand", "ash"].includes(name)) {
    return "cloud-fog";
  }
  if (name === "squall") return "wind";
  if (name === "tornado") return "tornado";
  if (name === "clear") return isNight ? "moon" : "sun";
  if (name === "clouds") {
    if (openWeatherIcon.startsWith("02")) return isNight ? "cloud-moon" : "cloud-sun";
    return "cloud";
  }
  return "cloud";
}

export function packingIconName(category) {
  const categoryIcons = {
    Cold: "snowflake",
    Mild: "cloud-sun",
    Hot: "sun",
  };
  return categoryIcons[category] ?? "backpack";
}
