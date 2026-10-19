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
      chartWidths: {},
      forecastMetrics: FORECAST_METRICS,
      theme: "light",
    };
  },
  computed: {
    forecastPeriod() {
      const days = this.result?.forecast?.days ?? [];
      if (!days.length) return "Not available";
      return `${this.formatCompactDate(days[0].date)} — ${this.formatCompactDate(days.at(-1).date)}`;
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
    const savedTheme = window.localStorage.getItem("atmos-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    this.theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : prefersDark ? "dark" : "light";
    document.documentElement.dataset.theme = this.theme;
    this.loadActivities();
  },
  methods: {
    toggleTheme() {
      this.theme = this.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = this.theme;
      window.localStorage.setItem("atmos-theme", this.theme);
    },
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
  },
}).mount("#app");
