const round = (value, places = 1) => Number(value.toFixed(places));
const roundCoordinate = (value) => round(value, 2);

export const FORECAST_METRICS = [
  {
    key: "temperature",
    label: "Temperature",
    unit: "°C",
    scale: "dynamic",
    presentation: "line",
    series: [
      { key: "temperature", label: "Temperature", field: "temperatureCelsius" },
      { key: "feels-like", label: "Feels like", field: "feelsLikeCelsius" },
    ],
  },
  {
    key: "rain-chance",
    label: "Chance of rain",
    unit: "%",
    scale: "percentage",
    presentation: "line",
    series: [{ key: "rain-chance", label: "Chance of rain", field: "precipitationProbabilityPercent" }],
  },
  {
    key: "rainfall",
    label: "Rainfall",
    unit: "mm",
    scale: "zero",
    presentation: "bar",
    series: [{ key: "rainfall", label: "Rainfall", field: "rainfallMm" }],
  },
  {
    key: "wind",
    label: "Wind",
    unit: "km/h",
    scale: "zero",
    presentation: "line",
    series: [
      { key: "wind", label: "Wind speed", field: "windSpeedKmh" },
      { key: "gusts", label: "Gust speed", field: "windGustKmh" },
    ],
  },
  {
    key: "humidity",
    label: "Humidity",
    unit: "%",
    scale: "percentage",
    presentation: "line",
    series: [{ key: "humidity", label: "Humidity", field: "humidityPercent" }],
  },
  {
    key: "cloud-coverage",
    label: "Cloud coverage",
    unit: "%",
    scale: "percentage",
    presentation: "line",
    series: [{ key: "cloud-coverage", label: "Cloud coverage", field: "cloudCoveragePercent" }],
  },
  {
    key: "pressure",
    label: "Atmospheric pressure",
    unit: "hPa",
    scale: "dynamic",
    presentation: "line",
    series: [{ key: "pressure", label: "Pressure", field: "pressureHpa" }],
  },
  {
    key: "visibility",
    label: "Visibility",
    unit: "km",
    scale: "zero",
    presentation: "line",
    series: [{
      key: "visibility",
      label: "Visibility",
      field: "visibilityMetres",
      transform: (value) => value / 1_000,
    }],
  },
];

export function nextExpandedDate(currentDate, selectedDate) {
  return currentDate === selectedDate ? null : selectedDate;
}

function finiteValues(periods, field, transform = (value) => value) {
  return periods
    .map((period) => period?.[field])
    .filter(Number.isFinite)
    .map(transform);
}

function average(values) {
  if (!values.length) return null;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function maximum(values) {
  return values.length ? round(Math.max(...values)) : null;
}

export function createDailyOverview(day) {
  const periods = Array.isArray(day?.periods) ? day.periods : [];
  const minimum = day?.minimumTemperatureCelsius;
  const maximumTemperature = day?.maximumTemperatureCelsius;
  const temperatureAvailable =
    Number.isFinite(minimum) && Number.isFinite(maximumTemperature);
  const rainChances = finiteValues(periods, "precipitationProbabilityPercent");
  const gusts = finiteValues(periods, "windGustKmh");
  const humidity = finiteValues(periods, "humidityPercent");
  const cloudCoverage = finiteValues(periods, "cloudCoveragePercent");

  return [
    {
      key: "temperature-range",
      label: "Temperature range",
      value: temperatureAvailable
        ? `${round(minimum)} to ${round(maximumTemperature)}`
        : null,
      unit: "°C",
    },
    {
      key: "maximum-rain-chance",
      label: "Maximum rain chance",
      value: maximum(rainChances),
      unit: "%",
    },
    {
      key: "total-rainfall",
      label: "Total rainfall",
      value: Number.isFinite(day?.totalRainfallMm)
        ? round(day.totalRainfallMm)
        : null,
      unit: "mm",
    },
    {
      key: "maximum-wind-gust",
      label: "Maximum wind gust",
      value: maximum(gusts),
      unit: "km/h",
    },
    {
      key: "average-humidity",
      label: "Average humidity",
      value: average(humidity),
      unit: "%",
    },
    {
      key: "average-cloud-coverage",
      label: "Average cloud coverage",
      value: average(cloudCoverage),
      unit: "%",
    },
  ];
}

function chartBounds(values, metric) {
  if (metric.scale === "percentage") return { minimum: 0, maximum: 100 };
  const observedMinimum = Math.min(...values);
  const observedMaximum = Math.max(...values);
  if (metric.scale === "zero") {
    return {
      minimum: 0,
      maximum: Math.max(1, Math.ceil(observedMaximum * 1.1)),
    };
  }
  const padding = observedMinimum === observedMaximum
    ? Math.max(1, Math.abs(observedMinimum) * 0.02)
    : Math.max(1, (observedMaximum - observedMinimum) * 0.1);
  return {
    minimum: Math.floor(observedMinimum - padding),
    maximum: Math.ceil(observedMaximum + padding),
  };
}

function lineSegments(points) {
  const groups = [];
  for (const point of points) {
    const current = groups.at(-1);
    if (!current || point.index !== current.at(-1).index + 1) {
      groups.push([point]);
    } else {
      current.push(point);
    }
  }
  return groups
    .filter((group) => group.length > 1)
    .map((group) => group.map((point) => `${point.x},${point.y}`).join(" "));
}

export function createWeatherChart(
  periods,
  metricKey = "temperature",
  { width = 640, height } = {},
) {
  const safePeriods = Array.isArray(periods) ? periods : [];
  const metric =
    FORECAST_METRICS.find((item) => item.key === metricKey) ??
    FORECAST_METRICS[0];
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 640;
  const safeHeight = Number.isFinite(height) && height > 0
    ? height
    : safeWidth < 520
      ? 250
      : 290;
  const compact = safeWidth < 520;
  const plot = {
    top: 28,
    right: compact ? 14 : 24,
    bottom: 48,
    left: compact ? 42 : 52,
  };
  const candidates = safePeriods.map((period, index) => ({
    index,
    time: typeof period?.localTime === "string" ? period.localTime : "",
    period,
  }));
  const plotWidth = safeWidth - plot.left - plot.right;
  const plotHeight = safeHeight - plot.top - plot.bottom;
  const xFor = (index) =>
    candidates.length <= 1
      ? plot.left + plotWidth / 2
      : plot.left + (index / (candidates.length - 1)) * plotWidth;
  const xTicks = candidates.map((candidate) => ({
    index: candidate.index,
    time: candidate.time,
    x: roundCoordinate(xFor(candidate.index)),
  }));
  const rawSeries = metric.series.map((definition) => {
    const points = candidates
      .map((candidate) => {
        const rawValue = candidate.period?.[definition.field];
        if (!Number.isFinite(rawValue)) return null;
        const value = definition.transform
          ? definition.transform(rawValue)
          : rawValue;
        return Number.isFinite(value) ? { ...candidate, value } : null;
      })
      .filter(Boolean);
    return { ...definition, points };
  });
  const values = rawSeries.flatMap((series) =>
    series.points.map((point) => point.value),
  );

  if (!values.length) {
    return {
      width: safeWidth,
      height: safeHeight,
      plot,
      metric,
      available: false,
      series: rawSeries.map((series) => ({ ...series, points: [], segments: [] })),
      yTicks: [],
      xTicks,
      baselineY: null,
      barWidth: 0,
      points: [],
    };
  }

  const bounds = chartBounds(values, metric);
  const yFor = (value) =>
    plot.top +
    ((bounds.maximum - value) / (bounds.maximum - bounds.minimum)) *
      plotHeight;
  const series = rawSeries.map((item, seriesIndex) => {
    const points = item.points.map((point) => ({
      ...point,
      key: `${item.key}-${point.index}`,
      seriesKey: item.key,
      seriesLabel: item.label,
      seriesIndex,
      unit: metric.unit,
      x: roundCoordinate(xFor(point.index)),
      y: roundCoordinate(yFor(point.value)),
    }));
    return {
      ...item,
      points,
      segments: metric.presentation === "line" ? lineSegments(points) : [],
    };
  });
  const yTickValues = [
    bounds.maximum,
    (bounds.maximum + bounds.minimum) / 2,
    bounds.minimum,
  ];

  return {
    width: safeWidth,
    height: safeHeight,
    plot,
    metric,
    available: true,
    series,
    points: series.flatMap((item) => item.points),
    minimum: bounds.minimum,
    maximum: bounds.maximum,
    yTicks: yTickValues.map((value) => ({
      value: round(value),
      y: roundCoordinate(yFor(value)),
    })),
    xTicks,
    baselineY: roundCoordinate(yFor(Math.max(0, bounds.minimum))),
    barWidth: roundCoordinate(
      Math.min(42, (plotWidth / Math.max(1, candidates.length)) * 0.58),
    ),
  };
}
