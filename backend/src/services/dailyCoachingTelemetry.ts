import { env } from "../config/env";

type SafeTelemetryValue = string | number | boolean | null;

export function dailyCoachingTelemetry(
  event: string,
  metadata: Record<string, SafeTelemetryValue>,
  level: "info" | "warn" | "error" = "info"
) {
  if (level === "info" && !env.DAILY_COACHING_DECISION_LOGS) return;
  const payload = { event, ...metadata };
  if (level === "error") console.error("[daily-coaching]", payload);
  else if (level === "warn") console.warn("[daily-coaching]", payload);
  else console.info("[daily-coaching]", payload);
}

export function safeDailyCoachingError(error: unknown) {
  if (error instanceof Error) {
    return {
      errorName: error.name.slice(0, 80),
      errorMessage: error.message.replace(/\s+/g, " ").trim().slice(0, 180)
    };
  }
  return { errorName: "UnknownError", errorMessage: "Unknown daily coaching failure" };
}
