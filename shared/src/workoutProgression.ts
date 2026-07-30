export const WORKOUT_PROGRESSION_VERSION = "workout_progression_v1" as const;

export type WorkoutEvidenceType = "observed_performance" | "completed_plan" | "simple_activity";
export type WorkoutProgressionStatus = "baseline" | "progressed" | "maintained" | "changed" | "not_comparable";
export type WorkoutProgressionReason =
  | "first_observation"
  | "higher_load"
  | "more_reps"
  | "same_performance"
  | "lower_load"
  | "fewer_reps"
  | "mixed_change"
  | "unit_mismatch"
  | "insufficient_data";

export type WorkoutPerformanceValues = {
  sets: number | null;
  reps: string | null;
  totalReps: number | null;
  load: number | null;
  loadUnit: "kg" | "lb" | null;
};

export type WorkoutExerciseProgression = {
  exerciseName: string;
  exerciseKey: string;
  status: WorkoutProgressionStatus;
  reason: WorkoutProgressionReason;
  summary: string;
  previousWorkoutId: string | null;
  previousCompletedAt: string | null;
  previous: WorkoutPerformanceValues | null;
  current: WorkoutPerformanceValues;
  confidence: number;
};

export type WorkoutProgressionSnapshot = {
  version: typeof WORKOUT_PROGRESSION_VERSION;
  evidenceType: "observed_performance";
  overallStatus: "baseline" | "progressed" | "maintained" | "mixed" | "not_comparable";
  headline: string;
  highlights: string[];
  changesToReview: string[];
  comparisons: WorkoutExerciseProgression[];
  confidence: number;
};
