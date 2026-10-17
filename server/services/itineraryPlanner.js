export function optimiseItinerary(activities, scoreMatrix, activitiesPerDay) {
  const orderedActivities = [...activities].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const dayCount = 3;
  const loads = Array(dayCount).fill(0);
  const assignment = Array(orderedActivities.length).fill(0);
  let best;

  function search(activityIndex, totalScore) {
    if (activityIndex === orderedActivities.length) {
      const tieKey = assignment.join("");
      if (
        !best ||
        totalScore > best.totalScore ||
        (totalScore === best.totalScore && tieKey < best.tieKey)
      ) {
        best = { totalScore, tieKey, assignment: [...assignment] };
      }
      return;
    }

    const activity = orderedActivities[activityIndex];
    const scores = scoreMatrix[activity.id];
    if (!Array.isArray(scores) || scores.length !== dayCount) {
      throw new TypeError(`Missing three-day scores for ${activity.id}.`);
    }

    for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
      if (loads[dayIndex] >= activitiesPerDay) continue;
      loads[dayIndex] += 1;
      assignment[activityIndex] = dayIndex;
      search(activityIndex + 1, totalScore + scores[dayIndex].score);
      loads[dayIndex] -= 1;
    }
  }

  search(0, 0);
  if (!best) {
    throw new TypeError("No itinerary satisfies the daily capacity.");
  }

  return {
    assignments: Object.fromEntries(
      orderedActivities.map((activity, index) => [
        activity.id,
        best.assignment[index],
      ]),
    ),
    totalScore: best.totalScore,
    overallScore: Math.round(best.totalScore / orderedActivities.length),
  };
}
