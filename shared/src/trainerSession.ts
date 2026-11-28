import type { WorkoutCaptureDraft } from "./workoutCapture";

export const TRAINER_SESSION_VERSION = "trainer_session_v1" as const;
export type TrainerSessionStatus = "draft" | "completed" | "cancelled";
export type TrainerSessionStartMode = "repeat_last" | "blank";

export const TRAINER_SESSION_FOCUSES = ["Strength", "Fat loss", "Technique", "Mobility", "Conditioning"] as const;
export const TRAINER_SESSION_RESPONSES = ["Strong", "Average", "Fatigued", "Good recovery", "Pain / tightness"] as const;

export type TrainerSessionWorksheet = {
  focus?: (typeof TRAINER_SESSION_FOCUSES)[number];
  priority?: string;
  response?: (typeof TRAINER_SESSION_RESPONSES)[number];
  win?: string;
};

export type TrainerSessionNarratives = {
  clientRecap: string;
  betweenSessionFocus: string;
  trainerNextSessionNote: string;
};

export type TrainerExerciseComparisonStatus = "progressed" | "maintained" | "reduced" | "new" | "not_comparable";

export type TrainerExerciseComparison = {
  exerciseName: string;
  status: TrainerExerciseComparisonStatus;
  summary: string;
};

export type TrainerSessionIntelligence = {
  headline: string;
  highlights: string[];
  watchouts: string[];
  nextSessionStartingPoint: string;
  clientCelebration: string;
  exerciseComparisons: TrainerExerciseComparison[];
};

export type TrainerCoachingSession = {
  id: string;
  clientId: string;
  trainerId: string | null;
  createdByUserId: string;
  trainerName: string;
  clientName: string;
  status: TrainerSessionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  rawInput: string;
  workoutDraft: WorkoutCaptureDraft | null;
  narratives: TrainerSessionNarratives | null;
  intelligence: TrainerSessionIntelligence | null;
  workoutEventId: string | null;
  estimatedCaloriesBurned: number | null;
  caloriesLabel: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  worksheet?: TrainerSessionWorksheet;
  shareClientRecap?: boolean;
};

export type ClientCoachedSession = {
  id: string;
  trainerName: string;
  title: string;
  workoutType: string;
  difficulty: string;
  durationMinutes: number;
  estimatedCaloriesBurned: number;
  caloriesLabel: string;
  exercises: Pick<WorkoutCaptureDraft["exercises"][number], "name" | "sets" | "reps" | "load" | "loadUnit" | "durationMinutes">[];
  clientRecap: string | null;
  betweenSessionFocus: string | null;
  progressHighlights: string[];
  clientCelebration: string | null;
  completedAt: string;
};
