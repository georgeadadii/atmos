import { createApp } from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

let activeRequestController = null;
let latestRequestId = 0;

const FRIENDLY_ERRORS = {
  INVALID_CITY: "Enter a city name, optionally followed by a country code such as Dublin,IE.",
  CITY_NOT_FOUND: "We couldn’t find that destination. Check the spelling or add a two-letter country code.",
  INVALID_DESTINATION_SELECTION: "That destination selection is invalid. Please search again.",
  DESTINATION_SELECTION_EXPIRED: "That destination result has changed. Please search again.",
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
      popularCities: ["Dublin,IE", "Barcelona,ES", "London,GB"],
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
    async loadDestination(query, selectedCandidate = null) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        this.error = FRIENDLY_ERRORS.INVALID_CITY;
        this.result = null;
        this.candidates = [];
        this.candidateQuery = "";
        return;
      }

      activeRequestController?.abort();
      activeRequestController = new AbortController();
      const requestId = ++latestRequestId;
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
          signal: activeRequestController.signal,
          headers: { Accept: "application/json" },
        });
        const payload = await this.readJson(response);
        if (requestId !== latestRequestId) return;

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
      } catch (requestError) {
        if (requestError.name === "AbortError" || requestId !== latestRequestId) return;
        this.error = requestError.message === "INVALID_RESPONSE"
          ? "The server returned an unexpected response. Please try again."
          : "We couldn’t reach Atmos. Check your connection and try again.";
      } finally {
        if (requestId === latestRequestId) this.loading = false;
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
        Array.isArray(payload?.forecast?.days) &&
        payload.forecast.days.length &&
        payload?.packing?.umbrella &&
        payload?.packing?.temperature &&
        payload?.airQuality?.current &&
        Array.isArray(payload?.airQuality?.forecast?.maxima) &&
        Array.isArray(payload?.airQuality?.forecast?.warnings) &&
        Array.isArray(payload?.limitations),
      );
    },
    candidateLocation(candidate) {
      return [candidate.state, candidate.country].filter(Boolean).join(", ");
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
