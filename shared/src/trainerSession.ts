import type { WorkoutCaptureDraft } from "./workoutCapture";

export const TRAINER_SESSION_VERSION = "trainer_session_v1" as const;
export type TrainerSessionStatus = "draft" | "completed" | "cancelled";
export type TrainerSessionStartMode = "repeat_last" | "blank";

export type TrainerSessionNarratives = {
  clientRecap: string;
  betweenSessionFocus: string;
  trainerNextSessionNote: string;
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
  completedAt: string;
};
