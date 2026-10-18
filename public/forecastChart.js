const roundCoordinate = (value) => Number(value.toFixed(2));

export function createTemperatureChart(
  periods,
  { width = 640, height = 210 } = {},
) {
  const padding = { top: 24, right: 24, bottom: 42, left: 48 };
  const source = Array.isArray(periods) ? periods : [];
  const candidates = source.map((period, index) => ({
      index,
      time: typeof period?.localTime === "string" ? period.localTime : "",
      temperature: period?.temperatureCelsius,
    }));
  const observations = candidates.filter((item) =>
    Number.isFinite(item.temperature),
  );

  if (!observations.length) {
    return {
      width,
      height,
      plot: padding,
      points: [],
      polyline: "",
      segments: [],
      minimumTemperature: null,
      maximumTemperature: null,
      yTicks: [],
    };
  }

  const temperatures = observations.map((item) => item.temperature);
  const observedMinimum = Math.min(...temperatures);
  const observedMaximum = Math.max(...temperatures);
  const scaleMinimum = Math.floor(observedMinimum) - 1;
  const scaleMaximum = Math.ceil(observedMaximum) + 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (index) =>
    candidates.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (candidates.length - 1)) * plotWidth;
  const yFor = (temperature) =>
    padding.top +
    ((scaleMaximum - temperature) / (scaleMaximum - scaleMinimum)) *
      plotHeight;
  const points = observations.map((item) => ({
    ...item,
    x: roundCoordinate(xFor(item.index)),
    y: roundCoordinate(yFor(item.temperature)),
  }));
  const segmentPoints = [];
  for (const point of points) {
    const current = segmentPoints.at(-1);
    if (!current || point.index !== current.at(-1).index + 1) {
      segmentPoints.push([point]);
    } else {
      current.push(point);
    }
  }
  const segments = segmentPoints
    .filter((segment) => segment.length > 1)
    .map((segment) => segment.map((point) => `${point.x},${point.y}`).join(" "));

  return {
    width,
    height,
    plot: padding,
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
    segments,
    minimumTemperature: scaleMinimum,
    maximumTemperature: scaleMaximum,
    yTicks: [scaleMaximum, roundCoordinate((scaleMaximum + scaleMinimum) / 2), scaleMinimum]
      .map((temperature) => ({
        temperature,
        y: roundCoordinate(yFor(temperature)),
      })),
  };
}
