import {
  WORKOUT_PROGRESSION_VERSION,
  WorkoutEvidenceType,
  WorkoutExerciseProgression,
  WorkoutPerformanceValues,
  WorkoutProgressionSnapshot
} from "@ascend/shared";

export type ProgressionExerciseInput = {
  name: string;
  sets?: number | null;
  reps?: string | null;
  load?: number | null;
  loadUnit?: "kg" | "lb" | null;
  confidence?: number | null;
};

export type ProgressionWorkoutInput = {
  id: string;
  completedAt: string;
  evidenceType: WorkoutEvidenceType;
  exercises: ProgressionExerciseInput[];
};

const OBSERVED_SOURCES = new Set(["ai_workout_capture", "trainer_logged_session"]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function canonicalExerciseName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bdb\b/g, "dumbbell")
    .replace(/\bbb\b/g, "barbell")
    .replace(/\s+/g, " ")
    .trim();
}

export function workoutEvidenceTypeForSource(source: string | null | undefined): WorkoutEvidenceType {
  if (source && OBSERVED_SOURCES.has(source)) return "observed_performance";
  if (source === "coach_zoe_workout_planner" || source === "coach_homework") return "completed_plan";
  return "simple_activity";
}

export function totalRecordedReps(reps: string | null | undefined, sets: number | null | undefined) {
  if (!reps) return null;
  if (/\d\s*(?:-|\u2013|\u2014|to)\s*\d/i.test(reps)) return null;
  const values = reps.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) ?? [];
  if (!values.length) return null;
  if (values.length > 1) return values.reduce((sum, value) => sum + value, 0);
  return sets && sets > 0 ? values[0] * sets : values[0];
}

function performance(exercise: ProgressionExerciseInput): WorkoutPerformanceValues {
  const sets = finiteNumber(exercise.sets);
  const load = finiteNumber(exercise.load);
  const reps = text(exercise.reps);
  return {
    sets: sets === null ? null : Math.round(sets),
    reps,
    totalReps: totalRecordedReps(reps, sets),
    load,
    loadUnit: exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null
  };
}

function exerciseConfidence(current: ProgressionExerciseInput, previous?: ProgressionExerciseInput) {
  const currentConfidence = finiteNumber(current.confidence) ?? 1;
  const previousConfidence = previous ? finiteNumber(previous.confidence) ?? 1 : currentConfidence;
  return Math.round(clamp(Math.min(currentConfidence, previousConfidence), 0, 1) * 100) / 100;
}

function formatLoad(value: number, unit: "kg" | "lb" | null) {
  return `${value}${unit ?? ""}`;
}

function comparison(input: {
  current: ProgressionExerciseInput;
  previous?: ProgressionExerciseInput;
  previousWorkoutId?: string | null;
  previousCompletedAt?: string | null;
}): WorkoutExerciseProgression {
  const current = performance(input.current);
  const previous = input.previous ? performance(input.previous) : null;
  const exerciseName = input.current.name.trim();
  const base = {
    exerciseName,
    exerciseKey: canonicalExerciseName(exerciseName),
    previousWorkoutId: input.previousWorkoutId ?? null,
    previousCompletedAt: input.previousCompletedAt ?? null,
    previous,
    current,
    confidence: exerciseConfidence(input.current, input.previous)
  };

  if (!input.previous || !previous) {
    return { ...base, status: "baseline", reason: "first_observation", summary: `${exerciseName} is now saved as a baseline for future comparison.` };
  }

  const bothLoaded = current.load !== null && previous.load !== null;
  const oneLoaded = (current.load === null) !== (previous.load === null);
  if (bothLoaded && current.loadUnit !== previous.loadUnit) {
    return { ...base, status: "not_comparable", reason: "unit_mismatch", summary: `${exerciseName} was recorded in different load units, so Ascend did not compare it.` };
  }
  if (oneLoaded) {
    return { ...base, status: "not_comparable", reason: "insufficient_data", summary: `${exerciseName} changed between loaded and unweighted work, so Ascend did not claim progression.` };
  }

  if (bothLoaded) {
    const currentLoad = current.load!;
    const previousLoad = previous.load!;
    if (currentLoad > previousLoad) {
      if (current.totalReps !== null && previous.totalReps !== null && current.totalReps >= previous.totalReps * 0.8) {
        return { ...base, status: "progressed", reason: "higher_load", summary: `${exerciseName} moved from ${formatLoad(previousLoad, previous.loadUnit)} to ${formatLoad(currentLoad, current.loadUnit)} with comparable completed reps.` };
      }
      return { ...base, status: "changed", reason: "mixed_change", summary: `${exerciseName} used more load, but the recorded reps were not comparable enough to confirm progression.` };
    }
    if (currentLoad < previousLoad) {
      return { ...base, status: "changed", reason: "lower_load", summary: `${exerciseName}: load changed from ${formatLoad(previousLoad, previous.loadUnit)} to ${formatLoad(currentLoad, current.loadUnit)}.` };
    }
  }

  if (current.totalReps !== null && previous.totalReps !== null) {
    if (current.totalReps > previous.totalReps) {
      const loadContext = current.load !== null ? ` at ${formatLoad(current.load, current.loadUnit)}` : "";
      return { ...base, status: "progressed", reason: "more_reps", summary: `${exerciseName}: more total repetitions (${previous.totalReps} to ${current.totalReps})${loadContext}.` };
    }
    if (current.totalReps < previous.totalReps) {
      return { ...base, status: "changed", reason: "fewer_reps", summary: `${exerciseName}: recorded reps changed from ${previous.totalReps} to ${current.totalReps}.` };
    }
    return { ...base, status: "maintained", reason: "same_performance", summary: `${exerciseName} matched the previous recorded performance.` };
  }

  return { ...base, status: "not_comparable", reason: "insufficient_data", summary: `${exerciseName} was saved, but there was not enough comparable performance detail.` };
}

function findPreviousExercise(current: ProgressionExerciseInput, history: ProgressionWorkoutInput[]) {
  const key = canonicalExerciseName(current.name);
  for (const workout of history) {
    if (workout.evidenceType !== "observed_performance") continue;
    const exercise = workout.exercises.find((candidate) => canonicalExerciseName(candidate.name) === key);
    if (exercise) return { exercise, workout };
  }
  return null;
}

export function buildWorkoutProgression(currentWorkout: ProgressionWorkoutInput, history: ProgressionWorkoutInput[]): WorkoutProgressionSnapshot | null {
  if (currentWorkout.evidenceType !== "observed_performance" || !currentWorkout.exercises.length) return null;
  const orderedHistory = [...history]
    .filter((workout) => workout.id !== currentWorkout.id)
    .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime());
  const comparisons = currentWorkout.exercises.map((current) => {
    const match = findPreviousExercise(current, orderedHistory);
    return comparison({
      current,
      previous: match?.exercise,
      previousWorkoutId: match?.workout.id,
      previousCompletedAt: match?.workout.completedAt
    });
  });
  const progressed = comparisons.filter((item) => item.status === "progressed");
  const baselines = comparisons.filter((item) => item.status === "baseline");
  const maintained = comparisons.filter((item) => item.status === "maintained");
  const changed = comparisons.filter((item) => item.status === "changed");
  const notComparable = comparisons.filter((item) => item.status === "not_comparable");
  const overallStatus = progressed.length
    ? "progressed"
    : baselines.length === comparisons.length
      ? "baseline"
      : maintained.length && !changed.length && !notComparable.length
        ? "maintained"
        : changed.length || (baselines.length && maintained.length)
          ? "mixed"
          : "not_comparable";
  const headline = overallStatus === "progressed"
    ? `${progressed.length} verified progression${progressed.length === 1 ? "" : "s"} from your earlier workouts.`
    : overallStatus === "baseline"
      ? "Your first detailed performance baseline is saved."
      : overallStatus === "maintained"
        ? "You matched your previous recorded performance."
        : overallStatus === "mixed"
          ? "Your workout is saved with a mix of baselines and performance changes."
          : "Your workout is saved, with limited directly comparable detail.";
  const highlights = progressed.length
    ? progressed.slice(0, 3).map((item) => item.summary)
    : overallStatus === "baseline"
      ? baselines.slice(0, 3).map((item) => item.summary)
      : maintained.slice(0, 3).map((item) => item.summary);
  const changesToReview = [...changed, ...notComparable].slice(0, 3).map((item) => item.summary);
  const confidence = comparisons.length
    ? Math.round((comparisons.reduce((sum, item) => sum + item.confidence, 0) / comparisons.length) * 100) / 100
    : 0;

  return {
    version: WORKOUT_PROGRESSION_VERSION,
    evidenceType: "observed_performance",
    overallStatus,
    headline,
    highlights,
    changesToReview,
    comparisons,
    confidence
  };
}

export function progressionWorkoutFromMetadata(input: {
  id: string;
  createdAt: string | Date;
  metadata: Record<string, unknown> | null | undefined;
}): ProgressionWorkoutInput | null {
  const metadata = input.metadata ?? {};
  const exercises = Array.isArray(metadata.exercises)
    ? metadata.exercises.map((value): ProgressionExerciseInput | null => {
        if (!value || typeof value !== "object") return null;
        const exercise = value as Record<string, unknown>;
        const name = text(exercise.name);
        if (!name) return null;
        return {
          name,
          sets: finiteNumber(exercise.sets),
          reps: text(exercise.reps),
          load: finiteNumber(exercise.load),
          loadUnit: exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null,
          confidence: finiteNumber(exercise.confidence)
        };
      }).filter((exercise): exercise is ProgressionExerciseInput => Boolean(exercise))
    : [];
  if (!exercises.length) return null;
  const storedEvidence = metadata.evidenceType;
  const evidenceType = storedEvidence === "observed_performance" || storedEvidence === "completed_plan" || storedEvidence === "simple_activity"
    ? storedEvidence
    : workoutEvidenceTypeForSource(text(metadata.source));
  const completedAt = new Date(input.createdAt);
  return {
    id: input.id,
    completedAt: Number.isNaN(completedAt.getTime()) ? String(input.createdAt) : completedAt.toISOString(),
    evidenceType,
    exercises
  };
}
