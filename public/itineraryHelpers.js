export const ITINERARY_DAY_COUNT = 3;

export function selectionValidation(selectedCount, activitiesPerDay) {
  const availableSlots = ITINERARY_DAY_COUNT * activitiesPerDay;
  if (selectedCount === 0) {
    return {
      availableSlots,
      valid: false,
      message: "Select at least one activity to build your itinerary.",
    };
  }
  if (selectedCount > availableSlots) {
    const excess = selectedCount - availableSlots;
    return {
      availableSlots,
      valid: false,
      message: `You selected ${selectedCount} activities, but your current settings allow only ${availableSlots}. Increase your daily limit or remove ${excess} ${excess === 1 ? "activity" : "activities"}.`,
    };
  }
  return { availableSlots, valid: true, message: "" };
}

export function isItineraryResponse(payload) {
  return Boolean(
    payload?.destination?.name &&
      Array.isArray(payload?.preferences?.activities) &&
      [1, 2, 3].includes(payload?.preferences?.activitiesPerDay) &&
      Array.isArray(payload?.itinerary?.days) &&
      payload.itinerary.days.length === ITINERARY_DAY_COUNT &&
      payload.itinerary.days.every(
        (day) =>
          typeof day?.date === "string" &&
          day?.forecast?.representativeCondition &&
          Array.isArray(day?.activities) &&
          day.activities.every(
            (activity) =>
              typeof activity?.id === "string" &&
              typeof activity?.name === "string" &&
              Number.isFinite(activity?.suitabilityScore) &&
              typeof activity?.reason === "string",
          ),
      ) &&
      Number.isFinite(payload?.itinerary?.overallScore) &&
      Array.isArray(payload?.limitations),
  );
}
