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

export type WorkoutCaptureAnalysisResponse = {
  enabled: boolean;
  draft: WorkoutCaptureDraft | null;
};
