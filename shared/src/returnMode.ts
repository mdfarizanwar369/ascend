type ReturnModeRole = "client" | "trainer" | "admin" | "owner";

export const RETURN_MODE_MIN_INACTIVITY_HOURS = 120;
export const RETURN_MODE_COOLDOWN_HOURS = 336;

const HOUR_MS = 60 * 60 * 1000;

export type ReturnModeInactivityBucket = "5_13_days" | "14_29_days" | "30_plus_days";

export type ReturnModeEligibilityInput = {
  featureEnabled: boolean;
  authResolved: boolean;
  profileResolved: boolean;
  status?: string | null;
  primaryRole?: ReturnModeRole | null;
  roles?: ReturnModeRole[] | null;
  goalType?: unknown;
  startingWeightKg?: unknown;
  lastMeaningfulActivityAt?: string | Date | null;
  returnModeLastShownAt?: string | Date | null;
  returnModeShownForActivityAt?: string | Date | null;
};

export type ReturnModeEligibility =
  | {
      eligible: true;
      lastMeaningfulActivityAt: string;
      inactivityHours: number;
      inactivityBucket: ReturnModeInactivityBucket;
    }
  | {
      eligible: false;
      reason:
        | "feature_disabled"
        | "auth_unresolved"
        | "profile_unresolved"
        | "account_inactive"
        | "not_member"
        | "onboarding_incomplete"
        | "activity_missing"
        | "activity_invalid"
        | "activity_too_recent"
        | "episode_already_shown"
        | "shown_timestamp_invalid"
        | "cooldown_active";
    };

function parseTimestamp(value: string | Date | null | undefined, nowMs: number) {
  if (!value) return null;
  const timestampMs = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestampMs) || timestampMs > nowMs) return null;
  return timestampMs;
}

function normalizeTimestamp(value: string | Date) {
  return new Date(value).toISOString();
}

function hasCompletedOnboarding(goalType: unknown, startingWeightKg: unknown) {
  const parsedWeight = typeof startingWeightKg === "number" ? startingWeightKg : Number(startingWeightKg);
  return Boolean(goalType) && Number.isFinite(parsedWeight) && parsedWeight > 0;
}

function isMemberOnly(primaryRole: ReturnModeRole | null | undefined, roles: ReturnModeRole[] | null | undefined) {
  const resolvedRoles = new Set(roles ?? (primaryRole ? [primaryRole] : []));
  return primaryRole === "client"
    && resolvedRoles.has("client")
    && !resolvedRoles.has("trainer")
    && !resolvedRoles.has("admin")
    && !resolvedRoles.has("owner");
}

export function getReturnModeInactivityBucket(inactivityHours: number): ReturnModeInactivityBucket {
  if (inactivityHours >= 30 * 24) return "30_plus_days";
  if (inactivityHours >= 14 * 24) return "14_29_days";
  return "5_13_days";
}

export function evaluateReturnModeEligibility(
  input: ReturnModeEligibilityInput,
  now: Date = new Date()
): ReturnModeEligibility {
  if (!input.featureEnabled) return { eligible: false, reason: "feature_disabled" };
  if (!input.authResolved) return { eligible: false, reason: "auth_unresolved" };
  if (!input.profileResolved) return { eligible: false, reason: "profile_unresolved" };
  if (input.status !== "active") return { eligible: false, reason: "account_inactive" };
  if (!isMemberOnly(input.primaryRole, input.roles)) return { eligible: false, reason: "not_member" };
  if (!hasCompletedOnboarding(input.goalType, input.startingWeightKg)) {
    return { eligible: false, reason: "onboarding_incomplete" };
  }

  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return { eligible: false, reason: "profile_unresolved" };
  if (!input.lastMeaningfulActivityAt) return { eligible: false, reason: "activity_missing" };
  const activityMs = parseTimestamp(input.lastMeaningfulActivityAt, nowMs);
  if (activityMs === null) return { eligible: false, reason: "activity_invalid" };

  const inactivityHours = (nowMs - activityMs) / HOUR_MS;
  if (inactivityHours < RETURN_MODE_MIN_INACTIVITY_HOURS) {
    return { eligible: false, reason: "activity_too_recent" };
  }

  if (input.returnModeShownForActivityAt) {
    const shownForMs = parseTimestamp(input.returnModeShownForActivityAt, nowMs);
    if (shownForMs === null) return { eligible: false, reason: "shown_timestamp_invalid" };
    if (shownForMs === activityMs) return { eligible: false, reason: "episode_already_shown" };
  }

  if (input.returnModeLastShownAt) {
    const shownMs = parseTimestamp(input.returnModeLastShownAt, nowMs);
    if (shownMs === null) return { eligible: false, reason: "shown_timestamp_invalid" };
    if ((nowMs - shownMs) / HOUR_MS < RETURN_MODE_COOLDOWN_HOURS) {
      return { eligible: false, reason: "cooldown_active" };
    }
  }

  return {
    eligible: true,
    lastMeaningfulActivityAt: normalizeTimestamp(input.lastMeaningfulActivityAt),
    inactivityHours,
    inactivityBucket: getReturnModeInactivityBucket(inactivityHours)
  };
}
