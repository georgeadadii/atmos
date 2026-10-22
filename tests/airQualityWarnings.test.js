import assert from "node:assert/strict";
import test from "node:test";

import {
  AIR_QUALITY_UNIT,
  buildPollutantWarnings,
  classifyPollutant,
  MEASUREMENT_ONLY_POLLUTANTS,
  POLLUTANTS,
  SEVERITIES,
  SEVERITY_GUIDANCE,
} from "../public/airQualityWarnings.js";

const OBSERVED_AT = "2026-01-10T10:00:00+00:00";
const EXPECTED_AT = "2026-01-11T12:00:00+00:00";

const goodComponents = () => Object.fromEntries([
  ...Object.entries(POLLUTANTS).map(([pollutant, metadata]) => [
    pollutant,
    { concentration: metadata.boundaries[0] - 1, unit: AIR_QUALITY_UNIT },
  ]),
  ["no", { concentration: 1, unit: AIR_QUALITY_UNIT }],
  ["nh3", { concentration: 1, unit: AIR_QUALITY_UNIT }],
]);

const goodMaxima = () => Object.entries(POLLUTANTS).map(
  ([pollutant, metadata]) => ({
    pollutant,
    concentration: metadata.boundaries[0] - 1,
    expectedAt: EXPECTED_AT,
  }),
);

const airQuality = ({ components = goodComponents(), maxima = goodMaxima() } = {}) => ({
  current: { observedAt: OBSERVED_AT, components },
  forecast: { maxima },
});

test("every supported pollutant uses all half-open severity bands", async (context) => {
  assert.deepEqual(SEVERITIES, ["Good", "Fair", "Moderate", "Poor", "Very Poor"]);
  for (const [pollutant, metadata] of Object.entries(POLLUTANTS)) {
    await context.test(pollutant, () => {
      metadata.boundaries.forEach((boundary, index) => {
        assert.equal(classifyPollutant(pollutant, boundary - 0.001), SEVERITIES[index]);
        assert.equal(classifyPollutant(pollutant, boundary), SEVERITIES[index + 1]);
        assert.equal(classifyPollutant(pollutant, boundary + 0.001), SEVERITIES[index + 1]);
      });
      assert.equal(
        classifyPollutant(pollutant, metadata.boundaries.at(-1) + 1),
        "Very Poor",
      );
    });
  }
});

test("classification preserves the specified Good boundaries", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(POLLUTANTS).map(([id, value]) => [id, value.boundaries[0]]),
    ),
    { so2: 20, no2: 40, pm10: 20, pm2_5: 10, o3: 60, co: 4400 },
  );
});

test("invalid and measurement-only classifications are unavailable", () => {
  for (const concentration of [undefined, null, "20", -1, Number.NaN, Infinity]) {
    assert.equal(classifyPollutant("so2", concentration), "Unavailable");
  }
  assert.deepEqual(MEASUREMENT_ONLY_POLLUTANTS, ["no", "nh3"]);
  assert.equal(classifyPollutant("no", 20), "Unavailable");
  assert.equal(classifyPollutant("nh3", 20), "Unavailable");
  assert.equal(classifyPollutant("unknown", 20), "Unavailable");
});

test("all valid Good readings produce no warnings", () => {
  assert.deepEqual(buildPollutantWarnings(airQuality()), []);
});

test("a current-only warning includes calculations, time, health risk, and message", () => {
  const components = goodComponents();
  components.o3.concentration = 81;
  const [warning] = buildPollutantWarnings(airQuality({ components }));

  assert.equal(warning.pollutant, "o3");
  assert.equal(warning.name, "Ozone (O₃)");
  assert.equal(warning.unit, AIR_QUALITY_UNIT);
  assert.equal(warning.goodBoundary, 60);
  assert.equal(warning.peakSeverity, "Fair");
  assert.equal(warning.forecast, null);
  assert.deepEqual(warning.current, {
    pollutant: "o3",
    name: "Ozone (O₃)",
    concentration: 81,
    unit: AIR_QUALITY_UNIT,
    goodBoundary: 60,
    severity: "Fair",
    amountAboveGoodBoundary: 21,
    percentageAboveGoodBoundary: 35,
    observedAt: OBSERVED_AT,
    healthRisk: `${POLLUTANTS.o3.healthEffect} ${SEVERITY_GUIDANCE.Fair}`,
    message: `Ozone (O₃) is currently 81.0 ${AIR_QUALITY_UNIT}, 35% above the Good limit of 60 ${AIR_QUALITY_UNIT} (Fair). ${POLLUTANTS.o3.healthEffect} ${SEVERITY_GUIDANCE.Fair}`,
  });
});

test("a forecast-only warning preserves forecast wording and expected time", () => {
  const maxima = goodMaxima();
  const pm25 = maxima.find(({ pollutant }) => pollutant === "pm2_5");
  pm25.concentration = 30;
  const [warning] = buildPollutantWarnings(airQuality({ maxima }));

  assert.equal(warning.current, null);
  assert.equal(warning.forecast.severity, "Moderate");
  assert.equal(warning.forecast.amountAboveGoodBoundary, 20);
  assert.equal(warning.forecast.percentageAboveGoodBoundary, 200);
  assert.equal(warning.forecast.expectedAt, EXPECTED_AT);
  assert.match(warning.forecast.message, /is forecast to reach 30\.0/);
  assert.match(warning.forecast.message, /200% above the Good limit/);
  assert.match(warning.forecast.healthRisk, /Fine particles can reach deep/);
});

test("current and forecast warnings combine with the highest severity", () => {
  const components = goodComponents();
  components.o3.concentration = 75;
  const maxima = goodMaxima();
  maxima.find(({ pollutant }) => pollutant === "o3").concentration = 145;
  const [warning] = buildPollutantWarnings(airQuality({ components, maxima }));

  assert.equal(warning.peakSeverity, "Poor");
  assert.equal(warning.current.severity, "Fair");
  assert.equal(warning.forecast.severity, "Poor");
  assert.equal(warning.current.observedAt, OBSERVED_AT);
  assert.equal(warning.forecast.expectedAt, EXPECTED_AT);
  assert.notEqual(warning.current.healthRisk, warning.forecast.healthRisk);
});

test("multiple pollutants retain metadata order and correct peak severity", () => {
  const components = goodComponents();
  components.no2.concentration = 75;
  components.co.concentration = 5000;
  const maxima = goodMaxima();
  maxima.find(({ pollutant }) => pollutant === "pm10").concentration = 100;
  maxima.find(({ pollutant }) => pollutant === "co").concentration = 16000;
  const warnings = buildPollutantWarnings(airQuality({ components, maxima }));

  assert.deepEqual(warnings.map(({ pollutant }) => pollutant), ["no2", "pm10", "co"]);
  assert.equal(warnings.find(({ pollutant }) => pollutant === "co").peakSeverity, "Very Poor");
});

test("malformed and non-finite readings are ignored rather than treated as Good", () => {
  const components = goodComponents();
  components.so2.concentration = Number.NaN;
  components.no2.concentration = -1;
  components.pm10 = { concentration: Infinity, unit: AIR_QUALITY_UNIT };
  const maxima = goodMaxima();
  maxima.find(({ pollutant }) => pollutant === "pm2_5").concentration = Number.NaN;
  maxima.find(({ pollutant }) => pollutant === "o3").concentration = -1;

  assert.deepEqual(buildPollutantWarnings(airQuality({ components, maxima })), []);
  assert.equal(classifyPollutant("so2", components.so2.concentration), "Unavailable");
});

test("missing current or forecast data is handled independently", () => {
  const elevatedComponents = goodComponents();
  elevatedComponents.so2.concentration = 20;
  const [currentOnly] = buildPollutantWarnings({
    current: { observedAt: OBSERVED_AT, components: elevatedComponents },
  });
  assert.ok(currentOnly.current);
  assert.equal(currentOnly.forecast, null);

  const elevatedMaxima = goodMaxima();
  elevatedMaxima.find(({ pollutant }) => pollutant === "no2").concentration = 70;
  const [forecastOnly] = buildPollutantWarnings({
    forecast: { maxima: elevatedMaxima },
  });
  assert.equal(forecastOnly.current, null);
  assert.ok(forecastOnly.forecast);
  assert.deepEqual(buildPollutantWarnings(), []);
});

test("readings without their associated time do not create incomplete warnings", () => {
  const components = goodComponents();
  components.so2.concentration = 20;
  const maxima = goodMaxima();
  const no2 = maxima.find(({ pollutant }) => pollutant === "no2");
  no2.concentration = 70;
  delete no2.expectedAt;

  assert.deepEqual(buildPollutantWarnings({
    current: { components },
    forecast: { maxima },
  }), []);
});

test("NO and NH3 never generate threshold warnings", () => {
  const components = goodComponents();
  components.no.concentration = 1_000_000;
  components.nh3.concentration = 1_000_000;
  const maxima = [
    ...goodMaxima(),
    { pollutant: "no", concentration: 1_000_000, expectedAt: EXPECTED_AT },
    { pollutant: "nh3", concentration: 1_000_000, expectedAt: EXPECTED_AT },
  ];
  assert.deepEqual(buildPollutantWarnings(airQuality({ components, maxima })), []);
});

test("warning generation does not mutate air-quality data", () => {
  const input = airQuality();
  const before = structuredClone(input);
  buildPollutantWarnings(input);
  assert.deepEqual(input, before);
});
