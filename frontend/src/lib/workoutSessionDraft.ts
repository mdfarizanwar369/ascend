import type { DailyWorkout, GeneratedWorkout, WorkoutPlannerGoal, WorkoutPlannerLocation } from "@/lib/ascendApi";

export type WorkoutSessionAnswers = {
  location?: WorkoutPlannerLocation;
  timeAvailable?: "20" | "30" | "45" | "60";
  goal?: WorkoutPlannerGoal;
  equipment?: string;
};

export type WorkoutSessionExerciseDetails = {
  sets: string;
  reps: string;
  load: string;
  loadUnit: "kg" | "lb";
  durationMinutes: string;
  durationSeconds: string;
};

export type WorkoutSessionDraft = {
  version: 1;
  workoutCompletionKey: string;
  workout: GeneratedWorkout;
  answers: WorkoutSessionAnswers;
  checkedExerciseIndexes: number[];
  observedExercises: Record<number, WorkoutSessionExerciseDetails>;
  effortRating: "too_easy" | "about_right" | "too_hard" | null;
  actualWorkoutMinutes: string;
  showWorkoutDetails: boolean;
  savedAt: string;
  expiresAt: string;
};

const keyPrefix = "ascend:zoe-workout-session:v1:";
const defaultLifetimeMs = 36 * 60 * 60 * 1000;
const maximumLifetimeMs = 72 * 60 * 60 * 1000;

function storageKey(ownerUid: string) {
  return `${keyPrefix}${ownerUid}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkout(value: unknown): value is GeneratedWorkout {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.intro !== "string" ||
    typeof value.focus !== "string" || !["easy", "moderate", "challenging"].includes(String(value.intensity)) ||
    typeof value.estimatedDurationMinutes !== "number" || !Number.isFinite(value.estimatedDurationMinutes) ||
    !Array.isArray(value.warmup) || !value.warmup.every((item) => typeof item === "string") ||
    !Array.isArray(value.cooldown) || !value.cooldown.every((item) => typeof item === "string") ||
    typeof value.coachTip !== "string" || typeof value.disclaimer !== "string" || !Array.isArray(value.exercises)) return false;
  return value.exercises.length > 0 && value.exercises.length <= 30 && value.exercises.every((exercise) =>
    isRecord(exercise) && typeof exercise.name === "string" && exercise.name.trim().length > 0);
}

function isAnswers(value: unknown): value is WorkoutSessionAnswers {
  if (!isRecord(value)) return false;
  return (value.location === undefined || ["gym", "home", "hotel", "outdoors"].includes(String(value.location)))
    && (value.timeAvailable === undefined || ["20", "30", "45", "60"].includes(String(value.timeAvailable)))
    && (value.goal === undefined || ["fat_loss", "muscle_gain", "strength", "general_fitness", "recovery", "mobility"].includes(String(value.goal)))
    && (value.equipment === undefined || typeof value.equipment === "string");
}

function isExerciseDetails(value: unknown): value is WorkoutSessionExerciseDetails {
  if (!isRecord(value)) return false;
  return ["sets", "reps", "load", "durationMinutes", "durationSeconds"].every((key) => typeof value[key] === "string")
    && (value.loadUnit === "kg" || value.loadUnit === "lb");
}

function parseDraft(value: unknown, now: number): WorkoutSessionDraft | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.workoutCompletionKey !== "string" || !value.workoutCompletionKey || !isWorkout(value.workout)) return null;
  const workout = value.workout;
  if (!isAnswers(value.answers) || !Array.isArray(value.checkedExerciseIndexes) || !isRecord(value.observedExercises)) return null;
  if (typeof value.savedAt !== "string" || typeof value.expiresAt !== "string" || typeof value.actualWorkoutMinutes !== "string") return null;
  if (typeof value.showWorkoutDetails !== "boolean" || ![null, "too_easy", "about_right", "too_hard"].includes(value.effortRating as null | string)) return null;

  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + maximumLifetimeMs) return null;

  const checkedExerciseIndexes = [...new Set(value.checkedExerciseIndexes)]
    .filter((index): index is number => Number.isInteger(index) && Number(index) >= 0 && Number(index) < workout.exercises.length)
    .sort((a, b) => a - b);
  const observedExercises = Object.fromEntries(Object.entries(value.observedExercises)
    .filter(([index, details]) => checkedExerciseIndexes.includes(Number(index)) && isExerciseDetails(details))
    .map(([index, details]) => [Number(index), details])) as Record<number, WorkoutSessionExerciseDetails>;

  return {
    version: 1,
    workoutCompletionKey: value.workoutCompletionKey,
    workout,
    answers: value.answers,
    checkedExerciseIndexes,
    observedExercises,
    effortRating: value.effortRating as WorkoutSessionDraft["effortRating"],
    actualWorkoutMinutes: value.actualWorkoutMinutes,
    showWorkoutDetails: value.showWorkoutDetails,
    savedAt: value.savedAt,
    expiresAt: value.expiresAt
  };
}

export function workoutDraftExpiration(preferred?: string | null, now = Date.now()) {
  const preferredTime = preferred ? Date.parse(preferred) : Number.NaN;
  const expiresAt = Number.isFinite(preferredTime) && preferredTime > now && preferredTime <= now + maximumLifetimeMs
    ? preferredTime : now + defaultLifetimeMs;
  return new Date(expiresAt).toISOString();
}

export function readWorkoutSessionDraft(ownerUid: string, now = Date.now()) {
  if (typeof window === "undefined" || !ownerUid) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(ownerUid));
    if (!raw || raw.length > 1_000_000) return null;
    const draft = parseDraft(JSON.parse(raw), now);
    if (!draft) window.localStorage.removeItem(storageKey(ownerUid));
    return draft;
  } catch {
    try { window.localStorage.removeItem(storageKey(ownerUid)); } catch { /* Storage can be disabled by the device. */ }
    return null;
  }
}

export function writeWorkoutSessionDraft(ownerUid: string, draft: Omit<WorkoutSessionDraft, "version" | "savedAt">) {
  if (typeof window === "undefined" || !ownerUid) return;
  try {
    window.localStorage.setItem(storageKey(ownerUid), JSON.stringify({ ...draft, version: 1, savedAt: new Date().toISOString() }));
  } catch {
    // Workout recovery is a best-effort device safeguard. The active workout remains usable in memory.
  }
}

export function clearWorkoutSessionDraft(ownerUid: string) {
  if (typeof window === "undefined" || !ownerUid) return;
  try { window.localStorage.removeItem(storageKey(ownerUid)); } catch { /* Storage can be disabled by the device. */ }
}

export function workoutProgressForPlan(draft: WorkoutSessionDraft | null, daily: DailyWorkout) {
  if (!draft || draft.workoutCompletionKey !== daily.workoutCompletionKey) return null;
  const checkedExerciseIndexes = draft.checkedExerciseIndexes.filter((index) =>
    draft.workout.exercises[index]?.name === daily.workout.exercises[index]?.name);
  const observedExercises = Object.fromEntries(Object.entries(draft.observedExercises)
    .filter(([index]) => checkedExerciseIndexes.includes(Number(index)))) as Record<number, WorkoutSessionExerciseDetails>;
  return { ...draft, checkedExerciseIndexes, observedExercises };
}
