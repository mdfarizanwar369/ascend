export const DEFAULT_USER_TIMEZONE = "Asia/Kuala_Lumpur";

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: string | null | undefined) {
  return value && isValidTimeZone(value) ? value : DEFAULT_USER_TIMEZONE;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function userLocalDateKey(date = new Date(), timeZone = DEFAULT_USER_TIMEZONE) {
  const part = zonedParts(date, normalizeTimeZone(timeZone));
  return `${part.year.toString().padStart(4, "0")}-${part.month.toString().padStart(2, "0")}-${part.day.toString().padStart(2, "0")}`;
}

function localMidnightUtc(year: number, month: number, day: number, timeZone: string) {
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const adjustment = desired - represented;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

export function userDayUtcBounds(date = new Date(), timeZone = DEFAULT_USER_TIMEZONE) {
  const zone = normalizeTimeZone(timeZone);
  const local = zonedParts(date, zone);
  const nextDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return {
    dateKey: `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}-${local.day.toString().padStart(2, "0")}`,
    start: localMidnightUtc(local.year, local.month, local.day, zone),
    end: localMidnightUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate(), zone)
  };
}
