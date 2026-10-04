import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  HEALTH_ACTIVITY_CONSENT_VERSION, estimatedNetActiveCalories, healthDateKey, reconcileDailyActivity,
  type DailyActivitySummary, type HealthActivityConnection, type HealthActivityImport,
  type HealthActivityStatus, type HealthDailySnapshot, type HealthExternalWorkout, type HealthManualActivity
} from "@ascend/shared";
import { env } from "../config/env";
import { pool, query } from "../db/pool";

type Source = {
  id: string; user_id: string; provider: "apple_health" | "health_connect"; installation_id: string;
  generation: string; connected: boolean; selected: boolean; last_sequence: string;
  last_uploaded_at: Date | null; disconnected_at: Date | null;
};
type Settings = { timezone: string; calendar_generation: string };
const iso = (value: unknown) => value ? new Date(String(value)).toISOString() : null;
const connection = (row: Source): HealthActivityConnection => ({
  id: row.id, provider: row.provider, installationId: row.installation_id, generation: row.generation,
  connected: row.connected, selected: row.selected, lastUploadedAt: iso(row.last_uploaded_at), disconnectedAt: iso(row.disconnected_at)
});
export function healthActivityEnabled(userId: string) {
  const cohort = env.APPLE_HEALTH_USER_IDS.split(",").map(value => value.trim()).filter(Boolean);
  return env.APPLE_HEALTH_SYNC_V1 && env.DAILY_ACTIVITY_LEDGER_V1 && (!cohort.length || cohort.includes(userId));
}
export function healthActivityError(message: string, status = 409) {
  return Object.assign(new Error(message), { status });
}
async function transaction<T>(userId: string, action: (db: PoolClient) => Promise<T>) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtextextended($1, 8877))", [userId]);
    const result = await action(db);
    await db.query("commit");
    return result;
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}

export async function getHealthActivityStatus(userId: string): Promise<HealthActivityStatus> {
  const enabled = healthActivityEnabled(userId);
  if (!enabled) return { enabled: false, consentVersion: HEALTH_ACTIVITY_CONSENT_VERSION, timezone: null, calendarGeneration: null, connections: [], summary: null };
  const [settings, sources] = await Promise.all([
    query<Settings>("select timezone, calendar_generation from health_activity_settings where user_id=$1", [userId]),
    query<Source>("select * from health_activity_sources where user_id=$1 order by created_at", [userId])
  ]);
  const config = settings.rows[0];
  const summary = config ? await getDailyHealthActivity(userId, healthDateKey(new Date(), config.timezone)) : null;
  return { enabled, consentVersion: HEALTH_ACTIVITY_CONSENT_VERSION, timezone: config?.timezone ?? null,
    calendarGeneration: config?.calendar_generation ?? null, connections: sources.rows.map(connection), summary };
}

export async function connectHealthActivity(userId: string, input: { installationId: string; timezone: string; consentVersion: string; select: boolean }) {
  return transaction(userId, async db => {
    await db.query("insert into health_activity_settings(user_id,timezone) values($1,$2) on conflict(user_id) do nothing", [userId,input.timezone]);
    const existing = await db.query<Source>("select * from health_activity_sources where user_id=$1 and provider='apple_health' and installation_id=$2", [userId,input.installationId]);
    if (input.select) await db.query("update health_activity_sources set selected=false where user_id=$1", [userId]);
    const selected = await db.query("select id from health_activity_sources where user_id=$1 and selected", [userId]);
    const generation = existing.rows[0]?.connected ? existing.rows[0].generation : randomUUID();
    const row = await db.query<Source>(`
      insert into health_activity_sources(user_id,provider,installation_id,generation,consent_version,selected)
      values($1,'apple_health',$2,$3,$4,$5)
      on conflict(user_id,provider,installation_id) do update set connected=true,
        generation=excluded.generation, consent_version=excluded.consent_version,
        selected=case when $6 then true else health_activity_sources.selected end,
        last_sequence=case when health_activity_sources.generation=excluded.generation then health_activity_sources.last_sequence else -1 end,
        disconnected_at=null returning *`,
      [userId,input.installationId,generation,input.consentVersion,input.select || !selected.rows.length,input.select]);
    const config = await db.query<Settings>("select * from health_activity_settings where user_id=$1", [userId]);
    return { connection: connection(row.rows[0]), timezone: config.rows[0].timezone, calendarGeneration: config.rows[0].calendar_generation };
  });
}

export async function importHealthActivity(userId: string, input: HealthActivityImport) {
  return transaction(userId, async db => {
    const source = (await db.query<Source>("select * from health_activity_sources where user_id=$1 and provider='apple_health' and installation_id=$2 for update", [userId,input.installationId])).rows[0];
    const settings = (await db.query<Settings>("select * from health_activity_settings where user_id=$1", [userId])).rows[0];
    if (!source?.connected || source.generation !== input.connectionGeneration || settings?.calendar_generation !== input.calendarGeneration) {
      throw healthActivityError("This Health connection changed. Reconnect before uploading.");
    }
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const accepted = await db.query<{ payload_hash: string }>("select payload_hash from health_activity_import_requests where source_id=$1 and generation=$2 and request_id=$3", [source.id,source.generation,input.requestId]);
    if (accepted.rows[0]) {
      if (accepted.rows[0].payload_hash !== hash) throw healthActivityError("A retry must contain the original payload.");
      return { accepted: true, duplicate: true, requestId: input.requestId };
    }
    if (input.sequence <= Number(source.last_sequence)) throw healthActivityError("A newer device observation has already been uploaded.");
    for (const snapshot of input.snapshots) {
      if (snapshot.timezone !== settings.timezone) throw healthActivityError("The reporting timezone changed.");
      await db.query(`insert into health_activity_snapshots(source_id,day,timezone,window_start,window_end,observed_at,steps,steps_state,active_calories,energy_state)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict(source_id,day) do update set timezone=excluded.timezone, window_start=excluded.window_start,
          window_end=excluded.window_end, observed_at=case when excluded.energy_state='observed' or health_activity_snapshots.active_calories is null then excluded.observed_at else health_activity_snapshots.observed_at end,
          steps=case when excluded.steps_state='observed' then excluded.steps else health_activity_snapshots.steps end,
          active_calories=case when excluded.energy_state='observed' then excluded.active_calories else health_activity_snapshots.active_calories end,
          steps_state=excluded.steps_state, energy_state=excluded.energy_state
        where health_activity_snapshots.observed_at <= excluded.observed_at`,
        [source.id,snapshot.day,snapshot.timezone,snapshot.windowStart,snapshot.windowEnd,snapshot.observedAt,snapshot.steps,snapshot.stepsState,snapshot.activeCalories,snapshot.energyState]);
    }
    for (const workout of input.workouts) await db.query(`insert into health_activity_workouts(source_id,external_id,start_at,end_at,activity_type,active_calories,source_name)
      values($1,$2,$3,$4,$5,$6,$7) on conflict(source_id,external_id) do update set start_at=excluded.start_at,end_at=excluded.end_at,
      activity_type=excluded.activity_type,active_calories=excluded.active_calories,source_name=excluded.source_name,deleted=false`,
      [source.id,workout.externalId,workout.startAt,workout.endAt,workout.activityType,workout.activeCalories,workout.sourceName]);
    for (const externalId of input.deletedWorkoutIds) {
      await db.query("update health_activity_workouts set deleted=true where source_id=$1 and external_id=$2", [source.id,externalId]);
      // A later exact record also cancels a member's untracked addition when linked.
    }
    await db.query("update health_activity_sources set last_sequence=$2,last_uploaded_at=now() where id=$1", [source.id,input.sequence]);
    await db.query("insert into health_activity_import_requests(source_id,generation,request_id,payload_hash) values($1,$2,$3,$4)", [source.id,source.generation,input.requestId,hash]);
    // Persist each accepted reporting day before source selection can change.
    if (source.selected) {
      const affected = new Set(input.snapshots.map(snapshot => snapshot.day));
      for (const workout of input.workouts) affected.add(healthDateKey(workout.startAt,settings.timezone));
      const deletedDays = await db.query<{ day: string }>("select distinct (start_at at time zone $2)::date::text as day from health_activity_workouts where source_id=$1 and external_id=any($3::text[])", [source.id,settings.timezone,input.deletedWorkoutIds]);
      deletedDays.rows.forEach(row => affected.add(row.day));
      for (const day of affected) await calculateDaily(db,userId,day,settings.timezone,source);
    }
    return { accepted: true, duplicate: false, requestId: input.requestId };
  });
}

async function calculateDaily(db: Pick<PoolClient,"query">, userId: string, day: string, timezone: string, source: Source | null): Promise<DailyActivitySummary> {
  const [snapshots,workouts,manual] = await Promise.all([
    db.query("select * from health_activity_snapshots where source_id=$1 and day=$2", [source?.id ?? null,day]),
    db.query("select * from health_activity_workouts where source_id=$1 and not deleted and (start_at at time zone $3)::date=$2::date", [source?.id ?? null,day,timezone]),
    db.query(`select e.id,e.created_at,e.metadata,l.confirmed_untracked,l.matched_workout_id,l.active_calories as adjustment_calories,
      l.source_id as linked_source_id from analytics_events e left join health_activity_manual_links l on l.activity_id=e.id and l.user_id=e.user_id
      where e.user_id=$1 and e.event_name='burn_log' and (e.created_at at time zone $3)::date=$2::date`, [userId,day,timezone])
  ]);
  const row = snapshots.rows[0];
  const snapshot: HealthDailySnapshot | null = row ? {
    day,timezone,windowStart: iso(row.window_start)!,windowEnd: iso(row.window_end)!,observedAt: iso(row.observed_at)!,
    steps: row.steps === null ? null : Number(row.steps),stepsState: row.steps_state,
    activeCalories: row.active_calories === null ? null : Number(row.active_calories),energyState: row.energy_state
  } : null;
  const external: HealthExternalWorkout[] = workouts.rows.map(row => ({
    externalId: row.external_id,startAt: iso(row.start_at)!,endAt: iso(row.end_at)!,activityType: row.activity_type,
    activeCalories: row.active_calories === null ? null : Number(row.active_calories),sourceName: row.source_name
  }));
  const entries: HealthManualActivity[] = manual.rows.map(row => {
    const metadata = row.metadata ?? {};
    const calculated = estimatedNetActiveCalories(Number(metadata.metValue),Number(metadata.weightKgUsed),Number(metadata.durationMinutes));
    const activeCalories = row.adjustment_calories !== null && row.adjustment_calories !== undefined ? Number(row.adjustment_calories)
      : metadata.calorieBasis === "active" ? Number(metadata.caloriesBurned) : calculated;
    return { id: row.id,label: String(metadata.workoutTitle ?? metadata.activityType ?? "Manual activity"),occurredAt: iso(row.created_at)!,
      activeCalories,legacyCalories: Number(metadata.caloriesBurned ?? 0),untracked: row.confirmed_untracked === true,
      matchedWorkoutId: row.linked_source_id === source?.id ? row.matched_workout_id ?? null : null };
  });
  const summary = reconcileDailyActivity({ day,timezone,provider: source?.provider ?? null,snapshot,workouts: external,manual: entries,
    disconnectedAt: source?.disconnected_at ? iso(source.disconnected_at) : null });
  await db.query(`insert into health_activity_daily_summaries(user_id,day,timezone,source_id,summary) values($1,$2,$3,$4,$5)
    on conflict(user_id,day) do update set timezone=excluded.timezone,source_id=excluded.source_id,summary=excluded.summary,updated_at=now()`,
    [userId,day,timezone,source?.id ?? null,JSON.stringify(summary)]);
  return summary;
}

export async function getDailyHealthActivity(userId: string, day?: string) {
  if (!healthActivityEnabled(userId)) return null;
  return transaction(userId, async db => {
    const settings = (await db.query<Settings>("select * from health_activity_settings where user_id=$1", [userId])).rows[0];
    if (!settings) return null;
    const today = healthDateKey(new Date(),settings.timezone);
    const date = day ?? today;
    const saved = (await db.query<{ source_id: string | null; summary: DailyActivitySummary }>("select source_id,summary from health_activity_daily_summaries where user_id=$1 and day=$2", [userId,date])).rows[0];
    const source = (await db.query<Source>(date < today && saved?.source_id
      ? "select * from health_activity_sources where id=$2 and user_id=$1"
      : "select * from health_activity_sources where user_id=$1 and selected", [userId,...(date < today && saved?.source_id ? [saved.source_id] : [])])).rows[0] ?? null;
    const effectiveSource = source?.disconnected_at && date > healthDateKey(source.disconnected_at,settings.timezone) ? null : source;
    return calculateDaily(db,userId,date,saved?.summary.timezone ?? settings.timezone,effectiveSource);
  });
}

export async function disconnectHealthActivity(userId: string, installationId: string, deleteHistory = false) {
  return transaction(userId, async db => {
    const source = (await db.query<Source>("select * from health_activity_sources where user_id=$1 and installation_id=$2 and provider='apple_health'", [userId,installationId])).rows[0];
    if (!source) return { disconnected: true };
    await db.query("update health_activity_sources set connected=false,disconnected_at=coalesce(disconnected_at,now()),generation=gen_random_uuid(),last_sequence=-1 where id=$1", [source.id]);
    if (deleteHistory) {
      await db.query("delete from health_activity_daily_summaries where user_id=$1 and source_id=$2", [userId,source.id]);
      await db.query("delete from health_activity_manual_links where user_id=$1 and source_id=$2", [userId,source.id]);
      await db.query("delete from health_activity_snapshots where source_id=$1", [source.id]);
      await db.query("delete from health_activity_workouts where source_id=$1", [source.id]);
      await db.query("delete from health_activity_import_requests where source_id=$1", [source.id]);
      await db.query("update health_activity_sources set selected=false where id=$1", [source.id]);
    }
    return { disconnected: true, deleted: deleteHistory };
  });
}

export async function saveHealthManualLink(userId: string, input: { activityId: string; untracked: boolean; activeCalories: number | null; matchedWorkoutId: string | null }) {
  return transaction(userId, async db => {
    const manual = await db.query("select id from analytics_events where id=$1 and user_id=$2 and event_name='burn_log'", [input.activityId,userId]);
    if (!manual.rows.length) throw healthActivityError("Activity not found.",404);
    const source = (await db.query<Source>("select * from health_activity_sources where user_id=$1 and selected", [userId])).rows[0];
    if (input.matchedWorkoutId) {
      const workout = await db.query("select external_id from health_activity_workouts where source_id=$1 and external_id=$2 and not deleted", [source?.id ?? null,input.matchedWorkoutId]);
      if (!workout.rows.length) throw healthActivityError("Workout not found.",404);
    }
    await db.query(`insert into health_activity_manual_links(user_id,activity_id,source_id,matched_workout_id,confirmed_untracked,active_calories)
      values($1,$2,$3,$4,$5,$6) on conflict(user_id,activity_id) do update set source_id=excluded.source_id,
      matched_workout_id=excluded.matched_workout_id,confirmed_untracked=excluded.confirmed_untracked,
      active_calories=excluded.active_calories,confirmed_at=now()`,
      [userId,input.activityId,source?.id ?? null,input.matchedWorkoutId,input.untracked,input.activeCalories]);
    return { saved: true };
  });
}

export async function exportHealthActivity(userId: string) {
  const [sources,snapshots,workouts] = await Promise.all([
    query("select provider,installation_id,connected,selected,last_uploaded_at from health_activity_sources where user_id=$1",[userId]),
    query("select d.* from health_activity_snapshots d join health_activity_sources s on s.id=d.source_id where s.user_id=$1",[userId]),
    query("select w.* from health_activity_workouts w join health_activity_sources s on s.id=w.source_id where s.user_id=$1 and not w.deleted",[userId])
  ]);
  return { schemaVersion: 2,sources: sources.rows,snapshots: snapshots.rows,workouts: workouts.rows };
}
