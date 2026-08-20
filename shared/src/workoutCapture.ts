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

export const WORKOUT_LOAD_BASES = [
  "total",
  "per_side",
  "per_hand",
  "assistance",
  "bodyweight",
  "bodyweight_plus",
  "machine_setting",
  "band",
  "unknown"
] as const;

export const WORKOUT_SET_TYPES = [
  "regular",
  "warmup",
  "working",
  "top",
  "backoff",
  "drop",
  "finisher",
  "unknown"
] as const;

export const WORKOUT_TRAINING_METHODS = [
  "fst_7",
  "drop_set",
  "back_off",
  "ramp_up",
  "rest_pause",
  "amrap",
  "superset",
  "alternating_set",
  "giant_set",
  "circuit",
  "short_rest"
] as const;

export type WorkoutLoadBasis = (typeof WORKOUT_LOAD_BASES)[number];
export type WorkoutSetType = (typeof WORKOUT_SET_TYPES)[number];
export type WorkoutTrainingMethod = (typeof WORKOUT_TRAINING_METHODS)[number];
export type WorkoutDurationUnit = "seconds" | "minutes";
export type WorkoutLoadRole = "starting" | "working" | "top" | "backoff" | "drop" | "correction" | "unknown";

export type WorkoutCaptureLoadStep = {
  value: number | null;
  unit: "kg" | "lb" | null;
  basis: WorkoutLoadBasis;
  role: WorkoutLoadRole;
  reps: string | null;
  approximate: boolean;
  note: string | null;
  confidence: number;
};

export type WorkoutCaptureSetDetail = {
  order: number;
  reps: string | null;
  repRangeMin: number | null;
  repRangeMax: number | null;
  load: number | null;
  loadUnit: "kg" | "lb" | null;
  loadBasis: WorkoutLoadBasis;
  durationValue: number | null;
  durationUnit: WorkoutDurationUnit | null;
  setType: WorkoutSetType;
  rpe: number | null;
  rir: number | null;
  approximate: boolean;
  note: string | null;
};

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
  section?: string | null;
  exerciseOrder?: number | null;
  completedSets?: number | null;
  repRangeMin?: number | null;
  repRangeMax?: number | null;
  approximateReps?: boolean;
  durationValue?: number | null;
  durationUnit?: WorkoutDurationUnit | null;
  loadBasis?: WorkoutLoadBasis;
  loadText?: string | null;
  startingLoad?: number | null;
  workingLoad?: number | null;
  topLoad?: number | null;
  backoffLoad?: number | null;
  rpe?: number | null;
  rir?: number | null;
  restStyle?: string | null;
  setType?: WorkoutSetType;
  trainingMethods?: WorkoutTrainingMethod[];
  supersetGroup?: string | null;
  groupRounds?: number | null;
  warmup?: boolean;
  workingSet?: boolean;
  backoffSet?: boolean;
  dropSet?: boolean;
  loadSteps?: WorkoutCaptureLoadStep[];
  setDetails?: WorkoutCaptureSetDetail[];
  uncertainFields?: string[];
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

function metadataBoolean(value: unknown) {
  return value === true;
}

function metadataLoadBasis(value: unknown): WorkoutLoadBasis {
  return WORKOUT_LOAD_BASES.includes(value as WorkoutLoadBasis) ? value as WorkoutLoadBasis : "unknown";
}

function metadataSetType(value: unknown): WorkoutSetType {
  return WORKOUT_SET_TYPES.includes(value as WorkoutSetType) ? value as WorkoutSetType : "unknown";
}

function metadataTrainingMethods(value: unknown): WorkoutTrainingMethod[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is WorkoutTrainingMethod => WORKOUT_TRAINING_METHODS.includes(item as WorkoutTrainingMethod)))];
}

function metadataLoadSteps(value: unknown): WorkoutCaptureLoadStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const rawUnit = metadataText(row.unit);
    const unit: "kg" | "lb" | null = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const rawRole = metadataText(row.role);
    const role: WorkoutLoadRole = rawRole === "starting" || rawRole === "working" || rawRole === "top" || rawRole === "backoff" || rawRole === "drop" || rawRole === "correction"
      ? rawRole
      : "unknown";
    return [{
      value: metadataNumber(row.value),
      unit,
      basis: metadataLoadBasis(row.basis),
      role,
      reps: metadataText(row.reps),
      approximate: metadataBoolean(row.approximate),
      note: metadataText(row.note),
      confidence: Math.min(1, metadataNumber(row.confidence) ?? 1)
    }];
  }).slice(0, 30);
}

function metadataSetDetails(value: unknown): WorkoutCaptureSetDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const rawUnit = metadataText(row.loadUnit);
    const loadUnit: "kg" | "lb" | null = rawUnit === "kg" || rawUnit === "lb" ? rawUnit : null;
    const rawDurationUnit = metadataText(row.durationUnit);
    const durationUnit: WorkoutDurationUnit | null = rawDurationUnit === "seconds" || rawDurationUnit === "minutes" ? rawDurationUnit : null;
    return [{
      order: metadataDuration(row.order) ?? index + 1,
      reps: metadataText(row.reps),
      repRangeMin: metadataNumber(row.repRangeMin),
      repRangeMax: metadataNumber(row.repRangeMax),
      load: metadataNumber(row.load),
      loadUnit,
      loadBasis: metadataLoadBasis(row.loadBasis),
      durationValue: metadataNumber(row.durationValue),
      durationUnit,
      setType: metadataSetType(row.setType),
      rpe: metadataNumber(row.rpe),
      rir: metadataNumber(row.rir),
      approximate: metadataBoolean(row.approximate),
      note: metadataText(row.note)
    }];
  }).slice(0, 100);
}

function exerciseFromMetadata(value: unknown): WorkoutCaptureExercise | null {
  if (!value || typeof value !== "object") return null;
  const exercise = value as Record<string, unknown>;
  const name = metadataText(exercise.name);
  if (!name) return null;
  const loadUnit = exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null;

  return {
    name,
    originalText: metadataText(exercise.originalText),
    sets: metadataDuration(exercise.sets),
    reps: metadataText(exercise.reps),
    load: metadataNumber(exercise.load),
    loadUnit,
    durationMinutes: metadataDuration(exercise.durationMinutes ?? exercise.duration),
    restSeconds: metadataDuration(exercise.restSeconds ?? exercise.rest),
    note: metadataText(exercise.note),
    movementPattern: metadataPattern(exercise.movementPattern),
    confidence: Math.min(1, metadataNumber(exercise.confidence) ?? 1),
    needsConfirmation: metadataBoolean(exercise.needsConfirmation),
    section: metadataText(exercise.section),
    exerciseOrder: metadataDuration(exercise.exerciseOrder),
    completedSets: metadataDuration(exercise.completedSets),
    repRangeMin: metadataNumber(exercise.repRangeMin),
    repRangeMax: metadataNumber(exercise.repRangeMax),
    approximateReps: metadataBoolean(exercise.approximateReps),
    durationValue: metadataNumber(exercise.durationValue),
    durationUnit: exercise.durationUnit === "seconds" || exercise.durationUnit === "minutes" ? exercise.durationUnit : null,
    loadBasis: metadataLoadBasis(exercise.loadBasis),
    loadText: metadataText(exercise.loadText),
    startingLoad: metadataNumber(exercise.startingLoad),
    workingLoad: metadataNumber(exercise.workingLoad),
    topLoad: metadataNumber(exercise.topLoad),
    backoffLoad: metadataNumber(exercise.backoffLoad),
    rpe: metadataNumber(exercise.rpe),
    rir: metadataNumber(exercise.rir),
    restStyle: metadataText(exercise.restStyle),
    setType: metadataSetType(exercise.setType),
    trainingMethods: metadataTrainingMethods(exercise.trainingMethods),
    supersetGroup: metadataText(exercise.supersetGroup),
    groupRounds: metadataDuration(exercise.groupRounds),
    warmup: metadataBoolean(exercise.warmup),
    workingSet: metadataBoolean(exercise.workingSet),
    backoffSet: metadataBoolean(exercise.backoffSet),
    dropSet: metadataBoolean(exercise.dropSet),
    loadSteps: metadataLoadSteps(exercise.loadSteps),
    setDetails: metadataSetDetails(exercise.setDetails),
    uncertainFields: Array.isArray(exercise.uncertainFields)
      ? exercise.uncertainFields.map(metadataText).filter((item): item is string => Boolean(item)).slice(0, 20)
      : []
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
