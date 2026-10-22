// The client classifies pollutants and presents warnings; the server remains
// responsible for fetching and aggregating raw air-quality measurements.
export const AIR_QUALITY_UNIT = "µg/m³";

export const SEVERITIES = Object.freeze([
  "Good",
  "Fair",
  "Moderate",
  "Poor",
  "Very Poor",
]);

export const SEVERITY_GUIDANCE = Object.freeze({
  Fair:
    "Unusually sensitive people may notice effects; consider easing prolonged or strenuous outdoor activity if symptoms occur.",
  Moderate:
    "Sensitive groups may experience effects; consider reducing prolonged or strenuous outdoor activity.",
  Poor:
    "Health effects are more likely, especially for sensitive groups; reduce prolonged or strenuous outdoor activity and follow local advice.",
  "Very Poor":
    "Health effects may be more widespread or serious; avoid prolonged or strenuous outdoor activity and follow local alerts.",
});

export const POLLUTANTS = Object.freeze({
  so2: Object.freeze({
    name: "Sulphur dioxide (SO₂)",
    boundaries: Object.freeze([20, 80, 250, 350]),
    healthEffect:
      "Sulphur dioxide can make breathing harder and can aggravate asthma, especially in children.",
  }),
  no2: Object.freeze({
    name: "Nitrogen dioxide (NO₂)",
    boundaries: Object.freeze([40, 70, 150, 200]),
    healthEffect:
      "Nitrogen dioxide can irritate airways and can aggravate asthma and other respiratory conditions.",
  }),
  pm10: Object.freeze({
    name: "Particulate matter (PM₁₀)",
    boundaries: Object.freeze([20, 50, 100, 200]),
    healthEffect:
      "Inhalable particles can affect the lungs and can worsen existing heart or respiratory conditions.",
  }),
  pm2_5: Object.freeze({
    name: "Fine particulate matter (PM₂.₅)",
    boundaries: Object.freeze([10, 25, 50, 75]),
    healthEffect:
      "Fine particles can reach deep into the lungs and can worsen heart or respiratory conditions.",
  }),
  o3: Object.freeze({
    name: "Ozone (O₃)",
    boundaries: Object.freeze([60, 100, 140, 180]),
    healthEffect:
      "Ground-level ozone can cause coughing or breathing discomfort and can aggravate asthma.",
  }),
  co: Object.freeze({
    name: "Carbon monoxide (CO)",
    boundaries: Object.freeze([4400, 9400, 12400, 15400]),
    healthEffect:
      "Carbon monoxide reduces oxygen delivery to the heart and brain; people with heart disease are especially susceptible.",
  }),
});

export const MEASUREMENT_ONLY_POLLUTANTS = Object.freeze(["no", "nh3"]);

const SEVERITY_RANK = Object.freeze(
  Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index])),
);

const round = (value, places = 1) => Number(value.toFixed(places));
const nonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

export function classifyPollutant(identifier, concentration) {
  const metadata = POLLUTANTS[identifier];
  if (!metadata || !Number.isFinite(concentration) || concentration < 0) {
    return "Unavailable";
  }

  const categoryIndex = metadata.boundaries.findIndex(
    (boundary) => concentration < boundary,
  );
  return categoryIndex === -1 ? "Very Poor" : SEVERITIES[categoryIndex];
}

function warningMessage(
  metadata,
  concentration,
  percentageAboveGoodBoundary,
  severity,
  source,
  healthRisk,
) {
  const measurement = round(concentration, 1).toFixed(1);
  const percentage = round(percentageAboveGoodBoundary);
  const wording = source === "current" ? "is currently" : "is forecast to reach";
  return `${metadata.name} ${wording} ${measurement} ${AIR_QUALITY_UNIT}, ${percentage}% above the Good limit of ${metadata.boundaries[0]} ${AIR_QUALITY_UNIT} (${severity}). ${healthRisk}`;
}

function warningReading(identifier, concentration, timeField, time, source) {
  const metadata = POLLUTANTS[identifier];
  const severity = classifyPollutant(identifier, concentration);
  if (
    severity === "Good" ||
    severity === "Unavailable" ||
    !nonEmptyString(time)
  ) return null;

  const goodBoundary = metadata.boundaries[0];
  const amountAboveGoodBoundary = concentration - goodBoundary;
  const percentageAboveGoodBoundary =
    (amountAboveGoodBoundary / goodBoundary) * 100;
  const healthRisk =
    `${metadata.healthEffect} ${SEVERITY_GUIDANCE[severity]}`;

  return {
    pollutant: identifier,
    name: metadata.name,
    concentration: round(concentration, 2),
    unit: AIR_QUALITY_UNIT,
    goodBoundary,
    severity,
    amountAboveGoodBoundary: round(amountAboveGoodBoundary, 2),
    percentageAboveGoodBoundary: round(percentageAboveGoodBoundary),
    [timeField]: time,
    healthRisk,
    message: warningMessage(
      metadata,
      concentration,
      percentageAboveGoodBoundary,
      severity,
      source,
      healthRisk,
    ),
  };
}

function currentConcentration(components, identifier) {
  const measurement = components?.[identifier];
  return measurement && typeof measurement === "object"
    ? measurement.concentration
    : undefined;
}

function forecastMaximum(maxima, identifier) {
  if (!Array.isArray(maxima)) return null;
  return maxima.find((maximum) => maximum?.pollutant === identifier) ?? null;
}

export function buildPollutantWarnings(airQuality) {
  const observedAt = airQuality?.current?.observedAt;
  const components = airQuality?.current?.components;
  const maxima = airQuality?.forecast?.maxima;

  return Object.entries(POLLUTANTS).flatMap(([pollutant, metadata]) => {
    const current = warningReading(
      pollutant,
      currentConcentration(components, pollutant),
      "observedAt",
      observedAt,
      "current",
    );
    const maximum = forecastMaximum(maxima, pollutant);
    const forecast = warningReading(
      pollutant,
      maximum?.concentration,
      "expectedAt",
      maximum?.expectedAt,
      "forecast",
    );

    if (!current && !forecast) return [];
    const peakSeverity = [current?.severity, forecast?.severity]
      .filter(Boolean)
      .sort((left, right) => SEVERITY_RANK[right] - SEVERITY_RANK[left])[0];

    return [{
      pollutant,
      name: metadata.name,
      unit: AIR_QUALITY_UNIT,
      goodBoundary: metadata.boundaries[0],
      peakSeverity,
      current,
      forecast,
    }];
  });
}
