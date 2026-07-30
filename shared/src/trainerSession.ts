import type { WorkoutCaptureDraft } from "./workoutCapture";

export const TRAINER_SESSION_VERSION = "trainer_session_v1" as const;
export type TrainerSessionStatus = "draft" | "completed" | "cancelled";
export type TrainerSessionStartMode = "repeat_last" | "blank";

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

export type TrainerSessionDeltaAction = "update" | "remove" | "add";

export type TrainerSessionDeltaChange = {
  action: TrainerSessionDeltaAction;
  targetExerciseName: string | null;
  name: string | null;
  sets: number | null;
  reps: string | null;
  load: number | null;
  loadDelta: number | null;
  loadUnit: "kg" | "lb" | null;
  durationMinutes: number | null;
  restSeconds: number | null;
  note: string | null;
  originalText: string;
  confidence: number;
  needsConfirmation: boolean;
};

export type TrainerSessionDelta = {
  changes: TrainerSessionDeltaChange[];
  durationMinutes: number | null;
  workoutType: string | null;
  difficulty: WorkoutCaptureDraft["difficulty"] | null;
  confidence: number;
  uncertainties: string[];
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
  exercises: WorkoutCaptureDraft["exercises"];
  clientRecap: string;
  betweenSessionFocus: string;
  progressHighlights: string[];
  clientCelebration: string;
  completedAt: string;
};
