import type { WorkoutMovementPattern } from "./workoutCapture";

export const WORKOUT_SIGNAL_VERSION = "workout_signal_v1" as const;

export const WORKOUT_DEBRIEF_STATUSES = [
  "pending",
  "generating",
  "generated",
  "fallback",
  "not_required"
] as const;

export type WorkoutDebriefStatus = (typeof WORKOUT_DEBRIEF_STATUSES)[number];

export type WorkoutDebriefSource =
  | "coach_zoe_workout_planner"
  | "ai_workout_capture"
  | "quick_activity";

export type WorkoutSignalV1 = {
  version: typeof WORKOUT_SIGNAL_VERSION;
  source: WorkoutDebriefSource;
  sessionType: "strength" | "cardio" | "hiit" | "mobility" | "full_body" | "general_fitness" | "unknown";
  trainingFocus: string[];
  movementPatterns: WorkoutMovementPattern[];
  volumeBand: "low" | "moderate" | "high" | "unknown";
  completionRatio: number | null;
  prescribedComparison: "completion_only" | "not_available";
  recoveryLoad: "low" | "moderate" | "high" | "unknown";
  nextSessionBias: string[];
  notableSignals: string[];
  evidenceConfidence: number;
  limitations: string[];
};

export type WorkoutDebriefOutput = {
  accomplishment: string;
  observation: string;
  recoveryGuidance: string;
  nextConsideration: string;
  debrief: string;
};

export type WorkoutDebriefView = {
  enabled: boolean;
  workoutEventId: string;
  status: WorkoutDebriefStatus | null;
  text: string | null;
  fallbackText: string | null;
  source: "ai" | "deterministic" | null;
  cached: boolean;
};
