// Kept client-side so the assignment UI derives packing guidance from forecast data.
export const RAINFALL_THRESHOLDS = Object.freeze({
  NONE_MM: 0,
  MODERATE_MIN_MM: 2.5,
  HEAVY_MIN_MM: 10,
});

const CATEGORY_ORDER = ["Cold", "Mild", "Hot"];

const CATEGORY_ADVICE = Object.freeze({
  Cold: "Pack warm layers and an insulated outer layer.",
  Mild: "Pack light layers that can be adjusted through the day.",
  Hot: "Pack lightweight clothing, sun protection, and water.",
});

export function temperatureCategory(celsius) {
  if (!Number.isFinite(celsius)) return "Unavailable";
  if (celsius < 8) return "Cold";
  if (celsius > 24) return "Hot";
  return "Mild";
}

export function rainfallLevel(totalMm) {
  if (!Number.isFinite(totalMm) || totalMm < 0) {
    return { id: "unavailable", label: "Unavailable" };
  }
  if (totalMm === RAINFALL_THRESHOLDS.NONE_MM) {
    return { id: "none", label: "None" };
  }
  if (totalMm < RAINFALL_THRESHOLDS.MODERATE_MIN_MM) {
    return { id: "light", label: "Light" };
  }
  if (totalMm < RAINFALL_THRESHOLDS.HEAVY_MIN_MM) {
    return { id: "moderate", label: "Moderate" };
  }
  return { id: "heavy", label: "Heavy" };
}

function rainyIntervalDescription(interval, date) {
  if (typeof interval.forecastAt === "string" && interval.forecastAt) {
    return interval.forecastAt;
  }
  if (typeof interval.localTime === "string" && interval.localTime) {
    return `${date} at ${interval.localTime}`;
  }
  if (Number.isFinite(interval.timestamp)) {
    return `${date} (timestamp ${interval.timestamp})`;
  }
  return date;
}

function umbrellaReason(rainyIntervals, validRainfallCount, invalidRainfallCount) {
  if (rainyIntervals.length > 0) {
    const first = rainyIntervals[0];
    const intervalWord = rainyIntervals.length === 1 ? "interval" : "intervals";
    return `Rain is forecast during ${rainyIntervals.length} three-hour ${intervalWord}; the first is ${rainyIntervalDescription(first.interval, first.date)}.`;
  }
  if (validRainfallCount === 0) {
    return "Rainfall data is unavailable for the selected intervals.";
  }
  if (invalidRainfallCount > 0) {
    return `No rainfall is forecast in the available selected intervals; rainfall data is unavailable for ${invalidRainfallCount} interval(s).`;
  }
  return "No rainfall is forecast in the selected intervals.";
}

function intervalRainfall(interval) {
  return Object.hasOwn(interval, "rainfallMm")
    ? interval.rainfallMm
    : interval.rainfall;
}

export function createPackingAdvice(intervalsByDate, dates) {
  const requestedDates = Array.isArray(dates) ? dates : [];
  const requestedIntervals = [];

  for (const date of requestedDates) {
    const intervals = intervalsByDate && typeof intervalsByDate === "object"
      ? intervalsByDate[date]
      : null;
    if (!Array.isArray(intervals)) continue;
    for (const interval of intervals) {
      if (interval && typeof interval === "object") {
        requestedIntervals.push({ date, interval });
      }
    }
  }

  const categorySet = new Set();
  const rainyIntervals = [];
  let validRainfallCount = 0;
  let invalidRainfallCount = 0;

  for (const item of requestedIntervals) {
    const category = temperatureCategory(item.interval.temperature);
    if (category !== "Unavailable") categorySet.add(category);

    const rainfall = intervalRainfall(item.interval);
    if (!Number.isFinite(rainfall) || rainfall < 0) {
      invalidRainfallCount += 1;
      continue;
    }
    validRainfallCount += 1;
    if (rainfall > 0) rainyIntervals.push(item);
  }

  const categories = CATEGORY_ORDER.filter((category) =>
    categorySet.has(category),
  );

  return {
    umbrella: {
      recommended: rainyIntervals.length > 0,
      reason: umbrellaReason(
        rainyIntervals,
        validRainfallCount,
        invalidRainfallCount,
      ),
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
