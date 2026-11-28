export const cycleTrackingEnabled = process.env.NEXT_PUBLIC_CYCLE_TRACKING_V1 === "true";

export function canUseCycleTracker(profile: { primary_role?: string | null; gender?: string | null } | null) {
  return profile?.primary_role === "client" && profile.gender === "female";
}
