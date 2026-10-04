export const HEALTH_ACTIVITY_SCHEMA_VERSION = 2;
export const HEALTH_ACTIVITY_CONSENT_VERSION = "apple-health-account-v1";
export type HealthActivityProvider = "apple_health" | "health_connect";
export type HealthObservationState = "observed" | "unavailable";

export interface HealthDailySnapshot {
  day: string;
  timezone: string;
  windowStart: string;
  windowEnd: string;
  observedAt: string;
  steps: number | null;
  stepsState: HealthObservationState;
  activeCalories: number | null;
  energyState: HealthObservationState;
}

export interface HealthExternalWorkout {
  externalId: string;
  startAt: string;
  endAt: string;
  activityType: string;
  activeCalories: number | null;
  sourceName: string | null;
}

export interface HealthActivityImport {
  schemaVersion: 2;
  requestId: string;
  installationId: string;
  connectionGeneration: string;
  calendarGeneration: string;
  sequence: number;
  snapshots: HealthDailySnapshot[];
  workouts: HealthExternalWorkout[];
  deletedWorkoutIds: string[];
  workoutRebuild?: { id: string; since: string; complete: boolean };
}

export interface HealthActivityConnection {
  id: string;
  provider: HealthActivityProvider;
  installationId: string;
  generation: string;
  connected: boolean;
  selected: boolean;
  pendingSelection: boolean;
  workoutHistoryRefreshing?: boolean;
  lastUploadedAt: string | null;
  disconnectedAt: string | null;
}

export interface HealthManualActivity {
  id: string;
  label: string;
  occurredAt: string;
  // Logging time is not evidence that the activity happened after disconnect.
  startedAt?: string | null;
  activeCalories: number | null;
  legacyCalories: number;
  untracked: boolean;
  matchedWorkoutId: string | null;
}

export interface DailyActivitySummary {
  day: string;
  timezone: string;
  provider: HealthActivityProvider | null;
  steps: number | null;
  providerActiveCalories: number | null;
  manualActiveCalories: number;
  displayedCalories: number | null;
  energyBasis: "active" | "mixed_estimate";
  coverage: "provider_daily" | "stale_provider_daily" | "workouts_only" | "manual_only" | "unavailable";
  workoutCount: number;
  workoutCountAmbiguous: boolean;
  observedAt: string | null;
  excludedManual: Array<{ id: string; label: string; reason: "already_included" | "overlap_unknown" | "unknown_energy_basis" }>;
  manualAdjustments: Array<{ id: string; label: string; activeCalories: number }>;
  ruleVersion: "daily-active-v1";
}

export interface HealthActivityStatus {
  enabled: boolean;
  consentVersion: string;
  timezone: string | null;
  calendarGeneration: string | null;
  connections: HealthActivityConnection[];
  summary: DailyActivitySummary | null;
}

export function validHealthTimezone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; }
  catch { return false; }
}

export function healthDateKey(value: string | Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function estimatedNetActiveCalories(met: number, weightKg: number, minutes: number) {
  if (![met, weightKg, minutes].every(Number.isFinite) || met < 0 || weightKg <= 0 || minutes < 0) return null;
  return Math.max(met - 1, 0) * 3.5 * weightKg / 200 * minutes;
}

function nonnegative(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// No writes, rewards, nutrition adjustments or fuzzy matches happen in this function.
export function reconcileDailyActivity(input: {
  day: string;
  timezone: string;
  provider: HealthActivityProvider | null;
  snapshot?: HealthDailySnapshot | null;
  workouts: HealthExternalWorkout[];
  manual: HealthManualActivity[];
  disconnectedAt?: string | null;
}): DailyActivitySummary {
  const snapshot = input.snapshot;
  const hasDailyEnergy = nonnegative(snapshot?.activeCalories);
  const uniqueWorkouts = [...new Map(input.workouts.map(workout => [workout.externalId, workout])).values()];
  const workoutIds = new Set(uniqueWorkouts.map(workout => workout.externalId));
  const excludedManual: DailyActivitySummary["excludedManual"] = [];
  const manualAdjustments: DailyActivitySummary["manualAdjustments"] = [];
  const hasWorkoutEnergy = uniqueWorkouts.some(workout => nonnegative(workout.activeCalories));
  let manualActiveCalories = 0;
  let hasLegacyBasis = false;
  let manualCount = 0;
  for (const manual of input.manual) {
    const matched = manual.matchedWorkoutId !== null && workoutIds.has(manual.matchedWorkoutId);
    if (matched) {
      excludedManual.push({ id: manual.id, label: manual.label, reason: "already_included" });
      continue;
    }
    const afterDisconnect = Boolean(input.disconnectedAt && manual.startedAt && new Date(manual.startedAt) > new Date(input.disconnectedAt));
    if ((hasDailyEnergy || hasWorkoutEnergy) && !manual.untracked && !afterDisconnect) {
      excludedManual.push({ id: manual.id, label: manual.label, reason: "overlap_unknown" });
      continue;
    }
    manualCount++;
    if (nonnegative(manual.activeCalories)) {
      manualActiveCalories += manual.activeCalories;
      if (manual.untracked) manualAdjustments.push({ id:manual.id,label:manual.label,activeCalories:manual.activeCalories });
    }
    else if (!hasDailyEnergy && !hasWorkoutEnergy && nonnegative(manual.legacyCalories)) {
      manualActiveCalories += manual.legacyCalories;
      hasLegacyBasis = true;
    } else excludedManual.push({ id: manual.id, label: manual.label, reason: "unknown_energy_basis" });
  }
  const workoutEnergy = uniqueWorkouts.filter(workout => nonnegative(workout.activeCalories));
  const workoutCalories = workoutEnergy.reduce((sum, workout) => sum + (workout.activeCalories ?? 0), 0);
  const stale = snapshot?.energyState !== "observed" || Boolean(input.disconnectedAt);
  const coverage = hasDailyEnergy ? (stale ? "stale_provider_daily" : "provider_daily")
    : workoutEnergy.length ? "workouts_only" : input.manual.length ? "manual_only" : "unavailable";
  const displayedCalories = coverage === "unavailable" ? null
    : (hasDailyEnergy ? snapshot!.activeCalories! : workoutCalories) + manualActiveCalories;
  return {
    day: input.day, timezone: input.timezone, provider: input.provider,
    steps: nonnegative(snapshot?.steps) ? snapshot!.steps : null,
    providerActiveCalories: hasDailyEnergy ? snapshot!.activeCalories : null,
    manualActiveCalories, displayedCalories,
    energyBasis: hasLegacyBasis ? "mixed_estimate" : "active",
    coverage, workoutCount: uniqueWorkouts.length + manualCount,
    workoutCountAmbiguous: uniqueWorkouts.length > 0 && input.manual.some(manual => !manual.untracked && (!manual.matchedWorkoutId || !workoutIds.has(manual.matchedWorkoutId))),
    observedAt: snapshot?.observedAt ?? null, excludedManual, manualAdjustments, ruleVersion: "daily-active-v1"
  };
}
