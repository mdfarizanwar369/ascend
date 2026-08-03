export const WORKOUT_CAPTURE_VERSION = "workout_capture_v1" as const;

export const WORKOUT_CAPTURE_SOURCE_MODES = [
  "text",
  "dictation",
  "photo",
  "screenshot",
  "trainer_program",
  "repeat"
] as const;

export type WorkoutCaptureSourceMode = (typeof WORKOUT_CAPTURE_SOURCE_MODES)[number];

export const WORKOUT_MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "push",
  "pull",
  "carry",
  "core",
  "cardio",
  "mobility",
  "recovery",
  "other"
] as const;

export type WorkoutMovementPattern = (typeof WORKOUT_MOVEMENT_PATTERNS)[number];
export type WorkoutCaptureDifficulty = "easy" | "moderate" | "challenging";

export type WorkoutCaptureExercise = {
  name: string;
  originalText: string | null;
  sets: number | null;
  reps: string | null;
  load: number | null;
  loadUnit: "kg" | "lb" | null;
  durationMinutes: number | null;
  restSeconds: number | null;
  note: string | null;
  movementPattern: WorkoutMovementPattern;
  confidence: number;
  needsConfirmation: boolean;
};

export type WorkoutCaptureDraft = {
  version: typeof WORKOUT_CAPTURE_VERSION;
  sourceMode: WorkoutCaptureSourceMode;
  originalInput: string;
  title: string;
  workoutType: string;
  difficulty: WorkoutCaptureDifficulty;
  durationMinutes: number | null;
  exercises: WorkoutCaptureExercise[];
  confidence: number;
  uncertainties: string[];
  requiresReview: true;
};

export type WorkoutCaptureAllowance = {
  tier: "free" | "premium";
  period: "rolling_7_days" | "unlimited";
  limit: number | null;
  used: number;
  remaining: number | null;
};

export type WorkoutCaptureAnalysisResponse = {
  enabled: boolean;
  draft: WorkoutCaptureDraft | null;
  allowance: WorkoutCaptureAllowance | null;
};

function metadataText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function metadataDuration(value: unknown) {
  if (typeof value === "number") {
    const parsed = metadataNumber(value);
    return parsed === null ? null : Math.round(parsed);
  }
  if (typeof value !== "string") return null;
  const parsed = metadataNumber(value.match(/\d+(?:\.\d+)?/)?.[0]);
  return parsed === null ? null : Math.round(parsed);
}

function metadataDifficulty(value: unknown): WorkoutCaptureDifficulty {
  const normalized = metadataText(value)?.toLowerCase();
  return normalized === "easy" || normalized === "challenging" ? normalized : "moderate";
}

function metadataPattern(value: unknown): WorkoutMovementPattern {
  return WORKOUT_MOVEMENT_PATTERNS.includes(value as WorkoutMovementPattern) ? value as WorkoutMovementPattern : "other";
}

function exerciseFromMetadata(value: unknown): WorkoutCaptureExercise | null {
  if (!value || typeof value !== "object") return null;
  const exercise = value as Record<string, unknown>;
  const name = metadataText(exercise.name);
  if (!name) return null;
  const loadUnit = exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null;

  return {
    name,
    originalText: null,
    sets: metadataDuration(exercise.sets),
    reps: metadataText(exercise.reps),
    load: metadataNumber(exercise.load),
    loadUnit,
    durationMinutes: metadataDuration(exercise.durationMinutes ?? exercise.duration),
    restSeconds: metadataDuration(exercise.restSeconds ?? exercise.rest),
    note: metadataText(exercise.note),
    movementPattern: metadataPattern(exercise.movementPattern),
    confidence: 1,
    needsConfirmation: false
  };
}

export function createRepeatWorkoutCaptureDraft(metadata: Record<string, unknown>): WorkoutCaptureDraft | null {
  const exercises = Array.isArray(metadata.exercises)
    ? metadata.exercises.map(exerciseFromMetadata).filter((exercise): exercise is WorkoutCaptureExercise => Boolean(exercise))
    : [];
  if (!exercises.length) return null;

  return {
    version: WORKOUT_CAPTURE_VERSION,
    sourceMode: "repeat",
    originalInput: "",
    title: metadataText(metadata.workoutTitle) ?? "My Workout",
    workoutType: metadataText(metadata.workoutType ?? metadata.activityType) ?? "General Fitness",
    difficulty: metadataDifficulty(metadata.workoutDifficulty),
    durationMinutes: metadataDuration(metadata.durationMinutes),
    exercises,
    confidence: 1,
    uncertainties: [],
    requiresReview: true
  };
}
