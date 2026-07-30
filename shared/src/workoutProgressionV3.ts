import type { WorkoutEvidenceType, WorkoutPerformanceValues } from "./workoutProgression";

export const WORKOUT_PROGRESSION_V3_VERSION = "workout_progression_v3" as const;

export type WorkoutProgressionV3Status =
  | "baseline"
  | "personal_best"
  | "progressed"
  | "maintained"
  | "plateau_signal"
  | "planned_deload"
  | "changed"
  | "not_comparable";

export type WorkoutProgressionV3ExerciseInsight = {
  exerciseName: string;
  exerciseKey: string;
  status: WorkoutProgressionV3Status;
  summary: string;
  current: WorkoutPerformanceValues;
  previous: WorkoutPerformanceValues | null;
  currentDurationSeconds: number | null;
  previousDurationSeconds: number | null;
  comparableObservationCount: number;
  confidence: number;
  nextSessionSuggestion: string | null;
};

export type WorkoutProgressionIntelligenceV3 = {
  version: typeof WORKOUT_PROGRESSION_V3_VERSION;
  evidenceType: Extract<WorkoutEvidenceType, "observed_performance">;
  overallStatus: WorkoutProgressionV3Status | "mixed";
  headline: string;
  achievements: string[];
  reviewNotes: string[];
  nextSessionFocus: string | null;
  exerciseInsights: WorkoutProgressionV3ExerciseInsight[];
  confidence: number;
};

export type WorkoutProgressionHistoryItem = {
  workoutEventId: string;
  workoutTitle: string;
  completedAt: string;
  intelligence: WorkoutProgressionIntelligenceV3;
};
