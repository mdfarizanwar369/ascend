import { evaluateReturnModeEligibility, type Role } from "@ascend/shared";
import type { getMe } from "@/lib/ascendApi";

const RETURN_MODE_HANDOFF_KEY = "ascend:return-mode-v1:handoff";

export type ReturnModeHandoff = {
  claimed: true;
  fullName: string | null;
};

export function isReturnModeV1Enabled() {
  const configured = process.env.NEXT_PUBLIC_RETURN_MODE_V1;
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function evaluateProfileForReturnMode(
  profile: Awaited<ReturnType<typeof getMe>>,
  now: Date = new Date()
) {
  return evaluateReturnModeEligibility({
    featureEnabled: isReturnModeV1Enabled(),
    authResolved: true,
    profileResolved: true,
    status: profile.user.status,
    primaryRole: profile.user.primary_role ?? null,
    roles: (profile.roles ?? []) as Role[],
    goalType: profile.user.goal_type,
    startingWeightKg: profile.user.starting_weight_kg,
    lastMeaningfulActivityAt: profile.user.last_meaningful_activity_at,
    returnModeLastShownAt: profile.user.return_mode_last_shown_at,
    returnModeShownForActivityAt: profile.user.return_mode_shown_for_activity_at
  }, now);
}

export function writeReturnModeHandoff(fullName?: string | null) {
  if (typeof window === "undefined") return;
  const handoff: ReturnModeHandoff = {
    claimed: true,
    fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : null
  };
  try {
    window.sessionStorage.setItem(RETURN_MODE_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // The server claim remains authoritative if session storage is unavailable.
  }
}

export function consumeReturnModeHandoff(): ReturnModeHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(RETURN_MODE_HANDOFF_KEY);
    window.sessionStorage.removeItem(RETURN_MODE_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReturnModeHandoff>;
    if (parsed.claimed !== true) return null;
    return {
      claimed: true,
      fullName: typeof parsed.fullName === "string" && parsed.fullName.trim() ? parsed.fullName.trim() : null
    };
  } catch {
    return null;
  }
}

export function firstNameFromFullName(fullName?: string | null) {
  const normalized = fullName?.trim();
  if (!normalized) return null;
  return normalized.split(/\s+/u)[0] || null;
}
