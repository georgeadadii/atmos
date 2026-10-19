import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";
import {
  isItineraryResponse,
  MAX_SELECTED_ACTIVITIES,
  selectionValidation,
} from "./itineraryHelpers.js";

let activeTravelController = null;
let latestTravelRequestId = 0;
let activeItineraryController = null;
let latestItineraryRequestId = 0;

const FORECAST_METRICS = [
  { id: "temperature", label: "Temperature", field: "temperature", unit: "°C" },
  { id: "rainfall", label: "Rainfall", field: "rainfall", unit: "mm" },
  { id: "wind", label: "Wind speed", field: "windSpeedKmh", unit: "km/h" },
];

const FRIENDLY_ERRORS = {
  INVALID_CITY: "Enter a city name, optionally followed by a country code such as Dublin,IE.",
  CITY_NOT_FOUND: "We couldn’t find that destination. Check the spelling or add a two-letter country code.",
  INVALID_DESTINATION_SELECTION: "That destination selection is invalid. Please search again.",
  DESTINATION_SELECTION_EXPIRED: "That destination result has changed. Please search again.",
  INVALID_ACTIVITIES: "Select at least one supported activity.",
  UNKNOWN_ACTIVITIES: "One of those activities is no longer supported. Refresh the page and try again.",
  DUPLICATE_ACTIVITIES: "Each activity can be selected only once.",
  ACTIVITY_SELECTION_LIMIT_EXCEEDED: "Select no more than six activities for one itinerary.",
  INVALID_DAILY_CAPACITY: "Choose a maximum of 1, 2 or 3 activities per day.",
  ITINERARY_CAPACITY_EXCEEDED: "The selected activities will not fit within the current daily limit.",
  WEATHER_API_NOT_CONFIGURED: "Weather data is not configured right now. Please try again later.",
  WEATHER_API_AUTHENTICATION_FAILED: "Weather data is temporarily unavailable because the service credentials could not be verified.",
  WEATHER_API_RATE_LIMITED: "The weather service is receiving too many requests. Please wait a moment and try again.",
  WEATHER_API_TIMEOUT: "The weather service took too long to respond. Please try again.",
  WEATHER_API_UNAVAILABLE: "The weather service is temporarily unavailable. Please try again shortly.",
  WEATHER_API_FAILURE: "The weather service could not complete this request. Please try again.",
  INSUFFICIENT_FORECAST_DATA: "A complete three-day forecast is not available for this destination.",
  INSUFFICIENT_POLLUTION_DATA: "Air-quality forecast data is not available for the selected period.",
  INVALID_FORECAST_DATA: "The forecast data received was incomplete. Please try again later.",
  INVALID_POLLUTION_DATA: "The air-quality data received was incomplete. Please try again later.",
};

createApp({
  data() {
    return {
      cityQuery: "",
      loading: false,
      result: null,
      error: "",
      candidates: [],
      candidateQuery: "",
      resolvedDestinationQuery: "",
      popularCities: ["Dublin,IE", "Barcelona,ES", "London,GB"],
      activities: [],
      activitiesLoading: true,
      activitiesError: "",
      selectedActivities: [],
      activitiesPerDay: 2,
      itinerary: null,
      itineraryLoading: false,
      itineraryError: "",
      itineraryOutdated: false,
      maximumSelectedActivities: MAX_SELECTED_ACTIVITIES,
      expandedForecastDate: null,
      selectedForecastMetric: "temperature",
      selectedChartPointKey: null,
      chartPointerActive: false,
      forecastMetrics: FORECAST_METRICS,
    };
  },
  computed: {
    forecastPeriod() {
      const days = this.result?.forecast?.days ?? [];
      if (!days.length) return "Not available";
      return `${this.formatCompactDate(days[0].date)} to ${this.formatCompactDate(days.at(-1).date)}`;
    },
    weatherOverview() {
      const conditions = (this.result?.forecast?.days ?? []).map(
        (day) => day.representativeCondition.description,
      );
      return [...new Set(conditions.map(this.titleCase))].join(", ");
    },
    selectedActivityCount() {
      return this.selectedActivities.length;
    },
    itinerarySelection() {
      return selectionValidation(this.selectedActivityCount, Number(this.activitiesPerDay));
    },
    availableItinerarySlots() {
      return this.itinerarySelection.availableSlots;
    },
    itineraryValidationMessage() {
      return this.itinerarySelection.message;
    },
    canGenerateItinerary() {
      return Boolean(
        this.result && !this.activitiesLoading && !this.activitiesError &&
        !this.itineraryLoading && this.itinerarySelection.valid,
      );
    },
    scheduledActivityCount() {
      return (this.itinerary?.itinerary?.days ?? []).reduce(
        (total, day) => total + day.activities.length,
        0,
      );
    },
    itineraryDestinationName() {
      const destination = this.itinerary?.destination;
      if (!destination) return "";
      return [destination.name, destination.state, destination.country]
        .filter(Boolean).join(", ");
    },
    expandedIntervals() {
      if (!this.expandedForecastDate) return [];
      return this.result?.forecast?.intervalsByDate?.[this.expandedForecastDate] ?? [];
    },
    selectedMetric() {
      return this.forecastMetrics.find(
        (metric) => metric.id === this.selectedForecastMetric,
      ) ?? this.forecastMetrics[0];
    },
    chartRange() {
      const values = this.expandedIntervals
        .map((interval) => interval[this.selectedMetric.field])
        .filter(Number.isFinite);
      if (!values.length) return { minimum: 0, maximum: 1 };
      const rawMinimum = Math.min(...values);
      const rawMaximum = Math.max(...values);
      const padding = rawMinimum === rawMaximum
        ? Math.max(Math.abs(rawMinimum) * 0.12, 1)
        : (rawMaximum - rawMinimum) * 0.14;
      return {
        minimum: Math.max(this.selectedForecastMetric === "rainfall" ? 0 : -Infinity, rawMinimum - padding),
        maximum: rawMaximum + padding,
      };
    },
    chartPoints() {
      const intervals = this.expandedIntervals;
      const { minimum, maximum } = this.chartRange;
      const range = maximum - minimum || 1;
      return intervals.map((interval, index) => {
        const value = interval[this.selectedMetric.field];
        return {
          key: String(interval.timestamp),
          interval,
          value,
          x: intervals.length === 1 ? 394 : 52 + (684 * index) / (intervals.length - 1),
          y: 24 + ((maximum - value) / range) * 184,
        };
      }).filter((point) => Number.isFinite(point.value));
    },
    chartLinePath() {
      return this.chartPoints.map(
        (point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`,
      ).join(" ");
    },
    chartAreaPath() {
      if (!this.chartPoints.length) return "";
      const first = this.chartPoints[0];
      const last = this.chartPoints.at(-1);
      return `${this.chartLinePath} L ${last.x} 208 L ${first.x} 208 Z`;
    },
    chartTicks() {
      const { minimum, maximum } = this.chartRange;
      return Array.from({ length: 4 }, (_, index) => ({
        y: 24 + (184 * index) / 3,
        value: maximum - ((maximum - minimum) * index) / 3,
      }));
    },
    selectedPoint() {
      return this.expandedIntervals.find(
        (interval) => String(interval.timestamp) === this.selectedChartPointKey,
      ) ?? null;
    },
  },
  watch: {
    selectedActivities() {
      this.markItineraryOutdated();
    },
    activitiesPerDay() {
      this.markItineraryOutdated();
    },
  },
  mounted() {
    this.loadActivities();
  },
  methods: {
    search() {
      return this.loadDestination(this.cityQuery);
    },
    searchFor(city) {
      this.cityQuery = city;
      return this.loadDestination(city);
    },
    selectCandidate(candidate) {
      const parts = [candidate.name, candidate.state, candidate.country].filter(Boolean);
      const query = this.candidateQuery || this.cityQuery;
      this.cityQuery = parts.join(",");
      return this.loadDestination(query, candidate);
    },
    invalidateItineraryForDestination() {
      activeItineraryController?.abort();
      activeItineraryController = null;
      latestItineraryRequestId += 1;
      this.itinerary = null;
      this.itineraryLoading = false;
      this.itineraryError = "";
      this.itineraryOutdated = false;
      this.resolvedDestinationQuery = "";
      this.expandedForecastDate = null;
      this.selectedChartPointKey = null;
      this.chartPointerActive = false;
    },
    async loadDestination(query, selectedCandidate = null) {
      const normalizedQuery = query.trim();
      this.invalidateItineraryForDestination();
      if (!normalizedQuery) {
        this.error = FRIENDLY_ERRORS.INVALID_CITY;
        this.result = null;
        this.candidates = [];
        this.candidateQuery = "";
        return;
      }

      activeTravelController?.abort();
      activeTravelController = new AbortController();
      const requestId = ++latestTravelRequestId;
      this.loading = true;
      this.error = "";
      this.result = null;
      this.candidates = [];
      this.candidateQuery = "";

      const parameters = new URLSearchParams({ city: normalizedQuery });
      if (selectedCandidate) {
        parameters.set("latitude", selectedCandidate.latitude);
        parameters.set("longitude", selectedCandidate.longitude);
      }

      try {
        const response = await fetch(`/api/travel?${parameters}`, {
          signal: activeTravelController.signal,
          headers: { Accept: "application/json" },
        });
        const payload = await this.readJson(response);
        if (requestId !== latestTravelRequestId) return;

        if (response.status === 300 && payload?.error?.code === "AMBIGUOUS_CITY") {
          const returnedCandidates = payload.error.details?.candidates;
          if (!Array.isArray(returnedCandidates) || !returnedCandidates.length) {
            throw new Error("INVALID_RESPONSE");
          }
          this.candidates = returnedCandidates;
          this.candidateQuery = normalizedQuery;
          return;
        }

        if (!response.ok) {
          const code = payload?.error?.code;
          this.error = FRIENDLY_ERRORS[code] ?? payload?.error?.message ??
            "Something unexpected happened. Please try again.";
          return;
        }
        if (!this.isTravelResponse(payload)) throw new Error("INVALID_RESPONSE");
        this.result = payload;
        this.resolvedDestinationQuery = normalizedQuery;
      } catch (requestError) {
        if (requestError.name === "AbortError" || requestId !== latestTravelRequestId) return;
        this.error = requestError.message === "INVALID_RESPONSE"
          ? "The server returned an unexpected response. Please try again."
          : "We couldn’t reach Atmos. Check your connection and try again.";
      } finally {
        if (requestId === latestTravelRequestId) this.loading = false;
      }
    },
    async loadActivities() {
      this.activitiesLoading = true;
      this.activitiesError = "";
      try {
        const response = await fetch("/api/activities", { headers: { Accept: "application/json" } });
        const payload = await this.readJson(response);
        if (
          !response.ok || !Array.isArray(payload?.activities) ||
          payload.activities.length < 10 ||
          payload.maximumSelectedActivities !== MAX_SELECTED_ACTIVITIES ||
          payload.activities.some((activity) =>
            !activity?.id || !activity?.name || !activity?.description)
        ) {
          throw new Error("INVALID_RESPONSE");
        }
        this.activities = payload.activities;
      } catch {
        this.activitiesError = "Activity choices could not be loaded. Refresh the page to try again.";
      } finally {
        this.activitiesLoading = false;
      }
    },
    markItineraryOutdated() {
      if (this.itinerary) this.itineraryOutdated = true;
    },
    async generateItinerary() {
      if (!this.result) {
        this.itineraryError = "Search for a destination before generating an itinerary.";
        return;
      }
      if (!this.itinerarySelection.valid) {
        this.itineraryError = this.itineraryValidationMessage;
        return;
      }
      if (this.itineraryLoading) return;

      activeItineraryController?.abort();
      activeItineraryController = new AbortController();
      const requestId = ++latestItineraryRequestId;
      const destinationAtRequest = {
        query: this.resolvedDestinationQuery,
        latitude: this.result.destination.latitude,
        longitude: this.result.destination.longitude,
      };
      this.itineraryLoading = true;
      this.itineraryError = "";
      this.itinerary = null;
      this.itineraryOutdated = false;

      try {
        const response = await fetch("/api/itinerary", {
          method: "POST",
          signal: activeItineraryController.signal,
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            city: destinationAtRequest.query,
            latitude: destinationAtRequest.latitude,
            longitude: destinationAtRequest.longitude,
            activities: [...this.selectedActivities],
            activitiesPerDay: Number(this.activitiesPerDay),
          }),
        });
        const payload = await this.readJson(response);
        if (requestId !== latestItineraryRequestId) return;

        if (!response.ok) {
          const code = payload?.error?.code;
          this.itineraryError = code === "AMBIGUOUS_CITY"
            ? "The destination could not be confirmed. Search for it again and choose a specific match."
            : FRIENDLY_ERRORS[code] ?? payload?.error?.message ??
            "The itinerary could not be generated. Please try again.";
          return;
        }
        if (!isItineraryResponse(payload)) throw new Error("INVALID_RESPONSE");
        this.itinerary = payload;
      } catch (requestError) {
        if (requestError.name === "AbortError" || requestId !== latestItineraryRequestId) return;
        this.itineraryError = requestError.message === "INVALID_RESPONSE"
          ? "The server returned an unexpected itinerary. Please try again."
          : "We couldn’t reach Atmos. Check your connection and try again.";
      } finally {
        if (requestId === latestItineraryRequestId) this.itineraryLoading = false;
      }
    },
    async readJson(response) {
      try {
        return await response.json();
      } catch {
        throw new Error("INVALID_RESPONSE");
      }
    },
    isTravelResponse(payload) {
      return Boolean(
        payload?.destination?.name &&
        Number.isFinite(payload?.destination?.latitude) &&
        Number.isFinite(payload?.destination?.longitude) &&
        Array.isArray(payload?.forecast?.days) && payload.forecast.days.length === 3 &&
        payload?.forecast?.intervalsByDate &&
        payload.forecast.days.every((day) =>
          Array.isArray(payload.forecast.intervalsByDate[day.date])) &&
        payload?.packing?.umbrella && payload?.packing?.temperature &&
        payload?.airQuality?.current &&
        Array.isArray(payload?.airQuality?.forecast?.maxima) &&
        Array.isArray(payload?.airQuality?.forecast?.warnings) &&
        Array.isArray(payload?.limitations),
      );
    },
    candidateLocation(candidate) {
      return [candidate.state, candidate.country].filter(Boolean).join(", ");
    },
    activityIcon(activity) {
      const icons = {
        sightseeing: "⌖", beach: "☀", hiking: "△", museums: "▥",
        shopping: "◇", "outdoor-dining": "◒",
        "historical-sites": "⌛", "parks-gardens": "♧",
        "art-galleries": "▣", cafes: "☕",
        "cultural-attractions": "◎", "indoor-entertainment": "◈",
      };
      return icons[activity.id] ?? "○";
    },
    suitabilityLabel(score) {
      if (score >= 80) return "Excellent";
      if (score >= 60) return "Good";
      if (score >= 40) return "Moderate";
      return "Limited";
    },
    suitabilityClass(score) {
      if (score >= 80) return "suitability-excellent";
      if (score >= 60) return "suitability-good";
      if (score >= 40) return "suitability-moderate";
      return "suitability-limited";
    },
    toggleForecastDay(date) {
      this.expandedForecastDate = this.expandedForecastDate === date ? null : date;
      this.chartPointerActive = false;
      this.selectedChartPointKey = this.expandedForecastDate
        ? this.defaultChartPointKey(date)
        : null;
    },
    defaultChartPointKey(date = this.expandedForecastDate) {
      const intervals = this.result?.forecast?.intervalsByDate?.[date] ?? [];
      if (!intervals.length) return null;
      const today = this.result?.forecast?.days?.[0]?.date;
      if (date !== today) return String(intervals[0].timestamp);
      const now = Date.now() / 1000;
      const nearest = intervals.reduce((closest, interval) =>
        Math.abs(interval.timestamp - now) < Math.abs(closest.timestamp - now)
          ? interval
          : closest,
      );
      return String(nearest.timestamp);
    },
    selectChartPoint(key) {
      this.chartPointerActive = true;
      this.selectedChartPointKey = key;
    },
    selectChartPointFromPointer(event) {
      if (!this.chartPoints.length) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const viewBoxX = ((event.clientX - bounds.left) / bounds.width) * 760;
      const plotX = Math.min(736, Math.max(52, viewBoxX));
      const nearest = this.chartPoints.reduce((closest, point) =>
        Math.abs(point.x - plotX) < Math.abs(closest.x - plotX)
          ? point
          : closest,
      );
      this.selectChartPoint(nearest.key);
    },
    resetChartPointSelection() {
      this.chartPointerActive = false;
      this.selectedChartPointKey = this.defaultChartPointKey();
    },
    chartStatusText() {
      if (!this.selectedPoint) return "No forecast point is available.";
      const condition = this.titleCase(this.selectedPoint.condition.description);
      const today = this.result?.forecast?.days?.[0]?.date;
      if (this.expandedForecastDate === today && !this.chartPointerActive) {
        return `Now ${this.formatCurrentDestinationTime()} · nearest forecast ${this.formatForecastTime(this.selectedPoint.timestamp, true)} · ${condition}`;
      }
      return `${this.formatForecastTime(this.selectedPoint.timestamp)} · ${condition}`;
    },
    formatCurrentDestinationTime() {
      const offset = this.result?.forecast?.timezoneOffsetSeconds ?? 0;
      const date = new Date(Date.now() + offset * 1000);
      return new Intl.DateTimeFormat("en-IE", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
      }).format(date);
    },
    formatDay(date) {
      return new Intl.DateTimeFormat("en-IE", { weekday: "long", timeZone: "UTC" })
        .format(new Date(`${date}T00:00:00Z`));
    },
    formatShortDate(date) {
      return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", timeZone: "UTC" })
        .format(new Date(`${date}T00:00:00Z`));
    },
    formatCompactDate(date) {
      return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${date}T00:00:00Z`));
    },
    formatLocalDateTime(value) {
      if (typeof value !== "string" || value.length < 16) return "time unavailable";
      const date = value.slice(0, 10);
      const time = value.slice(11, 16);
      const offset = value.slice(19) || "+00:00";
      return `${this.formatShortDate(date)} at ${time} (UTC${offset})`;
    },
    formatForecastTime(timestamp, timeOnly = false) {
      if (!Number.isFinite(timestamp)) return "Time unavailable";
      const offset = this.result?.forecast?.timezoneOffsetSeconds ?? 0;
      const date = new Date((timestamp + offset) * 1000);
      const time = new Intl.DateTimeFormat("en-IE", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC",
      }).format(date);
      if (timeOnly) return time;
      const day = new Intl.DateTimeFormat("en-IE", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(date);
      return `${day} at ${time}`;
    },
    formatMetricValue(value) {
      if (!Number.isFinite(value)) return "Unavailable";
      return `${this.formatNumber(value)} ${this.selectedMetric.unit}`;
    },
    formatNumber(value) {
      return new Intl.NumberFormat("en-IE", { maximumFractionDigits: 1 }).format(value);
    },
    titleCase(value) {
      if (typeof value !== "string") return "";
      return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
    },
    weatherSymbol(condition) {
      const symbols = { Thunderstorm: "ϟ", Drizzle: "☂", Rain: "☔", Snow: "❄", Clear: "☀", Clouds: "☁" };
      return symbols[condition] ?? "◌";
    },
    severityClass(classification) {
      return `severity-${String(classification).toLowerCase().replaceAll(" ", "-")}`;
    },
    pollutantName(key) {
      const names = {
        co: "Carbon monoxide (CO)",
        no: "Nitrogen monoxide (NO)",
        no2: "Nitrogen dioxide (NO₂)",
        o3: "Ozone (O₃)",
        so2: "Sulphur dioxide (SO₂)",
        pm2_5: "Fine particles (PM₂.₅)",
        pm10: "Particles (PM₁₀)",
        nh3: "Ammonia (NH₃)",
      };
      return names[key] ?? key;
    },
  },
}).mount("#app");
