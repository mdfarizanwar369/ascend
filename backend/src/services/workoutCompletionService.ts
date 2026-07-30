import { query } from "../db/pool";
import { createCoachPresenceForEvent } from "./coachPresenceService";

type WorkoutExerciseInput = {
  name: string;
  sets?: number | null;
  reps?: string | null;
  load?: number | null;
  loadUnit?: "kg" | "lb" | null;
  duration?: string | null;
  rest?: string | null;
  note?: string | null;
  movementPattern?: string | null;
  confidence?: number | null;
};

type WorkoutCaloriesInput = {
  durationMinutes: number;
  workoutType: string;
  difficulty: "easy" | "moderate" | "challenging";
  weightKg?: number | null;
  actualCaloriesBurned?: number | null;
};

export type WorkoutCompletionSummary = {
  workoutType: string;
  difficultyLabel: string;
  caloriesBurned: number;
  estimatedCaloriesBurned: number;
  caloriesSource: "estimated_met" | "health_provider_actual";
  weightKgUsed: number;
  metValue: number;
  coachMessage: string;
  exerciseList: WorkoutExerciseInput[];
};

export type PersistCompletedWorkoutInput = {
  userId: string;
  gymId?: string | null;
  workoutCompletionKey: string;
  workoutTitle: string;
  workoutType: string;
  workoutDifficulty: WorkoutCaloriesInput["difficulty"];
  durationMinutes: number;
  completedAt?: string | null;
  exercises: WorkoutExerciseInput[];
  healthProviderCaloriesBurned?: number | null;
  source: "coach_zoe_workout_planner" | "coach_homework" | "ai_workout_capture" | "trainer_logged_session";
  extraMetadata?: Record<string, unknown>;
};

export type PersistedWorkoutCompletion = {
  burnLog: {
    id: string;
    metadata: Record<string, unknown>;
    created_at: string;
  };
  summary: {
    workoutTitle: string;
    durationMinutes: number;
    workoutType: string;
    difficulty: string;
    estimatedCaloriesBurned: number;
    caloriesLabel: string;
    coachMessage: string;
    momentumEarned: number;
  };
};

const DEFAULT_WEIGHT_KG = 75;

function normaliseText(value: string) {
  return value.trim().toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inferWorkoutType(type: string) {
  const lower = normaliseText(type);
  if (/(mobility|stretch|recovery|flow|yoga|walk)/.test(lower)) return "Mobility";
  if (/(hiit|interval|conditioning|circuit)/.test(lower)) return "HIIT";
  if (/(cardio|run|jog|cycle|bike|row)/.test(lower)) return "Cardio";
  if (/(full body|full-body)/.test(lower)) return "Full Body";
  if (/(strength|push|pull|upper|lower|legs|glutes|chest|back|shoulder)/.test(lower)) return "Strength";
  return "General Fitness";
}

function baseMetForWorkoutType(workoutType: string) {
  if (workoutType === "Mobility") return 3.0;
  if (workoutType === "Cardio") return 7.2;
  if (workoutType === "HIIT") return 8.3;
  if (workoutType === "Strength") return 5.6;
  if (workoutType === "Full Body") return 6.1;
  return 4.8;
}

function difficultyAdjustment(difficulty: WorkoutCaloriesInput["difficulty"]) {
  if (difficulty === "easy") return -0.6;
  if (difficulty === "challenging") return 0.9;
  return 0;
}

function estimateCaloriesFromMet({ durationMinutes, workoutType, difficulty, weightKg }: WorkoutCaloriesInput) {
  const safeWeightKg = weightKg && Number.isFinite(weightKg) ? clamp(weightKg, 35, 220) : DEFAULT_WEIGHT_KG;
  const metValue = clamp(baseMetForWorkoutType(workoutType) + difficultyAdjustment(difficulty), 2.5, 10.5);
  const estimatedCaloriesBurned = Math.max(1, Math.round((metValue * 3.5 * safeWeightKg) / 200 * durationMinutes));
  return { estimatedCaloriesBurned, weightKgUsed: safeWeightKg, metValue };
}

function difficultyLabel(difficulty: WorkoutCaloriesInput["difficulty"]) {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "challenging") return "Challenging";
  return "Moderate";
}

function cleanExerciseList(exercises: WorkoutExerciseInput[]) {
  return exercises
    .map((exercise) => ({
      name: exercise.name.trim().slice(0, 120),
      sets: typeof exercise.sets === "number" ? clamp(Math.round(exercise.sets), 1, 10) : null,
      reps: typeof exercise.reps === "string" ? exercise.reps.trim().slice(0, 40) : null,
      load: typeof exercise.load === "number" && Number.isFinite(exercise.load) ? clamp(exercise.load, 0, 1_000) : null,
      loadUnit: exercise.loadUnit === "kg" || exercise.loadUnit === "lb" ? exercise.loadUnit : null,
      duration: typeof exercise.duration === "string" ? exercise.duration.trim().slice(0, 40) : null,
      rest: typeof exercise.rest === "string" ? exercise.rest.trim().slice(0, 40) : null,
      note: typeof exercise.note === "string" ? exercise.note.trim().slice(0, 160) : null,
      movementPattern: typeof exercise.movementPattern === "string" ? exercise.movementPattern.trim().slice(0, 40) : null,
      confidence: typeof exercise.confidence === "number" && Number.isFinite(exercise.confidence) ? clamp(exercise.confidence, 0, 1) : null
    }))
    .filter((exercise) => exercise.name.length > 0);
}

function motivationalMessage(input: { workoutType: string; difficulty: WorkoutCaloriesInput["difficulty"]; durationMinutes: number }) {
  if (input.workoutType === "Mobility") {
    return "Recovery is part of progress. This session still counts, and it keeps your routine alive.";
  }
  if (input.difficulty === "challenging") {
    return "Strong work. Sessions like this build confidence as much as fitness.";
  }
  if (input.durationMinutes <= 25) {
    return "Nice work showing up. Short sessions still build real momentum when you repeat them.";
  }
  return "Great work staying active today. One finished session is another vote for the result you want.";
}

export function createWorkoutCompletionSummary(input: {
  workoutTitle: string;
  workoutType: string;
  difficulty: WorkoutCaloriesInput["difficulty"];
  durationMinutes: number;
  exercises: WorkoutExerciseInput[];
  weightKg?: number | null;
  actualCaloriesBurned?: number | null;
}) : WorkoutCompletionSummary {
  const inferredWorkoutType = inferWorkoutType(input.workoutType || input.workoutTitle);
  const { estimatedCaloriesBurned, weightKgUsed, metValue } = estimateCaloriesFromMet({
    durationMinutes: input.durationMinutes,
    workoutType: inferredWorkoutType,
    difficulty: input.difficulty,
    weightKg: input.weightKg,
    actualCaloriesBurned: input.actualCaloriesBurned
  });

  const caloriesBurned = input.actualCaloriesBurned && Number.isFinite(input.actualCaloriesBurned)
    ? Math.max(1, Math.round(input.actualCaloriesBurned))
    : estimatedCaloriesBurned;

  return {
    workoutType: inferredWorkoutType,
    difficultyLabel: difficultyLabel(input.difficulty),
    caloriesBurned,
    estimatedCaloriesBurned,
    caloriesSource: input.actualCaloriesBurned && Number.isFinite(input.actualCaloriesBurned) ? "health_provider_actual" : "estimated_met",
    weightKgUsed,
    metValue,
    coachMessage: motivationalMessage({
      workoutType: inferredWorkoutType,
      difficulty: input.difficulty,
      durationMinutes: input.durationMinutes
    }),
    exerciseList: cleanExerciseList(input.exercises)
  };
}

export async function resolveWorkoutWeightKg(userId: string) {
  const result = await query<{ weight_kg: string | number | null }>(
    `
    select coalesce(
      (select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1),
      (select weight_kg from body_composition_scans where user_id = $1 and user_confirmed = true order by scan_date desc, created_at desc limit 1),
      u.starting_weight_kg
    ) as weight_kg
    from users u
    where u.id = $1
    limit 1
    `,
    [userId]
  );
  const weight = Number(result.rows[0]?.weight_kg ?? 0);
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function buildCompletionResponseFromMetadata(metadata: Record<string, unknown>, fallback: {
  workoutTitle: string;
  durationMinutes: number;
  workoutType: string;
  workoutDifficulty: string;
}): PersistedWorkoutCompletion["summary"] {
  return {
    workoutTitle: String(metadata.workoutTitle ?? fallback.workoutTitle),
    durationMinutes: Number(metadata.durationMinutes ?? fallback.durationMinutes),
    workoutType: String(metadata.workoutType ?? fallback.workoutType),
    difficulty: String(metadata.workoutDifficultyLabel ?? fallback.workoutDifficulty),
    estimatedCaloriesBurned: Number(metadata.estimatedCaloriesBurned ?? metadata.caloriesBurned ?? 0),
    caloriesLabel: metadata.caloriesSource === "health_provider_actual" ? "Calories Burned" : "Estimated Calories Burned",
    coachMessage: String(metadata.coachMessage ?? "Great work staying active today."),
    momentumEarned: Number(metadata.momentumEarned ?? 8)
  };
}

export async function persistCompletedWorkout(input: PersistCompletedWorkoutInput): Promise<PersistedWorkoutCompletion> {
  const existing = await query<{
    id: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>(
    `
    select id, metadata, created_at
    from analytics_events
    where user_id = $1
      and event_name = 'burn_log'
      and metadata->>'workoutCompletionKey' = $2
    order by created_at desc
    limit 1
    `,
    [input.userId, input.workoutCompletionKey]
  );

  if (existing.rows[0]) {
    const existingMetadata = (existing.rows[0].metadata ?? {}) as Record<string, unknown>;
    return {
      burnLog: {
        id: existing.rows[0].id,
        metadata: existingMetadata,
        created_at: existing.rows[0].created_at
      },
      summary: buildCompletionResponseFromMetadata(existingMetadata, {
        workoutTitle: input.workoutTitle,
        durationMinutes: input.durationMinutes,
        workoutType: input.workoutType,
        workoutDifficulty: input.workoutDifficulty
      })
    };
  }

  const weightKg = await resolveWorkoutWeightKg(input.userId);
  const summary = createWorkoutCompletionSummary({
    workoutTitle: input.workoutTitle,
    workoutType: input.workoutType,
    difficulty: input.workoutDifficulty,
    durationMinutes: input.durationMinutes,
    exercises: input.exercises,
    weightKg,
    actualCaloriesBurned: input.healthProviderCaloriesBurned ?? null
  });

  const metadata: Record<string, unknown> = {
    activityType: summary.workoutType,
    durationMinutes: input.durationMinutes,
    caloriesBurned: summary.caloriesBurned,
    estimatedCaloriesBurned: summary.estimatedCaloriesBurned,
    caloriesSource: summary.caloriesSource,
    workoutTitle: input.workoutTitle,
    workoutType: summary.workoutType,
    workoutDifficulty: input.workoutDifficulty,
    workoutDifficultyLabel: summary.difficultyLabel,
    exercises: summary.exerciseList,
    coachMessage: summary.coachMessage,
    momentumEarned: 8,
    workoutCompletionKey: input.workoutCompletionKey,
    source: input.source,
    weightKgUsed: summary.weightKgUsed,
    metValue: summary.metValue,
    ...(input.extraMetadata ?? {})
  };

  const result = await query<{
    id: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(
    `
    insert into analytics_events (user_id, gym_id, event_name, metadata, created_at)
    values ($1, $2, 'burn_log', $3, coalesce($4, now()))
    returning id, metadata, created_at
    `,
    [input.userId, input.gymId ?? null, metadata, input.completedAt ?? null]
  );

  void createCoachPresenceForEvent(input.userId, "workout_logged").catch(() => undefined);

  return {
    burnLog: result.rows[0],
    summary: {
      workoutTitle: input.workoutTitle,
      durationMinutes: input.durationMinutes,
      workoutType: summary.workoutType,
      difficulty: summary.difficultyLabel,
      estimatedCaloriesBurned: summary.estimatedCaloriesBurned,
      caloriesLabel: summary.caloriesSource === "health_provider_actual" ? "Calories Burned" : "Estimated Calories Burned",
      coachMessage: summary.coachMessage,
      momentumEarned: 8
    }
  };
}
