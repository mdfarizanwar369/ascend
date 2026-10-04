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
  generation: string; connected: boolean; selected: boolean; pending_selection: boolean; last_sequence: string;
  last_uploaded_at: Date | null; disconnected_at: Date | null;
  workout_rebuild_id: string | null; workout_rebuild_since: Date | null;
};
type Settings = { timezone: string; calendar_generation: string };
const iso = (value: unknown) => value ? (value instanceof Date ? value : new Date(String(value))).toISOString() : null;
const connection = (row: Source): HealthActivityConnection => ({
  id: row.id, provider: row.provider, installationId: row.installation_id, generation: row.generation,
  connected: row.connected, selected: row.selected, pendingSelection: row.pending_selection,workoutHistoryRefreshing:Boolean(row.workout_rebuild_id),
  lastUploadedAt: iso(row.last_uploaded_at), disconnectedAt: iso(row.disconnected_at)
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
  const empty: HealthActivityStatus = { enabled,consentVersion:HEALTH_ACTIVITY_CONSENT_VERSION,timezone:null,calendarGeneration:null,connections:[],summary:null };
  if (!enabled) {
    // Old deployments without the additive migration remain compatible. Once
    // history exists, a rollout pause must not remove export/deletion controls.
    const schema = await query<{ ready:boolean }>("select to_regclass('public.health_activity_sources') is not null as ready");
    if (!schema.rows[0]?.ready) return empty;
  }
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
    const selected = await db.query("select id from health_activity_sources where user_id=$1 and selected", [userId]);
    if (input.select) await db.query("update health_activity_sources set pending_selection=false where user_id=$1", [userId]);
    const selectNow = !selected.rows.length || selected.rows[0].id === existing.rows[0]?.id;
    const generation = existing.rows[0]?.connected ? existing.rows[0].generation : randomUUID();
    const row = await db.query<Source>(`
      insert into health_activity_sources(user_id,provider,installation_id,generation,consent_version,selected,pending_selection)
      values($1,'apple_health',$2,$3,$4,$5,$6)
      on conflict(user_id,provider,installation_id) do update set connected=true,
        generation=excluded.generation, consent_version=excluded.consent_version,
        selected=excluded.selected, pending_selection=excluded.pending_selection,
        last_sequence=case when health_activity_sources.generation=excluded.generation then health_activity_sources.last_sequence else -1 end,
        workout_rebuild_id=case when health_activity_sources.generation=excluded.generation then health_activity_sources.workout_rebuild_id else null end,
        workout_rebuild_since=case when health_activity_sources.generation=excluded.generation then health_activity_sources.workout_rebuild_since else null end,
        disconnected_at=null returning *`,
      [userId,input.installationId,generation,input.consentVersion,selectNow,input.select && !selectNow]);
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
    const resetDays = new Set<string>();
    const changedIds = [...input.workouts.map(workout => workout.externalId),...input.deletedWorkoutIds];
    const oldDays = await db.query<{ day:string }>(`select distinct d.day::text as day from health_activity_workouts w
      join health_activity_daily_summaries d on d.source_id=w.source_id and d.user_id=$1
        and (w.start_at at time zone d.timezone)::date=d.day
      where w.source_id=$2 and (w.external_id=any($3::text[]) or ($4::timestamptz is not null and w.start_at>=$4))`,[userId,source.id,changedIds,input.workoutRebuild?.complete ? input.workoutRebuild.since : null]);
    oldDays.rows.forEach(row => resetDays.add(row.day));
    const rebuild = input.workoutRebuild;
    if (rebuild) {
      if (source.workout_rebuild_id === rebuild.id && iso(source.workout_rebuild_since) !== iso(rebuild.since)) throw healthActivityError("A workout rebuild must preserve its original interval.");
      // A newer immutable stream may supersede an interrupted rebuild. Existing
      // workouts are retained until all its pages have been acknowledged.
      await db.query("update health_activity_sources set workout_rebuild_id=$2,workout_rebuild_since=$3 where id=$1",[source.id,rebuild.id,rebuild.since]);
    }
    for (const snapshot of input.snapshots) {
      if (snapshot.timezone !== settings.timezone) throw healthActivityError("The reporting timezone changed.");
      const savedDay = (await db.query<{ timezone:string }>("select timezone from health_activity_daily_summaries where user_id=$1 and day=$2",[userId,snapshot.day])).rows[0];
      if (snapshot.day < healthDateKey(new Date(),settings.timezone) && savedDay && savedDay.timezone !== snapshot.timezone) continue;
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
    for (const workout of input.workouts) await db.query(`insert into health_activity_workouts(source_id,external_id,start_at,end_at,activity_type,active_calories,source_name,last_seen_rebuild_id)
      values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(source_id,external_id) do update set start_at=excluded.start_at,end_at=excluded.end_at,
      activity_type=excluded.activity_type,active_calories=excluded.active_calories,source_name=excluded.source_name,deleted=false,
      last_seen_rebuild_id=coalesce(excluded.last_seen_rebuild_id,health_activity_workouts.last_seen_rebuild_id)`,
      [source.id,workout.externalId,workout.startAt,workout.endAt,workout.activityType,workout.activeCalories,workout.sourceName,rebuild?.id ?? null]);
    for (const externalId of input.deletedWorkoutIds) {
      await db.query("update health_activity_workouts set deleted=true where source_id=$1 and external_id=$2", [source.id,externalId]);
      // A later exact record also cancels a member's untracked addition when linked.
    }
    if (rebuild?.complete) {
      const existing = await db.query<{ day:string }>("select distinct (start_at at time zone $3)::date::text as day from health_activity_workouts where source_id=$1 and start_at>=$2",[source.id,rebuild.since,settings.timezone]);
      existing.rows.forEach(row => resetDays.add(row.day));
      await db.query("update health_activity_workouts set deleted=true where source_id=$1 and start_at>=$2 and last_seen_rebuild_id is distinct from $3::uuid",[source.id,rebuild.since,rebuild.id]);
      await db.query("update health_activity_sources set workout_rebuild_id=null,workout_rebuild_since=null where id=$1",[source.id]);
    }
    await db.query("update health_activity_sources set last_sequence=$2,last_uploaded_at=now() where id=$1", [source.id,input.sequence]);
    await db.query("insert into health_activity_import_requests(source_id,generation,request_id,payload_hash) values($1,$2,$3,$4)", [source.id,source.generation,input.requestId,hash]);
    const today = healthDateKey(new Date(),settings.timezone);
    // Keep the old reader until a usable full-day energy observation from the
    // requested reader arrives. Never add either reader's totals together.
    if (source.pending_selection && input.snapshots.some(snapshot => snapshot.day === today && snapshot.energyState === "observed")) {
      await db.query("update health_activity_sources set selected=false where user_id=$1", [userId]);
      await db.query("update health_activity_sources set selected=true,pending_selection=false where id=$1", [source.id]);
      source.selected = true;
    }
    {
      const affected = new Set(input.snapshots.map(snapshot => snapshot.day));
      resetDays.forEach(day => affected.add(day));
      for (const workout of input.workouts) affected.add(healthDateKey(workout.startAt,settings.timezone));
      const deletedDays = await db.query<{ day: string }>("select distinct (start_at at time zone $2)::date::text as day from health_activity_workouts where source_id=$1 and external_id=any($3::text[])", [source.id,settings.timezone,input.deletedWorkoutIds]);
      deletedDays.rows.forEach(row => affected.add(row.day));
      for (const day of affected) {
        const saved = (await db.query<{ source_id:string | null; timezone:string }>("select source_id,timezone from health_activity_daily_summaries where user_id=$1 and day=$2",[userId,day])).rows[0];
        // Corrections stay with the historical owner; switching today's reader
        // does not replace previously saved days with another phone's backfill.
        if ((day < today && saved?.source_id === source.id) || (source.selected && (day >= today || !saved))) {
          await calculateDaily(db,userId,day,day < today && saved ? saved.timezone : settings.timezone,source);
        }
      }
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
  const row = snapshots.rows.find(row => row.timezone === timezone);
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
      startedAt: metadata.actualStartedAt ? iso(metadata.actualStartedAt) : null,
      activeCalories,legacyCalories: Number(metadata.caloriesBurned ?? 0),untracked: row.confirmed_untracked === true && row.linked_source_id === source?.id,
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
    const source = date < today && saved && !saved.source_id ? null : (await db.query<Source>(date < today && saved?.source_id
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
    await db.query("update health_activity_sources set connected=false,pending_selection=false,workout_rebuild_id=null,workout_rebuild_since=null,disconnected_at=coalesce(disconnected_at,now()),generation=gen_random_uuid(),last_sequence=-1 where id=$1", [source.id]);
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
  const [sources,snapshots,workouts,manualLinks,summaries] = await Promise.all([
    query("select provider,installation_id,connected,selected,consent_version,created_at,disconnected_at,last_uploaded_at from health_activity_sources where user_id=$1",[userId]),
    query("select d.* from health_activity_snapshots d join health_activity_sources s on s.id=d.source_id where s.user_id=$1",[userId]),
    query("select w.* from health_activity_workouts w join health_activity_sources s on s.id=w.source_id where s.user_id=$1 and not w.deleted",[userId]),
    query("select * from health_activity_manual_links where user_id=$1",[userId]),
    query("select day,timezone,summary from health_activity_daily_summaries where user_id=$1",[userId])
  ]);
  return { schemaVersion: 2,sources: sources.rows,snapshots: snapshots.rows,workouts: workouts.rows,manualLinks:manualLinks.rows,summaries:summaries.rows };
}

export async function selectHealthActivitySource(userId: string, installationId: string) {
  return transaction(userId,async db => {
    const source = (await db.query<Source>("select * from health_activity_sources where user_id=$1 and provider='apple_health' and installation_id=$2 and connected",[userId,installationId])).rows[0];
    if (!source) throw healthActivityError("Connect this device before selecting it.",404);
    await db.query("update health_activity_sources set pending_selection=false where user_id=$1",[userId]);
    await db.query("update health_activity_sources set pending_selection=not selected where id=$1",[source.id]);
    return { requested:true };
  });
}

export async function getPrivateHealthActivityDays(userId: string) {
  if (!healthActivityEnabled(userId)) return [];
  const settings = (await query<Settings>("select * from health_activity_settings where user_id=$1",[userId])).rows[0];
  if (!settings) return [];
  const today = healthDateKey(new Date(),settings.timezone);
  const dates = Array.from({ length:7 },(_,index) => {
    const value = new Date(`${today}T12:00:00Z`); value.setUTCDate(value.getUTCDate()-6+index);
    return value.toISOString().slice(0,10);
  });
  const days: DailyActivitySummary[] = [];
  for (const day of dates) {
    const result = await getDailyHealthActivity(userId,day);
    if (result) days.push(result);
  }
  return days;
}

export async function getHealthWorkoutHistory(userId: string, day: string, after?: string) {
  if (!healthActivityEnabled(userId)) return { workouts:[],nextCursor:null,timezone:null };
  const summary = await getDailyHealthActivity(userId,day);
  if (!summary) return { workouts:[],nextCursor:null,timezone:null };
  const rows = await query(`select w.* from health_activity_workouts w
    join health_activity_daily_summaries d on d.source_id=w.source_id and d.user_id=$1 and d.day=$2::date
    where not w.deleted and (w.start_at at time zone d.timezone)::date=d.day
      and ($3::text is null or w.external_id>$3) order by w.external_id limit 101`,[userId,day,after ?? null]);
  const workouts: HealthExternalWorkout[] = rows.rows.slice(0,100).map(row => ({ externalId:row.external_id,startAt:iso(row.start_at)!,
    endAt:iso(row.end_at)!,activityType:row.activity_type,activeCalories:row.active_calories===null ? null : Number(row.active_calories),sourceName:row.source_name }));
  return { workouts,nextCursor:rows.rows.length>100 ? workouts.at(-1)!.externalId : null,timezone:summary.timezone };
}

export async function changeHealthReportingTimezone(userId: string, timezone: string, calendarGeneration: string) {
  return transaction(userId,async db => {
    const current = (await db.query<Settings>("select * from health_activity_settings where user_id=$1",[userId])).rows[0];
    if (!current || current.calendar_generation !== calendarGeneration) throw healthActivityError("The reporting calendar changed. Sync and try again.");
    if (current.timezone !== timezone) await db.query("update health_activity_settings set timezone=$2,calendar_generation=gen_random_uuid(),updated_at=now() where user_id=$1",[userId,timezone]);
    return { saved:true };
  });
}
