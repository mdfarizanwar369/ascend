export const CLIENT_360_SCHEMA_VERSION = "client_360_snapshot_v1" as const;

export type Client360Section = "profile" | "training" | "nutrition" | "bodyProgress" | "activity";
export type Client360SectionAccessState = "granted" | "not_granted" | "break_glass";
export type Client360RequiredScope = "profile" | "training" | "nutrition" | "body" | "recovery";

export type Client360SectionAccess = {
  state: Client360SectionAccessState;
  requiredScope: Client360RequiredScope;
};

export type Client360Access = {
  mode: "relationship" | "break_glass" | "platform_owner";
  relationshipId: string | null;
  relationshipStatus: "active" | null;
  authorizationVersion: number | null;
  sections: Record<Client360Section, Client360SectionAccess>;
};

export type Client360Metric<T> = {
  value: T | null;
  sampleSize: number;
  windowDays: number | null;
  sufficientData: boolean;
};

export type Client360TrendDirection = "increasing" | "decreasing" | "stable" | "insufficient";

export type Client360Trend = {
  direction: Client360TrendDirection;
  ratePerWeek: number | null;
  sampleSize: number;
  windowDays: number;
  observedSpanDays: number;
  sufficientData: boolean;
};

export type Client360Profile = {
  displayName: string;
  goal: "fat_loss" | "muscle_gain" | "maintenance" | null;
  activityLevel: string | null;
};

export type Client360RecentWorkout = {
  id: string;
  completedAt: string;
  title: string;
  workoutType: string | null;
  durationMinutes: number | null;
  exerciseCount: number;
  recordedSets: number | null;
  source: string | null;
  debriefAvailable: boolean;
};

export type Client360ExerciseProgression = {
  exerciseKey: string;
  displayName: string;
  status: "personal_best" | "progressed" | "maintained" | "plateau_signal" | "baseline" | "changed" | "not_comparable" | "planned_deload";
  current: { sets: number | null; reps: string | null; totalReps: number | null; load: number | null; loadUnit: "kg" | "lb" | null };
  previous: { sets: number | null; reps: string | null; totalReps: number | null; load: number | null; loadUnit: "kg" | "lb" | null } | null;
  lastPerformedAt: string;
  comparableObservationCount: number;
  confidence: number;
};

export type Client360Training = {
  completedWorkouts: { last7Days: number; last30Days: number; last90Days: number };
  averageSessionsPerWeek30d: number;
  activeWeeks8: number;
  loggingConsistency8w: Client360Metric<number>;
  lastWorkoutAt: string | null;
  averageDurationMinutes30d: Client360Metric<number>;
  frequencyTrend: Client360Trend;
  recentWorkouts: Client360RecentWorkout[];
  exerciseProgression: {
    identityBasis: "progression_v3_exact_key";
    items: Client360ExerciseProgression[];
  };
};

export type Client360NutritionPeriod = {
  daysLogged: number;
  loggingCoverage: Client360Metric<number>;
  averageCaloriesPerLoggedDay: Client360Metric<number>;
  averageProteinGPerLoggedDay: Client360Metric<number>;
  calorieWithinTargetDays: Client360Metric<number>;
  proteinTargetMetDays: Client360Metric<number>;
};

export type Client360Nutrition = {
  targets: {
    calories: number;
    proteinG: number;
    source: string;
    calorieRangeRatio: { minimum: number; maximum: number };
  };
  last7Days: Client360NutritionPeriod;
  last30Days: Client360NutritionPeriod;
  targetEvaluationBasis: "logged_days_only";
};

export type Client360WeightChange = Client360Metric<number> & { observedSpanDays: number };

export type Client360BodyProgress = {
  weight: {
    currentKg: number | null;
    currentRecordedAt: string | null;
    change7dKg: Client360WeightChange;
    change30dKg: Client360WeightChange;
    change90dKg: Client360WeightChange;
    trend28d: Client360Trend;
  };
  bodyComposition: {
    scanCount: number;
    latestScanAt: string | null;
    previousScanAt: string | null;
    evidenceStatus: "INSUFFICIENT" | "PROVISIONAL" | "ESTABLISHED";
    latest: {
      weightKg: number | null;
      bodyFatPercent: number | null;
      leanBodyMassKg: number | null;
      skeletalMuscleMassKg: number | null;
    } | null;
    establishedChanges: Array<{
      metric: string;
      change: number;
      signal: "higher" | "lower" | "no_clear_change";
    }>;
  };
};

export type Client360Activity = {
  connected: boolean;
  lastSyncedAt: string | null;
  todaySteps: number | null;
  averageSteps7d: Client360Metric<number>;
  exerciseSessions7d: number;
  lastExerciseSessionAt: string | null;
};

export type Client360SignalCode =
  | "TRAINING_INACTIVITY"
  | "TRAINING_FREQUENCY_DECLINING"
  | "TRAINING_LOGGING_CONSISTENT"
  | "STRENGTH_PROGRESSING"
  | "NUTRITION_LOGGING_LOW"
  | "PROTEIN_TARGET_FREQUENTLY_MISSED"
  | "POTENTIAL_WEIGHT_PLATEAU";

export type Client360CoachingSignal = {
  code: Client360SignalCode;
  severity: "positive" | "attention" | "information";
  sourceSection: Exclude<Client360Section, "profile">;
  evidence: Record<string, string | number | boolean | null>;
};

export type Client360Freshness = {
  generatedAt: string;
  latestWorkoutAt?: string | null;
  latestNutritionLogAt?: string | null;
  latestWeightAt?: string | null;
  latestScanAt?: string | null;
  activityLastSyncedAt?: string | null;
};

export type Client360Snapshot = {
  version: typeof CLIENT_360_SCHEMA_VERSION;
  clientId: string;
  generatedAt: string;
  access: Client360Access;
  profile?: Client360Profile;
  training?: Client360Training;
  nutrition?: Client360Nutrition;
  bodyProgress?: Client360BodyProgress;
  activity?: Client360Activity;
  coachingSignals: Client360CoachingSignal[];
  freshness: Client360Freshness;
};

export type AscendCoachClientListItem = {
  clientId: string;
  accessMode: "relationship" | "platform_owner";
  relationshipId: string | null;
  relationshipStatus: "active" | null;
  authorizationVersion: number | null;
  grantedScopes: string[];
  displayName?: string;
  goal?: "fat_loss" | "muscle_gain" | "maintenance" | null;
  lastWorkoutAt?: string | null;
};

export const COACH_INSIGHT_PROMPT_VERSION = "coach-insight-v2" as const;

export type CoachInsightPriority = {
  title: string;
  reason: string;
  signalCodes: Client360SignalCode[];
};

export type CoachInsight = {
  summary: string;
  priorities: CoachInsightPriority[];
  dataCaveats: string[];
};

export type CoachInsightAvailability =
  | {
      status: "available";
      source: "cache" | "generated";
      insight: CoachInsight;
      generatedAt: string;
      expiresAt: string;
      promptVersion: typeof COACH_INSIGHT_PROMPT_VERSION;
      provider: string;
      model: string;
    }
  | {
      status: "not_available";
      reason: "not_generated" | "access_required" | "elevated_access" | "provider_unavailable" | "generation_failed" | "quota_reached";
    };

export type Client360View = {
  snapshot: Client360Snapshot;
  coachInsight: CoachInsightAvailability;
};
