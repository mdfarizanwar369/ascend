const MIN_TIMEZONE_OFFSET_MINUTES = -840;
const MAX_TIMEZONE_OFFSET_MINUTES = 840;

export function normalizeTimezoneOffsetMinutes(value: unknown) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 0;
  return Math.min(MAX_TIMEZONE_OFFSET_MINUTES, Math.max(MIN_TIMEZONE_OFFSET_MINUTES, parsed));
}

export function localDateKeyAtOffset(value: string | Date, timezoneOffsetMinutes = 0) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = normalizeTimezoneOffsetMinutes(timezoneOffsetMinutes);
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function localDateParts(now: Date, timezoneOffsetMinutes: number) {
  const offset = normalizeTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const local = new Date(now.getTime() - offset * 60_000);
  return {
    offset,
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    date: local.getUTCDate(),
    day: local.getUTCDay()
  };
}

export function localDayStartUtc(timezoneOffsetMinutes = 0, now = new Date()) {
  const parts = localDateParts(now, timezoneOffsetMinutes);
  return new Date(Date.UTC(parts.year, parts.month, parts.date) + parts.offset * 60_000);
}

export function localWeekStartUtc(timezoneOffsetMinutes = 0, now = new Date()) {
  const parts = localDateParts(now, timezoneOffsetMinutes);
  const daysSinceMonday = (parts.day + 6) % 7;
  return new Date(Date.UTC(parts.year, parts.month, parts.date - daysSinceMonday) + parts.offset * 60_000);
}

export function localDateKeyDaysAgo(daysAgo: number, timezoneOffsetMinutes = 0, now = new Date()) {
  const parts = localDateParts(now, timezoneOffsetMinutes);
  return new Date(Date.UTC(parts.year, parts.month, parts.date - daysAgo)).toISOString().slice(0, 10);
}

export function localWeekKeyAtOffset(value: string | Date, timezoneOffsetMinutes = 0) {
  const dateKey = localDateKeyAtOffset(value, timezoneOffsetMinutes);
  if (!dateKey) return "";
  const localDate = new Date(`${dateKey}T00:00:00.000Z`);
  localDate.setUTCDate(localDate.getUTCDate() - ((localDate.getUTCDay() + 6) % 7));
  return localDate.toISOString().slice(0, 10);
}

export function formatLocalTimeAtOffset(value: string | Date, timezoneOffsetMinutes = 0) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = normalizeTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const local = new Date(date.getTime() - offset * 60_000);
  return new Intl.DateTimeFormat("en-SG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC"
  }).format(local);
}
