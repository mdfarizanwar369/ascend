import { randomUUID } from "node:crypto";
import { QueryResultRow } from "pg";
import { comebackAttempt, defaultNudgePreferences, isPriorityNudge, isRoutineNudge, NudgeCategory, NudgePreferences, nudgeDatePlus,
  nudgeLocalParts, nudgePriority, nudgeSuppression, nudgeTemplates, nudgeUuid, nudgeWallTime, priorityReservationReason,
  recordedWorkoutMilestone, safeNotificationHref, NudgeReservation, UpcomingPriorityNudge } from "@ascend/shared";
import { pool, query, withQueryClient } from "../db/pool";
import { NudgePushDevice, NudgePushPayload, NudgePushResult, providerReady, sendNudgePush } from "../integrations/nudgePush";
import { availableNudgeCategories, nudgePreferencesSchema, nudgesAvailable, nudgesSchemaEnabled } from "./smartNudgePolicy";

type PreferenceRow = QueryResultRow & { user_id: string; settings: NudgePreferences; version: number; consented_at: Date | null; last_app_open_at: Date;
  comeback_anchor: Date | null; comeback_attempts: number; last_comeback_at: Date | null };
type EventRow = QueryResultRow & { id: string; user_id: string; nudge_category: NudgeCategory; scheduled_for: Date; expires_at: Date;
  preference_version: number; local_day: string; context: { scheduleId?: string; scheduleVersion?: number; anchor?: string; milestone?: number };
  status: string; dispatch_started_at: Date | null; title: string; body: string; href: string };
export type WorkoutSchedule = { id: string; title: string; starts_at: Date; lead_minutes: number; status: "planned" | "completed" | "cancelled"; version: number };
export class NudgeRequestError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Short transactions only: no provider/network call holds a pool connection. */
async function userTransaction<T>(userId: string, work: () => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 4601))", [userId]);
    const result = await withQueryClient(client, work);
    await client.query("commit"); return result;
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}
async function transition(eventId: string, state: string, reason: string | null = null) {
  await query("insert into notification_transitions(event_id,state,reason) values($1,$2,$3)", [eventId, state, reason]);
}
async function suppress(event: EventRow, reason: string) {
  await query("update notification_events set status='suppressed',error=$2 where id=$1", [event.id, reason]);
  await query("update notification_deliveries set status='suppressed',result_code=$2,updated_at=now() where event_id=$1 and status in ('queued','retry')", [event.id, reason]);
  await transition(event.id, "suppressed", reason);
}
export async function getNudgePreferences(userId: string) {
  const row = nudgesSchemaEnabled() ? (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0] : undefined;
  return { available: nudgesAvailable(userId), categories: availableNudgeCategories(userId), preferences: row?.settings ?? defaultNudgePreferences(), version: row?.version ?? 0 };
}
export async function saveNudgePreferences(userId: string, settings: NudgePreferences, expectedVersion: number, now = new Date()) {
  nudgePreferencesSchema.parse(settings);
  if (!nudgesSchemaEnabled()) throw new NudgeRequestError(503, "Reminders are not available yet.");
  if (settings.enabled && !nudgesAvailable(userId)) throw new NudgeRequestError(403, "Reminders are paused for this account. You can still turn them off.");
  return userTransaction(userId, async () => {
    const old = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0];
    if ((old?.version ?? 0) !== expectedVersion) throw new NudgeRequestError(409, "Settings changed on another device. Reload before saving.");
    // Re-consent starts a fresh absence baseline; master OFF remains durable.
    await query(`insert into notification_preferences(user_id,settings,consented_at,last_app_open_at,next_plan_at)
      values($1,$2,case when $3 then $4::timestamptz else null end,$4,$4)
      on conflict(user_id) do update set settings=excluded.settings,version=notification_preferences.version+1,
      consented_at=case when $3 and notification_preferences.settings->>'enabled'<>'true' then $4 else notification_preferences.consented_at end,
      last_app_open_at=$4,next_plan_at=$4,updated_at=$4`, [userId, settings, settings.enabled, now]);
    const cancelled = await query<{ id: string }>(`update notification_events set status='suppressed',error='preferences_changed'
      where user_id=$1 and nudge_category is not null and status in ('scheduled','retry') returning id`, [userId]);
    if (cancelled.rows.length) await query("update notification_deliveries set status='suppressed',result_code='preferences_changed',updated_at=$2 where event_id=any($1::uuid[]) and status in ('queued','retry')", [cancelled.rows.map(e=>e.id), now]);
    for (const event of cancelled.rows) await transition(event.id, "suppressed", "preferences_changed");
    return getNudgePreferences(userId);
  });
}
export async function recordNudgeAppOpen(userId: string, now = new Date()) {
  if (!nudgesSchemaEnabled()) return;
  await query("update notification_preferences set last_app_open_at=$2,next_plan_at=least(next_plan_at,$2) where user_id=$1", [userId, now]);
}
/** An associated recorded action is not evidence that a nudge caused it. */
export async function recordNudgeAction(userId: string, category: NudgeCategory, occurredAt: Date, now = new Date()) {
  if (!nudgesSchemaEnabled()) return;
  await recordNudgeAppOpen(userId, now);
  if (category === "workout") return; // Only a specifically linked session earns workout action attribution.
  const row = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0];
  if (!row || !row.settings.enabled || !row.settings.categories[category].enabled) return;
  const date = nudgeLocalParts(occurredAt, row.settings.timezone).date;
  const events = await query<{ id: string }>(`update notification_events set action_completed_at=$4 where user_id=$1 and nudge_category=$2
    and dispatch_started_at is not null and dispatch_started_at<=$4 and dispatch_started_at>$4::timestamptz-interval '24 hours'
    and (scheduled_for at time zone $5)::date=$3::date and action_completed_at is null returning id`, [userId, category, date, now, row.settings.timezone]);
  for (const event of events.rows) await transition(event.id, "action_completed", "associated_recorded_action");
}
export async function listWorkoutSchedule(userId: string) {
  if (!nudgesSchemaEnabled()) return [];
  return (await query<WorkoutSchedule & QueryResultRow>(`select id,title,starts_at,lead_minutes,status,version from notification_workout_schedule
    where user_id=$1 and starts_at>now()-interval '30 days' order by starts_at limit 100`, [userId])).rows;
}
export async function saveWorkoutSchedule(userId: string, input: { id?: string; title: string; startsAt: string; leadMinutes: number; status: WorkoutSchedule["status"]; version?: number }, now = new Date()) {
  if (!nudgesSchemaEnabled() || !nudgesAvailable(userId, "workout")) throw new NudgeRequestError(403, "Workout scheduling is not available yet.");
  const starts = new Date(input.startsAt);
  if (input.status === "planned" && (starts <= now || starts.getTime() > now.getTime() + 90 * 86400000)) throw new NudgeRequestError(400, "Choose a future time within 90 days.");
  return userTransaction(userId, async () => {
    const id = input.id ?? randomUUID();
    if (input.id) {
      const changed = await query(`update notification_workout_schedule set title=$3,starts_at=$4,lead_minutes=$5,status=$6,version=version+1,updated_at=$7
        where id=$1 and user_id=$2 and version=$8 returning id`, [id, userId, input.title, starts, input.leadMinutes, input.status, now, input.version]);
      if (!changed.rowCount) throw new NudgeRequestError(409, "This session changed or is no longer available. Reload the schedule.");
    } else {
      const count = await query<{ count: string }>("select count(*) from notification_workout_schedule where user_id=$1 and status='planned' and starts_at>$2", [userId, now]);
      if (Number(count.rows[0].count) >= 30) throw new NudgeRequestError(400, "You can plan up to 30 upcoming sessions.");
      if (input.status !== "planned") throw new NudgeRequestError(400, "New sessions must be planned.");
      await query("insert into notification_workout_schedule(id,user_id,title,starts_at,lead_minutes) values($1,$2,$3,$4,$5)", [id, userId, input.title, starts, input.leadMinutes]);
    }
    await query("update notification_preferences set next_plan_at=$2 where user_id=$1", [userId, now]);
    const cancelled = await query<{ id: string }>(`update notification_events set status='suppressed',error='schedule_changed' where user_id=$1 and context->>'scheduleId'=$2 and status in ('scheduled','retry') returning id`, [userId, id]);
    if (cancelled.rows.length) await query("update notification_deliveries set status='suppressed',result_code='schedule_changed',updated_at=$2 where event_id=any($1::uuid[]) and status in ('queued','retry')", [cancelled.rows.map(e=>e.id), now]);
    for (const event of cancelled.rows) await transition(event.id, "suppressed", "schedule_changed");
    return { id };
  });
}
/** Links an existing owned activity; never writes invented fitness metrics. */
export async function completeScheduledWorkout(userId: string, scheduleId: string, eventId: string) {
  if (!nudgesSchemaEnabled() || !nudgeUuid.test(scheduleId)) return false;
  return userTransaction(userId, async () => {
    const result = await query(`update notification_workout_schedule s set status='completed',completion_event_id=e.id,version=s.version+1,updated_at=now()
      from analytics_events e where s.id=$1 and s.user_id=$2 and s.status='planned' and e.id=$3 and e.user_id=$2 and e.event_name='burn_log' returning s.id`, [scheduleId, userId, eventId]);
    if (result.rowCount) {
      const actions = await query<{ id: string }>(`update notification_events set action_completed_at=now() where user_id=$1 and nudge_category='workout'
        and context->>'scheduleId'=$2 and dispatch_started_at is not null and action_completed_at is null
        and exists(select 1 from notification_preferences p where p.user_id=$1 and p.settings->>'enabled'='true' and p.settings->'categories'->'workout'->>'enabled'='true') returning id`, [userId, scheduleId]);
      for (const action of actions.rows) await transition(action.id, "action_completed", "linked_workout_log");
    }
    return Boolean(result.rowCount);
  });
}
async function enqueue(row: PreferenceRow, category: NudgeCategory, at: Date, context: EventRow["context"] = {}, suffix = "", expiresOverride?: Date) {
  const local = nudgeLocalParts(at, row.settings.timezone);
  const template = nudgeTemplates[category];
  const minutes = category === "workout" ? 90 : category === "weekly" ? 120 : 60;
  const expires = expiresOverride ?? new Date(at.getTime() + minutes * 60000);
  const result = await query<{ id: string }>(`insert into notification_events(user_id,notification_type,priority,title,body,href,tag,dedupe_key,status,
    nudge_category,scheduled_for,expires_at,next_attempt_at,preference_version,local_day,context)
    values($1,'zoe_smart_nudge',$2,$3,$4,$5,'zoe-smart-nudge',$6,'scheduled',$7,$8,$9,$8,$10,$11,$12)
    on conflict(user_id,dedupe_key) do nothing returning id`, [row.user_id, nudgePriority[category], template.title, template.body,
      category === "workout" ? `/workout-schedule?id=${context.scheduleId}` : template.href,
      `nudge:${category}:${suffix || local.date}:v${row.version}`, category, at, expires, row.version, local.date, context]);
  if (result.rows[0]) await transition(result.rows[0].id, "scheduled");
}
async function absenceFacts(row: PreferenceRow, now: Date) {
  const anchor = new Date(Math.max(row.last_app_open_at.getTime(), row.consented_at?.getTime() ?? now.getTime()));
  // Minimal durable counters survive the 90-day event retention window. An absence
  // that has reached its stop must never restart merely because history was pruned.
  const sameEpisode = row.comeback_anchor?.getTime() === anchor.getTime();
  return { anchor, count: sameEpisode ? row.comeback_attempts : 0, last: sameEpisode ? row.last_comeback_at : null };
}
async function milestoneFacts(userId: string) {
  const result = await query<{ count: string; latest: Date | null }>(`select count(*)::text as count,max(created_at) as latest from analytics_events
    where user_id=$1 and event_name='burn_log' and coalesce(metadata->>'source','') not in ('health_connect','apple_health')`, [userId]);
  const milestone = recordedWorkoutMilestone(Number(result.rows[0].count));
  const achieved = milestone ? (await query<{ created_at: Date }>(`select created_at from analytics_events where user_id=$1 and event_name='burn_log'
    and coalesce(metadata->>'source','') not in ('health_connect','apple_health') order by created_at,id offset $2 limit 1`, [userId, milestone-1])).rows[0]?.created_at : null;
  return { milestone, latest: achieved ?? null };
}
export async function planSmartNudges(limit = 100, now = new Date()) {
  if (!nudgesSchemaEnabled()) return 0;
  const candidates = await query<{ user_id: string }>(`select user_id from notification_preferences where settings->>'enabled'='true'
    and next_plan_at<=$1 order by next_plan_at,user_id limit $2`, [now, Math.min(500, Math.max(1, limit))]);
  let planned = 0;
  for (const { user_id: userId } of candidates.rows) {
    await userTransaction(userId, async () => {
      const row = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1 and next_plan_at<=$2", [userId, now])).rows[0];
      if (!row || !row.settings.enabled) return;
      await query("update notification_preferences set next_plan_at=$2 where user_id=$1", [userId, new Date(now.getTime() + 12 * 3600000)]);
      if (!nudgesAvailable(userId)) return;
      const today = nudgeLocalParts(now, row.settings.timezone).date;
      const absence = row.settings.categories.comeback.enabled ? await absenceFacts(row, now) : null;
      const milestone = row.settings.categories.milestone.enabled ? await milestoneFacts(userId) : null;
      for (let day = 0; day < 3; day++) {
        const date = nudgeDatePlus(today, day);
        for (const category of availableNudgeCategories(userId)) {
          if (category === "workout" || !row.settings.categories[category].enabled || (isRoutineNudge(category) && row.settings.intensity === "minimal")) continue;
          const at = nudgeWallTime(date, row.settings.categories[category].time, row.settings.timezone);
          // Never manufacture catch-up after consent/settings changes or a scheduler outage.
          if (!at || at < now || at.getTime() > now.getTime() + 48 * 3600000) continue;
          if (category === "weekly" && new Date(`${date}T12:00:00Z`).getUTCDay() !== row.settings.weeklyDay) continue;
          if (category === "comeback") {
            if (!absence || !comebackAttempt(at, absence.anchor, row.settings.comebackDays, absence.count, absence.last)) continue;
            await enqueue(row, category, at, { anchor: absence.anchor.toISOString() });
          } else if (category === "milestone") {
            if (!milestone?.milestone || !milestone.latest || !row.consented_at || milestone.latest < row.consented_at || now.getTime() - milestone.latest.getTime() > 2 * 86400000) continue;
            await enqueue(row, category, at, { milestone: milestone.milestone }, `${milestone.milestone}:${date}`);
          } else await enqueue(row, category, at);
        }
      }
      if (row.settings.categories.workout.enabled && nudgesAvailable(userId, "workout")) {
        const sessions = await query<WorkoutSchedule & QueryResultRow>(`select * from notification_workout_schedule where user_id=$1 and status='planned'
          and starts_at between $2 and $2::timestamptz+interval '49 hours' order by starts_at limit 30`, [userId, now]);
        for (const session of sessions.rows) {
          const at = new Date(session.starts_at.getTime() - session.lead_minutes * 60000);
          if (at >= now) await enqueue(row, "workout", at, { scheduleId: session.id, scheduleVersion: session.version }, `${session.id}:${session.version}`, new Date(session.starts_at.getTime() + 15 * 60000));
        }
      }
      planned++;
    });
  }
  return planned;
}
async function eligibleDevices(userId: string, now: Date) {
  return (await query<NudgePushDevice & QueryResultRow>(`select * from notification_devices where user_id=$1 and enabled=true
    and last_seen_at>$2::timestamptz-interval '30 days' order by last_seen_at desc limit 5`, [userId, now])).rows.filter(providerReady);
}
/** Read live preferences, logs and appointments, not just the queue: a scheduled
 * workout must be protected even if this worker's planner batch hasn't reached it.
 * Called under the same per-user lock as the dispatch reservation. */
async function protectPriorityReminders(event: EventRow, row: PreferenceRow, now: Date) {
  const horizon = new Date(now.getTime() + 86400000);
  const today = nudgeLocalParts(now, row.settings.timezone).date;
  const history = (await query<NudgeReservation & { schedule_id: string | null } & QueryResultRow>(`select nudge_category as category,dispatch_started_at as at,context->>'scheduleId' as schedule_id
    from notification_events where user_id=$1 and id<>$3 and dispatch_started_at>$2::timestamptz-interval '48 hours'`, [event.user_id, now, event.id])).rows;
  const queued = (await query<EventRow>(`select * from notification_events where user_id=$1 and preference_version=$2
    and nudge_category in ('breakfast','lunch','dinner','workout') and expires_at>$3 and scheduled_for<$4`, [event.user_id, row.version, now, horizon])).rows;
  const meals = (await query<{ meal_type: string; day: string }>(`select distinct meal_type,to_char(logged_at at time zone $2,'YYYY-MM-DD') as day
    from food_logs where user_id=$1 and (logged_at at time zone $2)::date between $3::date and $4::date`,
    [event.user_id, row.settings.timezone, today, nudgeLocalParts(horizon, row.settings.timezone).date])).rows;
  const upcoming: UpcomingPriorityNudge[] = [];
  function add(category: NudgeCategory, at: Date, key: string, scheduleId?: string, scheduleVersion?: number) {
    if (at >= horizon || !row.settings.categories[category].enabled || !nudgesAvailable(event.user_id, category)) return;
    const existing = queued.find(e => e.nudge_category === category && e.scheduled_for.getTime() === at.getTime()
      && (category !== "workout" || (e.context.scheduleId === scheduleId && e.context.scheduleVersion === scheduleVersion)));
    if (existing && (existing.dispatch_started_at || !["scheduled", "retry"].includes(existing.status))) return;
    // No catch-up for an unqueued, already-past time. A live pending job can still be due.
    if (at < now && !existing) return;
    const day = nudgeLocalParts(at, row.settings.timezone).date;
    if (category === "workout" && history.some(sent => sent.category === "workout" && sent.schedule_id === scheduleId
      && nudgeLocalParts(sent.at, row.settings.timezone).date === day)) return;
    if (category !== "workout") {
      if (at < now && day !== today) return;
      if (meals.some(log => log.meal_type === category && log.day === day)) return;
      if (history.some(sent => sent.category === category && nudgeLocalParts(sent.at, row.settings.timezone).date === day)) return;
    }
    upcoming.push({ category, at: at < now ? now : at, key });
  }
  // Three local dates cover the next 24 hours even across a shortened DST day.
  for (let offset = 0; offset < 3; offset++) {
    const day = nudgeDatePlus(today, offset);
    for (const category of ["breakfast", "lunch", "dinner"] as const) {
      const at = nudgeWallTime(day, row.settings.categories[category].time, row.settings.timezone);
      if (at) add(category, at, `${category}:${day}`);
    }
  }
  if (row.settings.categories.workout.enabled && nudgesAvailable(event.user_id, "workout")) {
    const sessions = (await query<WorkoutSchedule & QueryResultRow>(`select * from notification_workout_schedule where user_id=$1 and status='planned'
      and starts_at>$2::timestamptz-interval '15 minutes' and starts_at<$3::timestamptz+interval '1 hour' order by starts_at limit 30`,
      [event.user_id, now, horizon])).rows;
    for (const session of sessions) add("workout", new Date(session.starts_at.getTime() - session.lead_minutes * 60000),
      `workout:${session.id}:${session.version}`, session.id, session.version);
  }
  return priorityReservationReason(row.settings, event.nudge_category, now, history, upcoming);
}
async function checkEligibility(event: EventRow, row: PreferenceRow, now: Date, retry: boolean) {
  const day = nudgeLocalParts(now, row.settings.timezone).date;
  const category = event.nudge_category;
  const devices = await eligibleDevices(event.user_id, now);
  const counts = await query<{ daily: string; rolling: string; routine: string; workouts: string; last: Date | null; duplicate: boolean }>(`select
    count(*) filter(where (dispatch_started_at at time zone $3)::date=$4::date)::text as daily,
    count(*) filter(where dispatch_started_at>$2::timestamptz-interval '24 hours')::text as rolling,
    count(*) filter(where (dispatch_started_at at time zone $3)::date=$4::date and nudge_category in ('morning','evening','weekly','comeback','milestone'))::text as routine,
    count(*) filter(where (dispatch_started_at at time zone $3)::date=$4::date and nudge_category='workout')::text as workouts,
    max(dispatch_started_at) as last,
    coalesce(bool_or(nudge_category=$5 and (dispatch_started_at at time zone $3)::date=$4::date and ($5<>'workout' or context->>'scheduleId'=$7)),false) as duplicate
    from notification_events where user_id=$1 and dispatch_started_at>$2::timestamptz-interval '48 hours' and id<>$6`,
    [event.user_id, now, row.settings.timezone, day, category, event.id, event.context.scheduleId ?? null]);
  let actionCompleted = false; let relevant = true;
  if (["breakfast", "lunch", "dinner"].includes(category)) {
    actionCompleted = Boolean((await query(`select 1 from food_logs where user_id=$1 and meal_type=$2 and (logged_at at time zone $3)::date=$4::date limit 1`, [event.user_id, category, row.settings.timezone, day])).rowCount);
  } else if (category === "hydration") {
    actionCompleted = Boolean((await query("select 1 from water_logs where user_id=$1 and logged_at between $2::timestamptz-interval '2 hours' and $2 limit 1", [event.user_id, now])).rowCount);
  } else if (category === "workout") {
    const session = (await query<WorkoutSchedule & QueryResultRow>("select * from notification_workout_schedule where user_id=$1 and id=$2", [event.user_id, event.context.scheduleId])).rows[0];
    actionCompleted = session?.status === "completed";
    relevant = Boolean(session && session.status === "planned" && session.version === event.context.scheduleVersion && now.getTime() < session.starts_at.getTime() + 15 * 60000);
  } else if (category === "comeback") {
    const absence = await absenceFacts(row, now);
    relevant = event.context.anchor === absence.anchor.toISOString()
      && comebackAttempt(now, absence.anchor, row.settings.comebackDays, absence.count - (retry ? 1 : 0), retry ? null : absence.last);
  } else if (category === "milestone") {
    const facts = await milestoneFacts(event.user_id);
    relevant = facts.milestone === event.context.milestone && Boolean(facts.latest && row.consented_at && facts.latest >= row.consented_at);
    if (!retry && (await query("select 1 from notification_milestones where user_id=$1 and milestone=$2", [event.user_id, event.context.milestone])).rowCount) relevant = false;
  }
  // Local dates can change after timezone updates; version fencing also covers this.
  if (category !== "workout" && nudgeLocalParts(event.scheduled_for, row.settings.timezone).date !== day) relevant = false;
  const pending = Boolean((await query("select 1 from messages where receiver_user_id=$1 and read_at is null limit 1", [event.user_id])).rowCount);
  const stats = counts.rows[0];
  let reason = nudgeSuppression(row.settings, { now, due: event.scheduled_for, expires: event.expires_at, category,
    rollout: nudgesAvailable(event.user_id, category), versionMatches: row.version === event.preference_version, device: devices.length > 0,
    actionCompleted, relevant, pendingMessage: pending, duplicate: stats.duplicate, dayCount: Number(stats.daily), rollingCount: Number(stats.rolling),
    routineCount: Number(stats.routine), workoutCount: Number(stats.workouts), lastDispatch: stats.last });
  // An already-reserved retry consumes capacity regardless of its provider outcome.
  // Re-applying this check cannot free that slot and could split a multi-device send.
  if (!reason && !retry && !isPriorityNudge(category)) reason = await protectPriorityReminders(event, row, now);
  return { reason, devices };
}
async function reserveEvent(id: string, userId: string, now: Date) {
  return userTransaction(userId, async () => {
    const event = (await query<EventRow>("select * from notification_events where id=$1 and status in ('scheduled','retry') and next_attempt_at<=$2 for update skip locked", [id, now])).rows[0];
    if (!event) return null;
    const higher = await query(`select 1 from notification_events where user_id=$1 and nudge_category is not null
      and status in ('scheduled','retry') and next_attempt_at<=$2 and priority<$3 limit 1`, [userId, now, event.priority]);
    if (higher.rowCount) return null;
    const row = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0];
    if (!row) { await suppress(event, "no_consent"); return null; }
    const retry = Boolean(event.dispatch_started_at);
    const { reason, devices } = await checkEligibility(event, row, now, retry);
    if (reason) { await suppress(event, reason); return null; }
    if (!retry) {
      if (event.nudge_category === "comeback") {
        const absence = await absenceFacts(row, now);
        await query("update notification_preferences set comeback_anchor=$2,comeback_attempts=$3,last_comeback_at=$4 where user_id=$1", [userId, absence.anchor, absence.count+1, now]);
      }
      for (const device of devices) await query("insert into notification_deliveries(event_id,device_id,token_version) values($1,$2,$3) on conflict do nothing", [id, device.id, device.token_version]);
      if (event.nudge_category === "milestone") await query("insert into notification_milestones(user_id,milestone) values($1,$2) on conflict do nothing", [userId, event.context.milestone]);
      await transition(id, "queued");
    }
    await query("update notification_events set status='dispatching',dispatch_started_at=coalesce(dispatch_started_at,$2),next_attempt_at=$2 where id=$1", [id, now]);
    return { ...event, dispatch_started_at: event.dispatch_started_at ?? now };
  });
}
export type NudgeSender = (device: NudgePushDevice, payload: NudgePushPayload) => Promise<NudgePushResult>;
async function dispatchEvent(event: EventRow, send: NudgeSender, clock: () => Date, deadline: number) {
  const deliveries = (await query<{ device_id: string }>("select device_id from notification_deliveries where event_id=$1 and status in ('queued','retry') order by device_id", [event.id])).rows;
  for (const delivery of deliveries) {
    if (Date.now() >= deadline) break; // Undispatched devices remain retryable, with the same reservation.
    const now = clock();
    const device = await userTransaction(event.user_id, async () => {
      const current = (await query<EventRow>("select * from notification_events where id=$1 and status='dispatching'", [event.id])).rows[0];
      const row = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [event.user_id])).rows[0];
      if (!current || !row) return null;
      const { reason, devices } = await checkEligibility(current, row, now, true);
      if (reason) { await suppress(current, reason); return null; }
      const target = devices.find(d => d.id === delivery.device_id);
      const claimed = target && await query(`update notification_deliveries set status='dispatched',attempts=attempts+1,updated_at=$4
        where event_id=$1 and device_id=$2 and token_version=$3 and status in ('queued','retry') and attempts<3 returning device_id`, [event.id, target.id, target.token_version, now]);
      if (!claimed?.rowCount) {
        await query("update notification_deliveries set status='suppressed',result_code='device_changed',updated_at=$3 where event_id=$1 and device_id=$2 and status in ('queued','retry')", [event.id, delivery.device_id, now]);
        return null;
      }
      await transition(event.id, "dispatched"); return target;
    });
    if (!device) continue;
    let result: NudgePushResult;
    try { result = await send(device, { eventId: event.id, title: event.title, body: event.body, expiresAt: event.expires_at }); }
    catch { result = { status: "unknown", code: "provider_outcome_unknown" }; }
    // A deleted account/event disappears safely; never recreate it from a callback.
    await userTransaction(event.user_id, async () => {
      const updated = await query(`update notification_deliveries set status=case when $3='retry' and attempts>=3 then 'failed' else $3 end,result_code=$4,updated_at=$5
        where event_id=$1 and device_id=$2 and status='dispatched' returning status`, [event.id, device.id, result.status, result.code, clock()]);
      if (!updated.rowCount) return;
      if (result.invalidToken) await query("update notification_devices set enabled=false where id=$1 and user_id=$2 and token_version=$3", [device.id, event.user_id, device.token_version]);
      await transition(event.id, updated.rows[0].status === "accepted" ? "provider_accepted" : updated.rows[0].status, result.code);
    });
  }
  await userTransaction(event.user_id, async () => {
    const states = (await query<{ status: string; attempts: number }>("select status,attempts from notification_deliveries where event_id=$1", [event.id])).rows;
    if (!states.length) return;
    const retry = states.some(s => s.status === "retry" || s.status === "queued");
    const status = retry ? "retry" : states.some(s => s.status === "unknown" || s.status === "dispatched") ? "unknown"
      : states.every(s => s.status === "accepted") ? "accepted" : states.some(s => s.status === "accepted") ? "partial" : "failed";
    const delay = Math.min(15 * 60000, 60000 * 2 ** Math.max(...states.map(s => s.attempts)));
    // Preserve a concurrent opt-out/suppression; per-device accepted facts remain observable.
    await query("update notification_events set status=$2,next_attempt_at=$3,sent_at=case when $4 then coalesce(sent_at,$5) else sent_at end where id=$1 and status='dispatching'",
      [event.id, status, new Date(clock().getTime() + delay), states.some(s => s.status === "accepted"), clock()]);
  });
}
export async function runSmartNudges(options: { limit?: number; now?: () => Date; send?: NudgeSender; plan?: boolean; budgetMs?: number } = {}) {
  if (!nudgesSchemaEnabled()) return { planned: 0, processed: 0 };
  const clock = options.now ?? (() => new Date()); const now = clock();
  const deadline = Date.now() + Math.max(0, Math.min(options.budgetMs ?? 40000, 40000));
  // Recovery is conservative: a process may have died after provider acceptance.
  const stale = await query<{ id: string }>(`update notification_events set status='unknown',error='worker_interrupted'
    where nudge_category is not null and status='dispatching' and next_attempt_at<$1::timestamptz-interval '2 minutes' returning id`, [now]);
  for (const { id } of stale.rows) {
    await query("update notification_deliveries set status='unknown',result_code='worker_interrupted' where event_id=$1 and status in ('dispatched','queued','retry')", [id]);
    await transition(id, "unknown", "worker_interrupted");
  }
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
  const planned = options.plan === false ? 0 : await planSmartNudges(limit, now);
  const due = await query<{ id: string; user_id: string }>(`select id,user_id from notification_events where nudge_category is not null
    and status in ('scheduled','retry') and next_attempt_at<=$1 order by priority,scheduled_for,id limit $2`, [now, limit]);
  let processed = 0;
  // Bounded concurrency; one stalled provider cannot hold all users or a DB pool.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, due.rows.length) }, async () => {
    while (cursor < due.rows.length && Date.now() < deadline) {
      const candidate = due.rows[cursor++];
      const event = await reserveEvent(candidate.id, candidate.user_id, clock());
      if (event) { await dispatchEvent(event, options.send ?? sendNudgePush, clock, deadline); processed++; }
    }
  }));
  return { planned, processed };
}
export async function resolveNudgeOpen(userId: string, id: string, now = new Date()) {
  if (!nudgesSchemaEnabled() || !nudgeUuid.test(id)) return { href: "/dashboard", available: false };
  return userTransaction(userId, async () => {
    const event = (await query<EventRow>("select * from notification_events where id=$1 and user_id=$2 and nudge_category is not null", [id, userId])).rows[0];
    if (!event || !event.dispatch_started_at || now.getTime() - event.scheduled_for.getTime() > 7 * 86400000) return { href: "/dashboard", available: false };
    let href = safeNotificationHref(event.href);
    if (event.nudge_category === "workout") {
      const session = (await query<WorkoutSchedule & QueryResultRow>("select * from notification_workout_schedule where id=$1 and user_id=$2", [event.context.scheduleId, userId])).rows[0];
      if (!session || session.status !== "planned" || session.version !== event.context.scheduleVersion) return { href: "/workout-schedule", available: false };
    } else if (["breakfast", "lunch", "dinner"].includes(event.nudge_category)) {
      // Never preselect yesterday's meal category on a later day.
      const prefs = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0];
      if (!prefs || nudgeLocalParts(now, prefs.settings.timezone).date !== nudgeLocalParts(event.scheduled_for, prefs.settings.timezone).date) href = "/food-log";
    }
    const consent = (await query<PreferenceRow>("select * from notification_preferences where user_id=$1", [userId])).rows[0];
    if (consent?.settings.enabled && consent.settings.categories[event.nudge_category].enabled) {
      const changed = await query("update notification_events set opened_at=$3 where id=$1 and user_id=$2 and opened_at is null returning id", [id, userId, now]);
      if (changed.rowCount) await transition(id, "opened");
    }
    return { href, available: true };
  });
}
export async function nudgeQueueHealth() {
  if (!nudgesSchemaEnabled()) return { enabled: false };
  return (await query(`select
    (select count(*)::int from notification_events where nudge_category is not null and status in ('scheduled','retry') and next_attempt_at<=now()) as due,
    (select extract(epoch from now()-min(next_attempt_at)) from notification_events where nudge_category is not null and status in ('scheduled','retry') and next_attempt_at<=now()) as oldest_due_seconds,
    (select count(*)::int from notification_events where nudge_category is not null and status='unknown' and dispatch_started_at>now()-interval '24 hours') as unknown_24h`)).rows[0];
}
export async function retainNudgeHistory() {
  if (!nudgesSchemaEnabled()) return;
  await query("delete from notification_transitions where created_at<now()-interval '90 days'");
  await query("delete from notification_events where nudge_category is not null and created_at<now()-interval '90 days' and status not in ('scheduled','retry','dispatching')");
  await query("delete from notification_workout_schedule where starts_at<now()-interval '90 days'");
}
