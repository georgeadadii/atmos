export function localDate(epochSeconds, timezoneOffsetSeconds) {
  return new Date((epochSeconds + timezoneOffsetSeconds) * 1000)
    .toISOString()
    .slice(0, 10);
}

export function addLocalDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function localDateTime(epochSeconds, timezoneOffsetSeconds) {
  const local = new Date((epochSeconds + timezoneOffsetSeconds) * 1000)
    .toISOString()
    .replace(".000Z", "");
  const sign = timezoneOffsetSeconds >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(timezoneOffsetSeconds);
  const hours = String(Math.floor(absoluteOffset / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((absoluteOffset % 3600) / 60)).padStart(
    2,
    "0",
  );
  return `${local}${sign}${hours}:${minutes}`;
}

export function localDayWindow(dates, timezoneOffsetSeconds) {
  const start = Date.parse(`${dates[0]}T00:00:00.000Z`) / 1000;
  const end =
    Date.parse(`${addLocalDays(dates.at(-1), 1)}T00:00:00.000Z`) / 1000;
  return {
    start: start - timezoneOffsetSeconds,
    end: end - timezoneOffsetSeconds,
  };
}
