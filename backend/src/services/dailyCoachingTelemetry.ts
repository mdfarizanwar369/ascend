import { createHmac } from "crypto";
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
  const candidate = error as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown } | null;
  return {
    errorName: typeof candidate?.name === "string" ? candidate.name.slice(0, 80) : "UnknownError",
    errorCode: typeof candidate?.code === "string" || typeof candidate?.code === "number"
      ? String(candidate.code).slice(0, 40)
      : null,
    httpStatus: typeof candidate?.status === "number"
      ? candidate.status
      : typeof candidate?.statusCode === "number"
        ? candidate.statusCode
        : null
  };
}

export function dailyCoachingCorrelation(userId: string) {
  const key = env.CRON_SECRET || env.BOOTSTRAP_OWNER_EMAIL || "ascend-daily-coaching";
  return createHmac("sha256", key).update(userId).digest("hex").slice(0, 16);
}
