import { randomUUID } from "node:crypto";
import type { BeginnerProgrammePrescription, BeginnerProgrammeSetup, BeginnerProgrammeStage, BeginnerProgrammeSummary } from "@ascend/shared";
import { pool, query, withQueryClient } from "../db/pool";
import { env } from "../config/env";
import type { CoachWorkoutPlan } from "../integrations/openai";
import { assertAiWorkOwnership, withAiWorkLease, withAiWorkTransaction } from "./aiWorkLeaseService";
import { localDayStartUtc } from "./memberTimeService";
import { fillMissingWorkoutSwaps, rotateWorkoutExercise } from "./workoutPlanQualityService";

type ProgrammeWorkout = CoachWorkoutPlan & { beginnerProgramme?: BeginnerProgrammePrescription };
type ProgrammeRow = {
  id: string; user_id: string; status: BeginnerProgrammeSummary["status"];
  last_setup: BeginnerProgrammeSetup | null;
};
type AttemptRow = {
  completion_key: string; programme_id: string; user_id: string; session_number: number; session_kind: "A" | "B";
  request: BeginnerProgrammeSetup; workout: ProgrammeWorkout; outcome: string; qualifies: boolean;
  burn_log_id: string | null; generated_at: Date | string; closed_at: Date | string | null;
  event_id?: string | null; event_metadata?: Record<string, unknown> | null; event_created_at?: string | Date | null;
};

const leaseKey = (userId: string) => `ios-daily-workout:${userId}`;
const fail = (message: string, status = 409) => Object.assign(new Error(message), { status });

async function transaction<T>(work: () => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await assertAiWorkOwnership(client);
    const result = await withQueryClient(client, work);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export function beginnerProgrammeStage(completedSessions: number): { stage: BeginnerProgrammeStage; stageLabel: string } {
  const completed = Math.max(0, Math.floor(completedSessions));
  return completed < 3 ? { stage: "foundation", stageLabel: "Getting comfortable" }
    : completed < 8 ? { stage: "consistency", stageLabel: "Building your routine" }
      : { stage: "progress", stageLabel: "Building gradually" };
}

export function beginnerProgrammeCompletionQualifies(workout: ProgrammeWorkout, metadata: Record<string, unknown>): boolean {
  const prescription = workout.beginnerProgramme;
  if (!prescription || prescription.supplementary || !prescription.coreExerciseIndexes.length) return false;
  const core = prescription.coreExerciseIndexes;
  if (core.some(index => !Number.isInteger(index) || index < 0 || index >= workout.exercises.length)) return false;
  const reported = metadata.completedExerciseIndexes;
  // The completion route validates and normalizes the account-owned exercise list.
  // Explicit partial metadata must never be treated as full completion.
  if (!Array.isArray(reported)) return metadata.completionStatus !== "partial";
  const completed = new Set(reported.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < workout.exercises.length));
  return core.every(index => completed.has(index));
}

const attemptsWithEvent = `select s.*, e.id as event_id, e.metadata as event_metadata, e.created_at as event_created_at
  from zoe_beginner_programme_sessions s
  left join lateral (
    select id, metadata, created_at from analytics_events
    where user_id=s.user_id and event_name='burn_log'
      and metadata->>'workoutCompletionKey'=s.completion_key::text
      and metadata->>'source' in ('coach_zoe_workout_planner','coach_zoe_workout_observed')
    order by created_at, id limit 1
  ) e on true`;

async function reconcileAttempts(userId: string) {
  const saved = await query<AttemptRow>(`${attemptsWithEvent}
    where s.user_id=$1 and s.outcome <> 'dismissed'
      and e.id is not null and (s.burn_log_id is distinct from e.id or s.outcome='open')`, [userId]);
  for (const attempt of saved.rows) {
    const metadata = attempt.event_metadata ?? {};
    const supplementary = attempt.workout.beginnerProgramme?.supplementary === true;
    const qualifies = beginnerProgrammeCompletionQualifies(attempt.workout, metadata);
    const outcome = supplementary ? "recovery" : qualifies ? "completed" : "partial";
    await query(`update zoe_beginner_programme_sessions set burn_log_id=$3, qualifies=$4,
      outcome=$5, closed_at=$6 where user_id=$1 and completion_key=$2 and outcome <> 'dismissed'`,
    [userId, attempt.completion_key, attempt.event_id, qualifies, outcome, attempt.event_created_at]);
  }
}

async function programmeRow(userId: string, lock = false) {
  const result = await query<ProgrammeRow>(`select id,user_id,status,last_setup from zoe_beginner_programmes
    where user_id=$1 order by created_at desc,id desc limit 1${lock ? " for update" : ""}`, [userId]);
  return result.rows[0] ?? null;
}

async function summaryFor(row: ProgrammeRow): Promise<BeginnerProgrammeSummary> {
  const completed = await query<{ count: string; latest: string | null }>(`select count(*)::text as count,max(e.created_at)::text as latest
    from zoe_beginner_programme_sessions s join analytics_events e on e.id=s.burn_log_id and e.user_id=s.user_id and e.event_name='burn_log'
    where s.user_id=$1 and s.programme_id=$2 and s.qualifies=true and s.outcome='completed'`, [row.user_id, row.id]);
  const completedSessions = Number(completed.rows[0]?.count ?? 0);
  const nextSessionKind = completedSessions % 2 === 0 ? "A" : "B";
  const anchors = await query<{ workout: ProgrammeWorkout }>(`select s.workout from zoe_beginner_programme_sessions s
    join analytics_events e on e.id=s.burn_log_id and e.user_id=s.user_id and e.event_name='burn_log'
    where s.user_id=$1 and s.programme_id=$2 and s.qualifies=true and s.session_kind=$3
      and s.request->>'location'=$4 and s.request->>'equipment'=$5
    order by e.created_at desc limit 1`, [row.user_id, row.id, nextSessionKind, row.last_setup?.location ?? "", row.last_setup?.equipment ?? ""]);
  const anchorWorkout = anchors.rows[0]?.workout;
  const anchorExercises = anchorWorkout?.beginnerProgramme?.coreExerciseIndexes
    .map(index => anchorWorkout.exercises[index]?.name).filter((name): name is string => Boolean(name)) ?? [];
  const stage = beginnerProgrammeStage(completedSessions);
  return {
    id: row.id, status: row.status, completedSessions, nextSessionNumber: completedSessions + 1,
    ...stage, nextSessionKind,
    note: completedSessions === 0 ? "Start with a comfortable full-body session. Your routine moves forward when you complete its main movements."
      : "Keep the main movements familiar and build from what you actually completed. Missed days do not reset your routine.",
    lastSetup: row.last_setup, anchorExercises, lastCompletedAt: completed.rows[0]?.latest ?? null
  };
}

export async function getBeginnerProgramme(userId: string): Promise<BeginnerProgrammeSummary | null> {
  await reconcileAttempts(userId);
  const row = await programmeRow(userId);
  return row ? summaryFor(row) : null;
}

export async function setBeginnerProgrammeStatus(userId: string, action: "start" | "pause" | "resume" | "leave") {
  return withAiWorkLease(leaseKey(userId), () => transaction(async () => {
    // Also serializes the first enrollment when no programme row exists yet.
    await query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`beginner-programme:${userId}`]);
    let row = await programmeRow(userId, true);
    if (action === "start") {
      if (!row || row.status === "ended") {
        const created = await query<ProgrammeRow>(`insert into zoe_beginner_programmes (user_id) values ($1)
          returning id,user_id,status,last_setup`, [userId]);
        row = created.rows[0];
      }
    } else {
      if (!row || row.status === "ended") throw fail("Start a simple routine with Zoe first.", 404);
      const status = action === "pause" ? "paused" : action === "resume" ? "active" : "ended";
      const changed = await query<ProgrammeRow>(`update zoe_beginner_programmes set status=$3,updated_at=now()
        where user_id=$1 and id=$2 returning id,user_id,status,last_setup`, [userId, row.id, status]);
      row = changed.rows[0];
    }
    if (!row) throw fail("Could not start your routine. Please try again.", 503);
    await reconcileAttempts(userId);
    return summaryFor(row);
  }));
}

function dailyWorkout(attempt: AttemptRow) {
  const workout = fillMissingWorkoutSwaps(attempt.workout, attempt.request) as ProgrammeWorkout;
  const generated = new Date(attempt.generated_at);
  const reported = attempt.event_metadata?.completedExerciseIndexes;
  return {
    workoutCompletionKey: attempt.completion_key, request: attempt.request, workout,
    // Draft expiry is a browser-storage bound, never a programme deadline.
    resetsAt: new Date(Math.max(generated.getTime() + 30 * 86_400_000, Date.now() + 86_400_000)).toISOString(),
    completed: Boolean(attempt.event_id), dismissed: attempt.outcome === "dismissed",
    completedExerciseIndexes: Array.isArray(reported)
      ? reported.filter((index): index is number => Number.isInteger(index) && index >= 0 && index < workout.exercises.length)
      : null
  };
}

async function visibleAttempt(userId: string, now: Date, timezoneOffsetMinutes: number) {
  const result = await query<AttemptRow>(`${attemptsWithEvent}
    where s.user_id=$1 and (s.outcome='open' or coalesce(s.closed_at,s.generated_at)>=$2)
    order by (s.outcome='open') desc,s.generated_at desc limit 1`,
  [userId, localDayStartUtc(timezoneOffsetMinutes, now).toISOString()]);
  return result.rows[0] ?? null;
}

export async function getBeginnerProgrammeWorkout(userId: string, now = new Date(), timezoneOffsetMinutes = 0) {
  await reconcileAttempts(userId);
  const attempt = await visibleAttempt(userId, now, timezoneOffsetMinutes);
  return attempt ? dailyWorkout(attempt) : null;
}

export async function getBeginnerProgrammeWorkoutForCompletion(userId: string, completionKey: string) {
  const result = await query<AttemptRow>(`${attemptsWithEvent} where s.user_id=$1 and s.completion_key=$2`, [userId, completionKey]);
  return result.rows[0] ? dailyWorkout(result.rows[0]) : null;
}

function prescriptionFor(summary: BeginnerProgrammeSummary, workout: ProgrammeWorkout, request: BeginnerProgrammeSetup): BeginnerProgrammePrescription {
  const provided = workout.beginnerProgramme;
  const core = provided?.coreExerciseIndexes?.filter(index => Number.isInteger(index) && index >= 0 && index < workout.exercises.length);
  const fallbackCore = workout.exercises.flatMap((exercise, index) => exercise.reps
    && !/walk|jog|run|stretch|circle|breath|march|bike|cycle|elliptical|rowing/i.test(exercise.name) ? [index] : []).slice(0, 3);
  const coreExerciseIndexes = [...new Set(core?.length ? core : fallbackCore)];
  const supplementary = provided?.supplementary === true || ["recovery", "mobility"].includes(request.goal)
    || /recovery|mobility/i.test(workout.focus) || coreExerciseIndexes.length === 0;
  return {
    programmeId: summary.id, sessionNumber: summary.nextSessionNumber, sessionKind: summary.nextSessionKind,
    stage: summary.stage, stageLabel: summary.stageLabel, note: provided?.note || summary.note,
    coreExerciseIndexes, supplementary
  };
}

export async function generateBeginnerProgrammeWorkout(input: {
  userId: string; gymId?: string | null; request: BeginnerProgrammeSetup; timezoneOffsetMinutes: number;
  generate: (summary: BeginnerProgrammeSummary) => Promise<CoachWorkoutPlan>; recordUsage?: boolean;
}, now = new Date()) {
  return withAiWorkLease(leaseKey(input.userId), async () => {
    const prepared = await transaction(async () => {
      await reconcileAttempts(input.userId);
      const existing = await visibleAttempt(input.userId, now, input.timezoneOffsetMinutes);
      if (existing) return { existing };
      const row = await programmeRow(input.userId, true);
      if (!row || row.status !== "active") throw fail("Resume your routine or choose a one-off workout.");
      // Use the selected setting to retrieve comparable anchors, not stale equipment.
      return { summary: await summaryFor({ ...row, last_setup: input.request }) };
    });
    if (prepared.existing) return dailyWorkout(prepared.existing);
    const summary = prepared.summary!;
    const generated = await input.generate(summary) as ProgrammeWorkout;
    const workout: ProgrammeWorkout = { ...generated, beginnerProgramme: prescriptionFor(summary, generated, input.request) };
    const completionKey = randomUUID();
    return transaction(async () => {
      const row = await programmeRow(input.userId, true);
      if (!row || row.id !== summary.id || row.status !== "active") throw fail("Your routine changed. Open it again before generating.");
      const saved = await query<AttemptRow>(`insert into zoe_beginner_programme_sessions
        (completion_key,programme_id,user_id,session_number,session_kind,request,workout,generated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
      [completionKey, row.id, input.userId, summary.nextSessionNumber, summary.nextSessionKind, input.request, workout, now.toISOString()]);
      await query("update zoe_beginner_programmes set last_setup=$3,updated_at=now() where user_id=$1 and id=$2", [input.userId, row.id, input.request]);
      if (input.recordUsage !== false) await query(`insert into ai_usage_events
        (user_id,gym_id,event_type,provider,model,status,estimated_cost_cents,metadata)
        values ($1,$2,'ai_chat_message',$3,$4,'success',$5,$6)`,
      [input.userId, input.gymId ?? null, env.AI_PROVIDER, env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        env.AI_CHAT_ESTIMATED_COST_CENTS, { feature: "coach_zoe_workout_planner", mode: "workout", edition: "ios", programmeVersion: 1 }]);
      return dailyWorkout(saved.rows[0]);
    });
  });
}

export async function dismissBeginnerProgrammeWorkout(userId: string, completionKey: string) {
  return withAiWorkLease(leaseKey(userId), () => transaction(async () => {
    await reconcileAttempts(userId);
    const owned = await query<AttemptRow>(`${attemptsWithEvent} where s.user_id=$1 and s.completion_key=$2`, [userId, completionKey]);
    const attempt = owned.rows[0];
    if (!attempt) throw fail("This workout is no longer available.", 404);
    if (attempt.event_id) throw fail("A completed workout cannot be dismissed.");
    await query("update zoe_beginner_programme_sessions set outcome='dismissed',closed_at=now() where user_id=$1 and completion_key=$2", [userId, completionKey]);
    return { dismissed: true };
  }));
}

export async function swapBeginnerProgrammeWorkoutExercise(userId: string, completionKey: string, exerciseIndex: number) {
  return withAiWorkLease(leaseKey(userId), () => transaction(async () => {
    const owned = await query<AttemptRow>(`${attemptsWithEvent} where s.user_id=$1 and s.completion_key=$2`, [userId, completionKey]);
    const attempt = owned.rows[0];
    if (!attempt) throw fail("This workout is no longer available.", 404);
    if (attempt.event_id || attempt.outcome !== "open") throw fail("This workout is already saved or dismissed.");
    const rotated = rotateWorkoutExercise(fillMissingWorkoutSwaps(attempt.workout, attempt.request), exerciseIndex) as ProgrammeWorkout | null;
    if (!rotated) throw fail("No suitable swap is available for that exercise.", 400);
    const workout = { ...rotated, beginnerProgramme: attempt.workout.beginnerProgramme };
    await query("update zoe_beginner_programme_sessions set workout=$3 where user_id=$1 and completion_key=$2", [userId, completionKey, workout]);
    return dailyWorkout({ ...attempt, workout });
  }));
}

function completionPlanSignature(workout: ProgrammeWorkout) {
  const prescription = workout.beginnerProgramme;
  // JSONB changes object-key order and read-time swap filling adds alternatives.
  // Compare only the canonical prescription and fields used by completion.
  return JSON.stringify({
    title: workout.title, focus: workout.focus, intensity: workout.intensity,
    estimatedDurationMinutes: workout.estimatedDurationMinutes, experienceVersion: workout.experienceVersion ?? null,
    exercises: workout.exercises.map(exercise => ({ name: exercise.name, sets: exercise.sets ?? null,
      reps: exercise.reps ?? null, duration: exercise.duration ?? null, rest: exercise.rest ?? null })),
    prescription: prescription ? { programmeId: prescription.programmeId, sessionNumber: prescription.sessionNumber,
      sessionKind: prescription.sessionKind, stage: prescription.stage,
      coreExerciseIndexes: prescription.coreExerciseIndexes, supplementary: prescription.supplementary } : null
  });
}

export async function withBeginnerProgrammeCompletion<T>(userId: string, completionKey: string, save: () => Promise<T>, expectedWorkout?: CoachWorkoutPlan): Promise<T> {
  return withAiWorkLease(leaseKey(userId), () => withAiWorkTransaction(async () => {
    const owned = await query<AttemptRow>(`${attemptsWithEvent} where s.user_id=$1 and s.completion_key=$2`, [userId, completionKey]);
    if (!owned.rows[0]) throw fail("This workout is no longer available.", 404);
    if (owned.rows[0].outcome === "dismissed") throw fail("This workout was dismissed and cannot be saved.");
    if (expectedWorkout && completionPlanSignature(owned.rows[0].workout) !== completionPlanSignature(expectedWorkout)) {
      throw fail("This workout changed. Reopen it in Zoe before saving.");
    }
    const result = await save();
    await reconcileAttempts(userId);
    return result;
  }));
}
