import {
  WORKOUT_PROGRESSION_V3_VERSION,
  WorkoutPerformanceValues,
  WorkoutProgressionHistoryItem,
  WorkoutProgressionIntelligenceV3,
  WorkoutProgressionV3ExerciseInsight,
  WorkoutProgressionV3Status
} from "@ascend/shared";
import { query } from "../db/pool";
import { canonicalExerciseName, totalRecordedReps, workoutEvidenceTypeForSource } from "./workoutProgressionEngine";

export type WorkoutObservationExercise = {
  name: string;
  sets?: number | null;
  reps?: string | null;
  load?: number | null;
  loadUnit?: "kg" | "lb" | null;
  duration?: string | null;
  confidence?: number | null;
};

export type WorkoutObservation = {
  sourceEventId: string;
  userId: string;
  sourceType: string;
  workoutTitle: string;
  workoutType: string;
  difficulty: string;
  completedAt: string;
  exercises: WorkoutObservationExercise[];
};

export type HistoricalExerciseObservation = {
  sourceEventId: string;
  exerciseKey: string;
  displayName: string;
  sets: number | null;
  repsText: string | null;
  totalReps: number | null;
  load: number | null;
  loadUnit: "kg" | "lb" | null;
  durationSeconds: number | null;
  difficulty: string | null;
  confidence: number;
  completedAt: string;
};

type ExerciseAlias = { aliasKey: string; canonicalKey: string; relationship: "same" | "different" };

type ProjectedExerciseObservation = {
  sourceEventId: string;
  sourceType: string;
  position: number;
  exerciseKey: string;
  displayName: string;
  sets: number | null;
  repsText: string | null;
  totalReps: number | null;
  load: number | null;
  loadUnit: "kg" | "lb" | null;
  durationSeconds: number | null;
  difficulty: string;
  confidence: number;
  completedAt: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationSeconds(value: string | null | undefined) {
  if (!value) return null;
  const number = finite(value.match(/\d+(?:\.\d+)?/)?.[0]);
  if (number === null) return null;
  if (/hour|\bhr\b/i.test(value)) return Math.round(number * 3600);
  if (/second|\bsec\b/i.test(value)) return Math.round(number);
  return Math.round(number * 60);
}

function performance(exercise: WorkoutObservationExercise): WorkoutPerformanceValues {
  const sets = finite(exercise.sets);
  const reps = typeof exercise.reps === "string" && exercise.reps.trim() ? exercise.reps.trim() : null;
  return {
    sets: sets === null ? null : Math.round(sets),
    reps,
    totalReps: totalRecordedReps(reps, sets),
    load: finite(exercise.load),
    loadUnit: exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null
  };
}

function historicalPerformance(observation: HistoricalExerciseObservation): WorkoutPerformanceValues {
  return {
    sets: observation.sets,
    reps: observation.repsText,
    totalReps: observation.totalReps,
    load: observation.load,
    loadUnit: observation.loadUnit
  };
}

function formatLoad(value: number, unit: "kg" | "lb" | null) {
  return `${value}${unit ?? ""}`;
}

export function resolveExerciseKey(name: string, aliases: ExerciseAlias[] = []) {
  const key = canonicalExerciseName(name);
  const alias = aliases.find((candidate) => candidate.aliasKey === key && candidate.relationship === "same");
  return alias?.canonicalKey ?? key;
}

function mergeWorkoutExercises(exercises: WorkoutObservationExercise[], aliases: ExerciseAlias[]) {
  const merged = new Map<string, WorkoutObservationExercise & { exerciseKey: string; position: number }>();
  for (const [position, exercise] of exercises.entries()) {
    const exerciseKey = resolveExerciseKey(exercise.name, aliases);
    const existing = merged.get(exerciseKey);
    if (!existing) {
      merged.set(exerciseKey, { ...exercise, exerciseKey, position });
      continue;
    }
    const sameLoad = finite(existing.load) === finite(exercise.load) && existing.loadUnit === exercise.loadUnit;
    const existingDuration = parseDurationSeconds(existing.duration);
    const nextDuration = parseDurationSeconds(exercise.duration);
    merged.set(exerciseKey, {
      ...existing,
      sets: (finite(existing.sets) ?? 0) + (finite(exercise.sets) ?? 0) || null,
      reps: [existing.reps, exercise.reps].filter((value): value is string => Boolean(value)).join(",") || null,
      load: sameLoad ? finite(existing.load) : null,
      loadUnit: sameLoad ? existing.loadUnit ?? null : null,
      duration: existingDuration !== null || nextDuration !== null ? `${(existingDuration ?? 0) + (nextDuration ?? 0)} sec` : null,
      confidence: Math.min(finite(existing.confidence) ?? 1, finite(exercise.confidence) ?? 1)
    });
  }
  return [...merged.values()];
}

function comparableHistory(current: WorkoutPerformanceValues, history: HistoricalExerciseObservation[]) {
  return history.filter((item) => {
    const previous = historicalPerformance(item);
    if (current.load !== null && previous.load !== null) return current.loadUnit === previous.loadUnit;
    return current.load === null && previous.load === null;
  });
}

function evaluateExercise(input: {
  exercise: WorkoutObservationExercise;
  exerciseKey: string;
  history: HistoricalExerciseObservation[];
  isDeloadContext: boolean;
  completedAt: string;
}): WorkoutProgressionV3ExerciseInsight {
  const current = performance(input.exercise);
  const comparable = comparableHistory(current, input.history);
  const previousObservation = comparable[0] ?? null;
  const previous = previousObservation ? historicalPerformance(previousObservation) : null;
  const confidence = Math.round(clamp(Math.min(finite(input.exercise.confidence) ?? 1, previousObservation?.confidence ?? 1), 0, 1) * 100) / 100;
  const currentDurationSeconds = parseDurationSeconds(input.exercise.duration);
  const previousDurationSeconds = previousObservation?.durationSeconds ?? null;
  const base = {
    exerciseName: input.exercise.name.trim(),
    exerciseKey: input.exerciseKey,
    current,
    previous,
    currentDurationSeconds,
    previousDurationSeconds,
    comparableObservationCount: comparable.length,
    confidence
  };

  if (!previous && input.history.length) {
    return { ...base, status: "not_comparable", summary: `${base.exerciseName} has earlier records, but their load format is not directly comparable.`, nextSessionSuggestion: null };
  }

  if (!previous) {
    return { ...base, status: "baseline", summary: `${base.exerciseName} is now saved as your baseline.`, nextSessionSuggestion: "Repeat this performance once before making a larger change." };
  }

  if (current.load !== null && previous.load !== null && current.loadUnit !== previous.loadUnit) {
    return { ...base, status: "not_comparable", summary: `${base.exerciseName} was recorded in a different load unit.`, nextSessionSuggestion: null };
  }

  const currentReps = current.totalReps;
  const previousReps = previous.totalReps;
  const repsComparable = currentReps !== null && previousReps !== null;
  const repsHeld = !repsComparable || currentReps >= previousReps * 0.8;
  const maxLoad = comparable.reduce<number | null>((max, item) => item.load === null ? max : max === null ? item.load : Math.max(max, item.load), null);
  const sameLoadMaxReps = current.load === null
    ? Math.max(0, ...comparable.filter((item) => item.load === null).map((item) => item.totalReps ?? 0))
    : Math.max(0, ...comparable.filter((item) => item.load === current.load && item.loadUnit === current.loadUnit).map((item) => item.totalReps ?? 0));

  if (current.load !== null && maxLoad !== null && current.load > maxLoad && repsHeld) {
    return {
      ...base,
      status: "personal_best",
      summary: `${base.exerciseName}: new verified load best at ${formatLoad(current.load, current.loadUnit)}.`,
      nextSessionSuggestion: `Start with ${formatLoad(current.load, current.loadUnit)} again and aim to match today's completed reps.`
    };
  }
  if (currentReps !== null && currentReps > sameLoadMaxReps && sameLoadMaxReps > 0) {
    const loadText = current.load !== null ? ` at ${formatLoad(current.load, current.loadUnit)}` : "";
    return {
      ...base,
      status: "personal_best",
      summary: `${base.exerciseName}: new verified rep best${loadText} (${sameLoadMaxReps} to ${currentReps}).`,
      nextSessionSuggestion: current.load !== null
        ? `Repeat ${formatLoad(current.load, current.loadUnit)}; if form stays comfortable, use the smallest available increase after that.`
        : "Repeat this rep total before adding a harder variation."
    };
  }

  if (current.load === null && currentReps === null && currentDurationSeconds !== null) {
    const maxDuration = Math.max(0, ...comparable.map((item) => item.durationSeconds ?? 0));
    if (maxDuration > 0 && currentDurationSeconds > maxDuration) {
      return { ...base, status: "personal_best", summary: `${base.exerciseName}: new verified duration best at ${Math.round(currentDurationSeconds / 60)} minutes.`, nextSessionSuggestion: "Repeat this duration before increasing pace or difficulty." };
    }
  }

  if (input.isDeloadContext && ((current.load !== null && previous.load !== null && current.load < previous.load) || (repsComparable && currentReps < previousReps))) {
    return { ...base, status: "planned_deload", summary: `${base.exerciseName} was intentionally lighter in this recovery-focused session.`, nextSessionSuggestion: "Return to the previous working level only when recovery feels ready." };
  }

  if (current.load !== null && previous.load !== null && current.load > previous.load && repsHeld) {
    return { ...base, status: "progressed", summary: `${base.exerciseName} moved from ${formatLoad(previous.load, previous.loadUnit)} to ${formatLoad(current.load, current.loadUnit)} with comparable reps.`, nextSessionSuggestion: `Repeat ${formatLoad(current.load, current.loadUnit)} and aim to match today's reps.` };
  }
  if (repsComparable && currentReps > previousReps && current.load === previous.load) {
    return { ...base, status: "progressed", summary: `${base.exerciseName} increased from ${previousReps} to ${currentReps} total reps.`, nextSessionSuggestion: current.load !== null ? `Repeat ${formatLoad(current.load, current.loadUnit)} once more before increasing load.` : "Repeat this performance before progressing the variation." };
  }

  const sameLoad = current.load === previous.load;
  const sameReps = currentReps !== null && previousReps !== null && currentReps === previousReps;
  if ((sameLoad && sameReps) || (current.load === null && sameReps)) {
    const cutoff = new Date(input.completedAt).getTime() - 42 * 24 * 60 * 60 * 1000;
    const recentComparable = comparable.filter((item) => new Date(item.completedAt).getTime() >= cutoff);
    if (recentComparable.length >= 3) {
      const recent = recentComparable.slice(0, 3);
      const stalled = recent.every((item) => item.load === current.load && item.totalReps === currentReps);
      if (stalled) {
        return { ...base, status: "plateau_signal", summary: `${base.exerciseName} has matched the same recorded performance across four comparable sessions.`, nextSessionSuggestion: "Change one variable next time: add a small amount of load or one controlled rep, not both." };
      }
    }
    return { ...base, status: "maintained", summary: `${base.exerciseName} matched the previous recorded performance.`, nextSessionSuggestion: "Repeat this level or make one small change next time." };
  }

  if (current.load === null && currentReps === null && currentDurationSeconds !== null && previousDurationSeconds !== null) {
    if (currentDurationSeconds === previousDurationSeconds) {
      return { ...base, status: "maintained", summary: `${base.exerciseName} matched the previous recorded duration.`, nextSessionSuggestion: "Repeat this duration or change only pace next time." };
    }
    return { ...base, status: "changed", summary: `${base.exerciseName} duration changed from ${Math.round(previousDurationSeconds / 60)} to ${Math.round(currentDurationSeconds / 60)} minutes.`, nextSessionSuggestion: "Use today's duration as the next comparison point." };
  }

  if (current.load === null && previous.load !== null || current.load !== null && previous.load === null) {
    return { ...base, status: "not_comparable", summary: `${base.exerciseName} changed between loaded and unweighted work.`, nextSessionSuggestion: null };
  }

  return { ...base, status: "changed", summary: `${base.exerciseName} was recorded differently from the previous comparable session.`, nextSessionSuggestion: "Use today's result as context and adjust only one variable next time." };
}

export function buildWorkoutProgressionIntelligenceV3(input: {
  workout: WorkoutObservation;
  history: HistoricalExerciseObservation[];
  aliases?: ExerciseAlias[];
}): WorkoutProgressionIntelligenceV3 | null {
  if (workoutEvidenceTypeForSource(input.workout.sourceType) !== "observed_performance" || !input.workout.exercises.length) return null;
  const context = `${input.workout.workoutTitle} ${input.workout.workoutType}`.toLowerCase();
  const isDeloadContext = /(deload|recovery|mobility|easy technique)/.test(context) || input.workout.difficulty === "easy" && /(strength|lifting)/.test(context);
  const mergedExercises = mergeWorkoutExercises(input.workout.exercises, input.aliases ?? []);
  const exerciseInsights = mergedExercises.map((exercise) => {
    const exerciseKey = exercise.exerciseKey;
    return evaluateExercise({
      exercise,
      exerciseKey,
      history: input.history.filter((item) => item.exerciseKey === exerciseKey),
      isDeloadContext,
      completedAt: input.workout.completedAt
    });
  });
  const statuses = exerciseInsights.map((item) => item.status);
  const achievementInsights = exerciseInsights.filter((item) => item.status === "personal_best" || item.status === "progressed");
  const reviewInsights = exerciseInsights.filter((item) => item.status === "plateau_signal" || item.status === "changed" || item.status === "not_comparable");
  const overallStatus: WorkoutProgressionIntelligenceV3["overallStatus"] = statuses.includes("personal_best")
    ? "personal_best"
    : statuses.includes("progressed")
      ? "progressed"
      : statuses.every((status) => status === "baseline")
        ? "baseline"
        : statuses.includes("plateau_signal")
          ? "plateau_signal"
          : statuses.every((status) => status === "maintained")
            ? "maintained"
            : statuses.every((status) => status === "planned_deload")
              ? "planned_deload"
              : statuses.every((status) => status === "not_comparable")
                ? "not_comparable"
                : "mixed";
  const headlineByStatus: Record<WorkoutProgressionV3Status | "mixed", string> = {
    personal_best: `${exerciseInsights.filter((item) => item.status === "personal_best").length} verified personal best${exerciseInsights.filter((item) => item.status === "personal_best").length === 1 ? "" : "s"}.`,
    progressed: `${achievementInsights.length} exercise progression${achievementInsights.length === 1 ? "" : "s"} verified.`,
    baseline: "Your detailed performance baseline is saved.",
    maintained: "You matched your recent recorded performance.",
    plateau_signal: "A repeat pattern is ready for one small adjustment.",
    planned_deload: "Your lighter recovery-focused session is recorded.",
    changed: "Your workout is saved with performance changes to review.",
    not_comparable: "Your workout is saved, with limited comparable detail.",
    mixed: "Your workout added useful progress and comparison data."
  };
  const nextSessionFocus = exerciseInsights.find((item) => item.status === "plateau_signal")?.nextSessionSuggestion
    ?? exerciseInsights.find((item) => item.status === "personal_best" || item.status === "progressed")?.nextSessionSuggestion
    ?? exerciseInsights.find((item) => item.nextSessionSuggestion)?.nextSessionSuggestion
    ?? null;
  const confidence = Math.round((exerciseInsights.reduce((sum, item) => sum + item.confidence, 0) / exerciseInsights.length) * 100) / 100;
  return {
    version: WORKOUT_PROGRESSION_V3_VERSION,
    evidenceType: "observed_performance",
    overallStatus,
    headline: headlineByStatus[overallStatus],
    achievements: achievementInsights.slice(0, 3).map((item) => item.summary),
    reviewNotes: reviewInsights.slice(0, 3).map((item) => item.summary),
    nextSessionFocus,
    exerciseInsights,
    confidence
  };
}

async function getAliases(userId: string): Promise<ExerciseAlias[]> {
  const result = await query<{ alias_key: string; canonical_key: string; relationship: "same" | "different" }>(
    "select alias_key, canonical_key, relationship from workout_exercise_aliases where user_id = $1",
    [userId]
  );
  return result.rows.map((row) => ({ aliasKey: row.alias_key, canonicalKey: row.canonical_key, relationship: row.relationship }));
}

export async function loadExerciseHistory(userId: string, exerciseKeys: string[], excludeEventId?: string | null, perExercise = 8) {
  if (!exerciseKeys.length) return [];
  const result = await query<{
    source_event_id: string; exercise_key: string; display_name: string; sets: number | null; reps_text: string | null;
    total_reps: string | number | null; load: string | number | null; load_unit: "kg" | "lb" | null; duration_seconds: number | null;
    difficulty: string | null; confidence: string | number; completed_at: string;
  }>(
    `
    select source_event_id, exercise_key, display_name, sets, reps_text, total_reps, load, load_unit,
      duration_seconds, difficulty, confidence, completed_at
    from (
      select observation.*, row_number() over (partition by exercise_key order by completed_at desc) as exercise_rank
      from workout_exercise_observations observation
      where user_id = $1 and exercise_key = any($2::text[]) and ($3::uuid is null or source_event_id <> $3)
    ) ranked
    where exercise_rank <= $4
    order by completed_at desc
    `,
    [userId, exerciseKeys, excludeEventId ?? null, clamp(Math.round(perExercise), 1, 20)]
  );
  return result.rows.map((row): HistoricalExerciseObservation => ({
    sourceEventId: row.source_event_id,
    exerciseKey: row.exercise_key,
    displayName: row.display_name,
    sets: row.sets,
    repsText: row.reps_text,
    totalReps: finite(row.total_reps),
    load: finite(row.load),
    loadUnit: row.load_unit,
    durationSeconds: row.duration_seconds,
    difficulty: row.difficulty,
    confidence: finite(row.confidence) ?? 1,
    completedAt: row.completed_at
  }));
}

function projectedObservations(workout: WorkoutObservation, aliases: ExerciseAlias[]): ProjectedExerciseObservation[] {
  return mergeWorkoutExercises(workout.exercises, aliases).map((exercise) => {
    const values = performance(exercise);
    return {
      sourceEventId: workout.sourceEventId,
      sourceType: workout.sourceType,
      position: exercise.position,
      exerciseKey: exercise.exerciseKey,
      displayName: exercise.name.trim(),
      sets: values.sets,
      repsText: values.reps,
      totalReps: values.totalReps,
      load: values.load,
      loadUnit: values.loadUnit,
      durationSeconds: parseDurationSeconds(exercise.duration),
      difficulty: workout.difficulty,
      confidence: clamp(finite(exercise.confidence) ?? 1, 0, 1),
      completedAt: workout.completedAt
    };
  });
}

async function upsertProjectedObservations(userId: string, observations: ProjectedExerciseObservation[]) {
  if (!observations.length) return 0;
  const result = await query(
    `
    insert into workout_exercise_observations (
      user_id, source_event_id, source_type, exercise_position, exercise_key, display_name,
      sets, reps_text, total_reps, load, load_unit, duration_seconds, difficulty, confidence, completed_at
    )
    select $1, item.source_event_id, item.source_type, item.position, item.exercise_key, item.display_name,
      item.sets, item.reps_text, item.total_reps, item.load, item.load_unit, item.duration_seconds,
      item.difficulty, item.confidence, item.completed_at
    from jsonb_to_recordset($2::jsonb) as item(
      source_event_id uuid, source_type text, position integer, exercise_key text, display_name text,
      sets integer, reps_text text, total_reps numeric, load numeric, load_unit text,
      duration_seconds integer, difficulty text, confidence numeric, completed_at timestamptz
    )
    on conflict (source_event_id, exercise_position) do update set
      exercise_key = excluded.exercise_key, display_name = excluded.display_name, sets = excluded.sets,
      reps_text = excluded.reps_text, total_reps = excluded.total_reps, load = excluded.load,
      load_unit = excluded.load_unit, duration_seconds = excluded.duration_seconds,
      difficulty = excluded.difficulty, confidence = excluded.confidence, completed_at = excluded.completed_at
    `,
    [userId, JSON.stringify(observations.map((item) => ({
      source_event_id: item.sourceEventId,
      source_type: item.sourceType,
      position: item.position,
      exercise_key: item.exerciseKey,
      display_name: item.displayName,
      sets: item.sets,
      reps_text: item.repsText,
      total_reps: item.totalReps,
      load: item.load,
      load_unit: item.loadUnit,
      duration_seconds: item.durationSeconds,
      difficulty: item.difficulty,
      confidence: item.confidence,
      completed_at: item.completedAt
    })))]
  );
  return result.rowCount ?? observations.length;
}

export async function projectWorkoutExerciseObservations(workout: WorkoutObservation) {
  if (workoutEvidenceTypeForSource(workout.sourceType) !== "observed_performance") return 0;
  const aliases = await getAliases(workout.userId);
  const observations = projectedObservations(workout, aliases);
  if (!observations.length) return 0;
  await query(
    "delete from workout_exercise_observations where source_event_id = $1 and not (exercise_position = any($2::int[]))",
    [workout.sourceEventId, observations.map((item) => item.position)]
  );
  return upsertProjectedObservations(workout.userId, observations);
}

export async function buildPersistedWorkoutIntelligenceV3(workout: WorkoutObservation) {
  const aliases = await getAliases(workout.userId);
  const exerciseKeys = [...new Set(workout.exercises.map((exercise) => resolveExerciseKey(exercise.name, aliases)))];
  const history = await loadExerciseHistory(workout.userId, exerciseKeys, workout.sourceEventId);
  return buildWorkoutProgressionIntelligenceV3({ workout, history, aliases });
}

export async function saveExerciseAlias(userId: string, aliasName: string, canonicalName: string, relationship: "same" | "different") {
  const aliasKey = canonicalExerciseName(aliasName);
  const canonicalKey = canonicalExerciseName(canonicalName);
  await query(
    `insert into workout_exercise_aliases (user_id, alias_key, canonical_key, relationship)
     values ($1,$2,$3,$4)
     on conflict (user_id, alias_key) do update set canonical_key = excluded.canonical_key, relationship = excluded.relationship, updated_at = now()`,
    [userId, aliasKey, canonicalKey, relationship]
  );
  if (relationship === "same") {
    await query(
      "update workout_exercise_observations set exercise_key = $3 where user_id = $1 and exercise_key = $2",
      [userId, aliasKey, canonicalKey]
    );
  }
  return { aliasKey, canonicalKey, relationship };
}

function metadataWorkout(row: { id: string; user_id: string; metadata: Record<string, unknown>; created_at: string }): WorkoutObservation | null {
  const sourceType = typeof row.metadata.source === "string" ? row.metadata.source : "";
  if (workoutEvidenceTypeForSource(sourceType) !== "observed_performance" || !Array.isArray(row.metadata.exercises)) return null;
  const exercises = row.metadata.exercises.flatMap((item): WorkoutObservationExercise[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (typeof value.name !== "string" || !value.name.trim()) return [];
    return [{
      name: value.name,
      sets: finite(value.sets),
      reps: typeof value.reps === "string" ? value.reps : null,
      load: finite(value.load),
      loadUnit: value.loadUnit === "kg" || value.loadUnit === "lb" ? value.loadUnit : null,
      duration: typeof value.duration === "string" ? value.duration : null,
      confidence: finite(value.confidence)
    }];
  });
  return {
    sourceEventId: row.id,
    userId: row.user_id,
    sourceType,
    workoutTitle: typeof row.metadata.workoutTitle === "string" ? row.metadata.workoutTitle : "Workout",
    workoutType: typeof row.metadata.workoutType === "string" ? row.metadata.workoutType : "Workout",
    difficulty: typeof row.metadata.workoutDifficulty === "string" ? row.metadata.workoutDifficulty : "moderate",
    completedAt: row.created_at,
    exercises
  };
}

export async function backfillWorkoutExerciseObservations(userId: string, limit = 500) {
  const result = await query<{ id: string; user_id: string; metadata: Record<string, unknown>; created_at: string }>(
    `select id, user_id, metadata, created_at from analytics_events
     where user_id = $1 and event_name = 'burn_log' and jsonb_typeof(metadata->'exercises') = 'array'
       and metadata->>'source' in ('ai_workout_capture', 'trainer_logged_session')
     order by created_at desc limit $2`,
    [userId, clamp(Math.round(limit), 1, 2_000)]
  );
  const aliases = await getAliases(userId);
  const observations = result.rows.flatMap((row) => {
    const workout = metadataWorkout(row);
    return workout ? projectedObservations(workout, aliases) : [];
  });
  const projected = await upsertProjectedObservations(userId, observations);
  return { workoutsScanned: result.rows.length, observationsProjected: projected };
}

export async function getWorkoutProgressionHistory(userId: string, limit = 10): Promise<WorkoutProgressionHistoryItem[]> {
  const result = await query<{ id: string; metadata: Record<string, unknown>; created_at: string }>(
    `select id, metadata, created_at from analytics_events
     where user_id = $1 and event_name = 'burn_log' and metadata->'progressionV3' is not null
     order by created_at desc limit $2`,
    [userId, clamp(Math.round(limit), 1, 50)]
  );
  return result.rows.flatMap((row): WorkoutProgressionHistoryItem[] => {
    const intelligence = row.metadata.progressionV3 as WorkoutProgressionIntelligenceV3 | undefined;
    if (intelligence?.version !== WORKOUT_PROGRESSION_V3_VERSION) return [];
    return [{ workoutEventId: row.id, workoutTitle: String(row.metadata.workoutTitle ?? "Workout"), completedAt: row.created_at, intelligence }];
  });
}
