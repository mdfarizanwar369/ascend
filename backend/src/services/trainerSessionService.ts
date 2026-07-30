import {
  ClientCoachedSession,
  TrainerCoachingSession,
  TrainerExerciseComparison,
  TrainerSessionIntelligence,
  TrainerSessionNarratives,
  TrainerSessionStartMode,
  WorkoutCaptureDraft,
  createRepeatWorkoutCaptureDraft
} from "@ascend/shared";
import { query } from "../db/pool";
import { createWorkoutCaptureDraft } from "../integrations/openai";
import { PersistedWorkoutCompletion, persistCompletedWorkout, resolveWorkoutWeightKg, createWorkoutCompletionSummary } from "./workoutCompletionService";
import { buildWorkoutProgression, ProgressionWorkoutInput } from "./workoutProgressionEngine";

type SessionRow = {
  id: string;
  client_id: string;
  trainer_id: string | null;
  created_by_user_id: string;
  trainer_name: string;
  client_name: string;
  status: "draft" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  duration_minutes: number | null;
  raw_input: string;
  structured_workout: WorkoutCaptureDraft | null;
  client_recap: string | null;
  between_session_focus: string | null;
  trainer_next_session_note: string | null;
  session_intelligence: TrainerSessionIntelligence | null;
  workout_event_id: string | null;
  workout_completion_key: string;
  estimated_calories_burned?: string | number | null;
  calories_label?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

const SESSION_SELECT = `
  select session.*,
    creator.full_name as trainer_name,
    client.full_name as client_name,
    event.metadata->>'estimatedCaloriesBurned' as estimated_calories_burned,
    case when event.metadata->>'caloriesSource' = 'health_provider_actual' then 'Calories Burned' else 'Estimated Calories Burned' end as calories_label
  from trainer_coaching_sessions session
  join users creator on creator.id = session.created_by_user_id
  join users client on client.id = session.client_id
  left join analytics_events event on event.id = session.workout_event_id
`;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function cleanText(value: string | null | undefined, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function mapSession(row: SessionRow): TrainerCoachingSession {
  const narratives = row.client_recap && row.between_session_focus && row.trainer_next_session_note
    ? {
        clientRecap: row.client_recap,
        betweenSessionFocus: row.between_session_focus,
        trainerNextSessionNote: row.trainer_next_session_note
      }
    : null;
  const estimatedCalories = Number(row.estimated_calories_burned ?? 0);

  return {
    id: row.id,
    clientId: row.client_id,
    trainerId: row.trainer_id,
    createdByUserId: row.created_by_user_id,
    trainerName: row.trainer_name,
    clientName: row.client_name,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMinutes: row.duration_minutes,
    rawInput: row.status === "draft" ? row.raw_input : "",
    workoutDraft: row.structured_workout,
    narratives,
    intelligence: row.session_intelligence,
    workoutEventId: row.workout_event_id,
    estimatedCaloriesBurned: Number.isFinite(estimatedCalories) && estimatedCalories > 0 ? estimatedCalories : null,
    caloriesLabel: row.calories_label ?? null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sessionTitle(draft: WorkoutCaptureDraft) {
  const title = cleanText(draft.title, 120);
  return title && title !== "My Workout" ? title : `${draft.workoutType || "Training"} Session`;
}

export function trainerSessionDraftText(draft: WorkoutCaptureDraft) {
  return draft.exercises.map((exercise) => {
    const volume = exercise.sets && exercise.reps ? `${exercise.sets}x${exercise.reps}` : exercise.sets ? `${exercise.sets} sets` : exercise.reps ?? "";
    const load = exercise.load !== null ? `${exercise.load}${exercise.loadUnit ?? ""}` : "";
    const duration = exercise.durationMinutes ? `${exercise.durationMinutes} min` : "";
    return [exercise.name, volume, load, duration].filter(Boolean).join(" ");
  }).join("\n");
}

function firstProgression(previous: WorkoutCaptureDraft | null, current: WorkoutCaptureDraft) {
  return progressionFromDrafts(current, previous)?.comparisons.find((comparison) => comparison.status === "progressed")?.summary ?? null;
}

function progressionWorkoutFromDraft(id: string, draft: WorkoutCaptureDraft): ProgressionWorkoutInput {
  return {
    id,
    completedAt: new Date().toISOString(),
    evidenceType: "observed_performance",
    exercises: draft.exercises
  };
}

function progressionFromDrafts(current: WorkoutCaptureDraft, previous: WorkoutCaptureDraft | null) {
  return buildWorkoutProgression(
    progressionWorkoutFromDraft("current-session", current),
    previous ? [progressionWorkoutFromDraft("previous-session", previous)] : []
  );
}

export function buildTrainerSessionIntelligence(
  current: WorkoutCaptureDraft,
  previous: WorkoutCaptureDraft | null
): TrainerSessionIntelligence {
  const progression = progressionFromDrafts(current, previous);
  const exerciseComparisons: TrainerExerciseComparison[] = (progression?.comparisons ?? []).map((comparison) => ({
    exerciseName: comparison.exerciseName,
    status: comparison.status === "baseline"
      ? "new"
      : comparison.status === "changed" && (comparison.reason === "lower_load" || comparison.reason === "fewer_reps")
        ? "reduced"
        : comparison.status === "changed" || comparison.status === "not_comparable"
          ? "not_comparable"
          : comparison.status,
    summary: comparison.summary
  }));
  const progressed = exerciseComparisons.filter((comparison) => comparison.status === "progressed");
  const reduced = exerciseComparisons.filter((comparison) => comparison.status === "reduced");
  const maintained = exerciseComparisons.filter((comparison) => comparison.status === "maintained");
  const highlights = [
    ...(progression?.highlights ?? []).slice(0, 3),
    ...(!progressed.length && maintained.length ? [`${maintained.length} exercise${maintained.length === 1 ? "" : "s"} matched the previous session.`] : []),
    ...(!previous ? ["This creates a confirmed baseline for future coached sessions."] : [])
  ].slice(0, 3);
  const watchouts = [
    ...reduced.slice(0, 2).map((comparison) => `${comparison.summary} Check context before progressing next time.`),
    ...current.uncertainties.slice(0, Math.max(0, 2 - reduced.length)).map((uncertainty) => `Confirm next time: ${uncertainty.replace(/[.]$/, "")}.`),
    ...(current.difficulty === "challenging" && progressed.length >= 2 ? ["Several movements progressed in a challenging session; check recovery before the next hard session."] : [])
  ].slice(0, 2);
  const anchor = progressed[0] ?? maintained[0] ?? exerciseComparisons[0];
  const nextSessionStartingPoint = anchor
    ? `Start from the confirmed ${anchor.exerciseName} result and adjust after the client's warm-up and feedback.`
    : "Use this session as the baseline and adjust after the client's warm-up and feedback.";
  const headline = progressed.length
    ? `${progressed.length} verified progression${progressed.length === 1 ? "" : "s"} from the previous session.`
    : previous
      ? maintained.length ? "The session was consistent with the previous performance." : "The session is saved, with limited directly comparable data."
      : "The first coached-session baseline is now established.";
  const clientCelebration = progressed.length
    ? `You progressed ${progressed.length} movement${progressed.length === 1 ? "" : "s"} compared with your last coached session.`
    : maintained.length
      ? "You repeated key work consistently and added another reliable session to your progress."
      : "Your completed session is now part of your training story and ready for future comparison.";

  return { headline, highlights, watchouts, nextSessionStartingPoint, clientCelebration, exerciseComparisons };
}

export function buildTrainerSessionNarratives(
  draft: WorkoutCaptureDraft,
  clientName: string,
  previousDraft: WorkoutCaptureDraft | null = null
): TrainerSessionNarratives {
  const title = sessionTitle(draft);
  const duration = draft.durationMinutes ? `${draft.durationMinutes} minutes` : "the planned session time";
  const exerciseCount = draft.exercises.length;
  const progression = firstProgression(previousDraft, draft);
  const clientRecap = progression
    ? `${clientName} completed ${title} with ${exerciseCount} exercises over ${duration}. ${progression}`
    : `${clientName} completed ${title} with ${exerciseCount} exercises over ${duration}. The full session is saved for future comparison.`;

  const lowerType = `${draft.workoutType} ${draft.title}`.toLowerCase();
  const betweenSessionFocus = /(mobility|recovery|stretch|yoga)/.test(lowerType)
    ? "Keep recovery simple: hydrate well and continue with comfortable movement before the next session."
    : draft.difficulty === "challenging"
      ? "Prioritize hydration, protein and recovery after today's training."
      : "Support today's training with hydration and a protein-rich meal.";

  const trainerNextSessionNote = draft.uncertainties.length
    ? `Review ${draft.uncertainties[0].replace(/[.]$/, "").toLowerCase()} before progressing the next session.`
    : progression
      ? `Use today's confirmed progression as the starting point next time. ${progression}`
      : `Use ${title} as the comparison point for the next coached session.`;

  return { clientRecap, betweenSessionFocus, trainerNextSessionNote };
}

async function findPreviousDraft(clientId: string, excludeSessionId?: string) {
  const completed = await query<{ structured_workout: WorkoutCaptureDraft | null }>(
    `
    select structured_workout
    from trainer_coaching_sessions
    where client_id = $1 and status = 'completed' and ($2::uuid is null or id <> $2)
    order by completed_at desc
    limit 1
    `,
    [clientId, excludeSessionId ?? null]
  );
  if (completed.rows[0]?.structured_workout) return completed.rows[0].structured_workout;

  const workout = await query<{ metadata: Record<string, unknown> | null }>(
    `
    select metadata
    from analytics_events
    where user_id = $1 and event_name = 'burn_log' and jsonb_typeof(metadata->'exercises') = 'array'
    order by created_at desc
    limit 1
    `,
    [clientId]
  );
  return workout.rows[0]?.metadata ? createRepeatWorkoutCaptureDraft(workout.rows[0].metadata) : null;
}

export async function getTrainerSession(sessionId: string, clientId: string, actorUserId: string) {
  const result = await query<SessionRow>(
    `${SESSION_SELECT} where session.id = $1 and session.client_id = $2 and session.created_by_user_id = $3 limit 1`,
    [sessionId, clientId, actorUserId]
  );
  return result.rows[0] ? mapSession(result.rows[0]) : null;
}

export async function getTrainerSessionOverview(clientId: string, actorUserId: string) {
  const [active, recent, previousDraft] = await Promise.all([
    query<SessionRow>(`${SESSION_SELECT} where session.client_id = $1 and session.created_by_user_id = $2 and session.status = 'draft' order by session.updated_at desc limit 1`, [clientId, actorUserId]),
    query<SessionRow>(`${SESSION_SELECT} where session.client_id = $1 and session.status = 'completed' order by session.completed_at desc limit 5`, [clientId]),
    findPreviousDraft(clientId)
  ]);
  return {
    activeSession: active.rows[0] ? mapSession(active.rows[0]) : null,
    recentSessions: recent.rows.map(mapSession),
    previousWorkout: previousDraft
  };
}

export async function startTrainerSession(input: {
  clientId: string;
  actorUserId: string;
  trainerId?: string | null;
  gymId?: string | null;
  mode: TrainerSessionStartMode;
}) {
  const previousDraft = input.mode === "repeat_last" ? await findPreviousDraft(input.clientId) : null;
  const result = await query<{ id: string }>(
    `
    insert into trainer_coaching_sessions (
      client_id, trainer_id, created_by_user_id, gym_id, structured_workout, duration_minutes, raw_input
    ) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (created_by_user_id, client_id) where status = 'draft'
    do update set updated_at = now()
    returning id
    `,
    [input.clientId, input.trainerId ?? null, input.actorUserId, input.gymId ?? null, previousDraft, previousDraft?.durationMinutes ?? null, previousDraft ? trainerSessionDraftText(previousDraft) : ""]
  );
  if (previousDraft) {
    const session = await getTrainerSession(result.rows[0].id, input.clientId, input.actorUserId);
    if (session && !session.narratives) {
      const narratives = buildTrainerSessionNarratives(previousDraft, session.clientName, previousDraft);
      const intelligence = buildTrainerSessionIntelligence(previousDraft, previousDraft);
      await query(
        `update trainer_coaching_sessions set client_recap = $2, between_session_focus = $3, trainer_next_session_note = $4, session_intelligence = $5, updated_at = now() where id = $1 and status = 'draft'`,
        [result.rows[0].id, narratives.clientRecap, narratives.betweenSessionFocus, narratives.trainerNextSessionNote, intelligence]
      );
    }
  }
  return getTrainerSession(result.rows[0].id, input.clientId, input.actorUserId);
}

export async function updateTrainerSessionDraft(input: {
  sessionId: string;
  clientId: string;
  actorUserId: string;
  version: number;
  rawInput: string;
  durationMinutes?: number | null;
  workoutDraft?: WorkoutCaptureDraft | null;
}) {
  const result = await query<SessionRow>(
    `
    update trainer_coaching_sessions session
    set raw_input = $5,
        duration_minutes = $6,
        structured_workout = coalesce($7, structured_workout),
        version = version + 1,
        updated_at = now()
    from users creator, users client
    where session.id = $1 and session.client_id = $2 and session.created_by_user_id = $3
      and session.status = 'draft' and session.version = $4
      and creator.id = session.created_by_user_id and client.id = session.client_id
    returning session.*, creator.full_name as trainer_name, client.full_name as client_name,
      null::text as estimated_calories_burned, null::text as calories_label
    `,
    [input.sessionId, input.clientId, input.actorUserId, input.version, cleanText(input.rawInput, 5_000), input.durationMinutes ?? null, input.workoutDraft ?? null]
  );
  return result.rows[0] ? mapSession(result.rows[0]) : null;
}

export async function interpretTrainerSession(input: {
  sessionId: string;
  clientId: string;
  actorUserId: string;
  actorGymId?: string | null;
  rawInput: string;
  durationMinutes: number;
  sourceMode: "text" | "dictation";
}) {
  const session = await getTrainerSession(input.sessionId, input.clientId, input.actorUserId);
  if (!session || session.status !== "draft") return null;

  const recent = await query<{ metadata: Record<string, unknown> | null }>(
    `select metadata from analytics_events where user_id = $1 and event_name = 'burn_log' and jsonb_typeof(metadata->'exercises') = 'array' order by created_at desc limit 10`,
    [input.clientId]
  );
  const recentExerciseNames = recent.rows.flatMap((row) => {
    const exercises = Array.isArray(row.metadata?.exercises) ? row.metadata.exercises : [];
    return exercises.map((exercise) => exercise && typeof exercise === "object" ? String((exercise as Record<string, unknown>).name ?? "").trim() : "").filter(Boolean);
  });
  const draft = await createWorkoutCaptureDraft({
    text: cleanText(input.rawInput, 2_000),
    sourceMode: input.sourceMode,
    recentExerciseNames,
    userId: input.actorUserId,
    gymId: input.actorGymId ?? null
  });
  if (!draft.durationMinutes) draft.durationMinutes = clamp(Math.round(input.durationMinutes), 5, 300);
  const previous = await findPreviousDraft(input.clientId, input.sessionId);
  const narratives = buildTrainerSessionNarratives(draft, session.clientName, previous);
  const intelligence = buildTrainerSessionIntelligence(draft, previous);
  const weightKg = await resolveWorkoutWeightKg(input.clientId);
  const calories = createWorkoutCompletionSummary({
    workoutTitle: draft.title,
    workoutType: draft.workoutType,
    difficulty: draft.difficulty,
    durationMinutes: draft.durationMinutes,
    exercises: draft.exercises.map((exercise) => ({ ...exercise, duration: exercise.durationMinutes ? `${exercise.durationMinutes} min` : null, rest: exercise.restSeconds !== null ? `${exercise.restSeconds} sec` : null })),
    weightKg
  });

  await query(
    `
    update trainer_coaching_sessions
    set raw_input = $4, duration_minutes = $5, structured_workout = $6,
      client_recap = $7, between_session_focus = $8, trainer_next_session_note = $9,
      ai_confidence = $10, uncertain_fields = $11, session_intelligence = $12,
      version = version + 1, updated_at = now()
    where id = $1 and client_id = $2 and created_by_user_id = $3 and status = 'draft'
    `,
    [input.sessionId, input.clientId, input.actorUserId, cleanText(input.rawInput, 5_000), draft.durationMinutes, draft, narratives.clientRecap, narratives.betweenSessionFocus, narratives.trainerNextSessionNote, draft.confidence, draft.uncertainties, intelligence]
  );

  return { draft, narratives, intelligence, estimatedCaloriesBurned: calories.estimatedCaloriesBurned, caloriesLabel: "Estimated Calories Burned" };
}

export async function completeTrainerSession(input: {
  sessionId: string;
  clientId: string;
  actorUserId: string;
  trainerId?: string | null;
  actorGymId?: string | null;
  draft: WorkoutCaptureDraft;
  narratives: TrainerSessionNarratives;
  completedAt?: string | null;
}) : Promise<{ session: TrainerCoachingSession; completion: PersistedWorkoutCompletion } | null> {
  const session = await getTrainerSession(input.sessionId, input.clientId, input.actorUserId);
  if (!session || session.status === "cancelled") return null;
  const completionKeyResult = await query<{ workout_completion_key: string }>("select workout_completion_key from trainer_coaching_sessions where id = $1", [input.sessionId]);
  const workoutCompletionKey = completionKeyResult.rows[0]?.workout_completion_key;
  if (!workoutCompletionKey) return null;
  const previous = await findPreviousDraft(input.clientId, input.sessionId);
  const intelligence = buildTrainerSessionIntelligence(input.draft, previous);

  const completion = await persistCompletedWorkout({
    userId: input.clientId,
    gymId: input.actorGymId ?? null,
    workoutCompletionKey,
    workoutTitle: sessionTitle(input.draft),
    workoutType: input.draft.workoutType,
    workoutDifficulty: input.draft.difficulty,
    durationMinutes: input.draft.durationMinutes ?? 5,
    completedAt: input.completedAt ?? null,
    exercises: input.draft.exercises.map((exercise) => ({
      name: exercise.name,
      sets: exercise.sets,
      reps: exercise.reps,
      load: exercise.load,
      loadUnit: exercise.loadUnit,
      duration: exercise.durationMinutes ? `${exercise.durationMinutes} min` : null,
      rest: exercise.restSeconds !== null ? `${exercise.restSeconds} sec` : null,
      note: exercise.note,
      movementPattern: exercise.movementPattern,
      confidence: exercise.confidence
    })),
    source: "trainer_logged_session",
    extraMetadata: {
      coachingSessionId: input.sessionId,
      trainerId: input.trainerId ?? null,
      trainerUserId: input.actorUserId,
      trainerName: session.trainerName,
      clientRecap: cleanText(input.narratives.clientRecap, 600),
      betweenSessionFocus: cleanText(input.narratives.betweenSessionFocus, 400),
      sessionIntelligence: intelligence,
      captureVersion: input.draft.version,
      userConfirmed: true
    }
  });

  await query(
    `
    update trainer_coaching_sessions
    set status = 'completed', completed_at = coalesce(session.completed_at, $4, now()), duration_minutes = $5,
      raw_input = '', structured_workout = $6, client_recap = $7,
      between_session_focus = $8, trainer_next_session_note = $9,
      workout_event_id = $10, ai_confidence = $11, uncertain_fields = $12,
      session_intelligence = $13,
      version = version + 1, updated_at = now()
    where id = $1 and client_id = $2 and created_by_user_id = $3 and status in ('draft', 'completed')
    `,
    [input.sessionId, input.clientId, input.actorUserId, input.completedAt ?? null, input.draft.durationMinutes, input.draft, cleanText(input.narratives.clientRecap, 600), cleanText(input.narratives.betweenSessionFocus, 400), cleanText(input.narratives.trainerNextSessionNote, 600), completion.burnLog.id, input.draft.confidence, input.draft.uncertainties, intelligence]
  );
  const completedSession = await getTrainerSession(input.sessionId, input.clientId, input.actorUserId);
  return completedSession ? { session: completedSession, completion } : null;
}

export async function cancelTrainerSession(sessionId: string, clientId: string, actorUserId: string) {
  const result = await query(
    `update trainer_coaching_sessions set status = 'cancelled', raw_input = '', updated_at = now(), version = version + 1 where id = $1 and client_id = $2 and created_by_user_id = $3 and status = 'draft' returning id`,
    [sessionId, clientId, actorUserId]
  );
  return Boolean(result.rowCount);
}

export function toClientCoachedSession(session: TrainerCoachingSession): ClientCoachedSession {
  const draft = session.workoutDraft!;
  return {
    id: session.id,
    trainerName: session.trainerName,
    title: sessionTitle(draft),
    workoutType: draft.workoutType,
    difficulty: draft.difficulty,
    durationMinutes: draft.durationMinutes ?? session.durationMinutes ?? 5,
    estimatedCaloriesBurned: session.estimatedCaloriesBurned ?? 0,
    caloriesLabel: session.caloriesLabel ?? "Estimated Calories Burned",
    exercises: draft.exercises,
    clientRecap: session.narratives?.clientRecap ?? "Your coached workout has been saved.",
    betweenSessionFocus: session.narratives?.betweenSessionFocus ?? "Keep building on today's session.",
    progressHighlights: session.intelligence?.highlights ?? [],
    clientCelebration: session.intelligence?.clientCelebration ?? "Your completed session is now part of your progress.",
    completedAt: session.completedAt!
  };
}

export async function getClientCoachedSessions(clientId: string, limit = 10): Promise<ClientCoachedSession[]> {
  const result = await query<SessionRow>(
    `${SESSION_SELECT} where session.client_id = $1 and session.status = 'completed' order by session.completed_at desc limit $2`,
    [clientId, clamp(Math.round(limit), 1, 25)]
  );
  return result.rows.map(mapSession).map(toClientCoachedSession);
}
