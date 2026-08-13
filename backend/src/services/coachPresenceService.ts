import { query } from "../db/pool";
import { env } from "../config/env";

const momentumScoreTable = env.MOMENTUM_V2 ? "momentum_scores_v2" : "compliance_scores";

export type CoachPresenceTrigger =
  | "dashboard_open"
  | "food_logged"
  | "water_logged"
  | "workout_logged"
  | "habit_completed"
  | "progress_photo"
  | "body_scan"
  | "trainer_praise"
  | "weekly_report";

export type CoachPresenceStyle = "motivational" | "balanced" | "minimal";

type UserCoachPresenceContext = {
  user_id: string;
  full_name: string | null;
  current_plan: "free" | "premium" | "trainer_pro";
  subscription_status: string | null;
  athlete_mode_enabled: boolean;
  last_trainer_message_at: string | null;
  last_trainer_praise_at: string | null;
  pause_until: string | null;
  style: CoachPresenceStyle | null;
};

type UserCoachPresenceStats = {
  food_today: string | number;
  food_days_7: string | number;
  water_today_ml: string | number;
  workouts_7: string | number;
  habits_today: string | number;
  activity_days_7: string | number;
  latest_score: string | number | null;
  previous_score: string | number | null;
  latest_scan_at: string | null;
};

export async function ensureCoachPresenceSchema() {
  await query(`
    create table if not exists coach_presence_messages (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      trigger_type text not null,
      message text not null,
      tone text not null default 'balanced',
      dedupe_key text not null,
      metadata jsonb not null default '{}'::jsonb,
      dismissed_at timestamptz,
      shown_count integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create unique index if not exists coach_presence_user_dedupe_idx
      on coach_presence_messages(user_id, dedupe_key);

    create index if not exists coach_presence_user_created_idx
      on coach_presence_messages(user_id, created_at desc);

    create table if not exists coach_presence_settings (
      user_id uuid primary key references users(id) on delete cascade,
      style text not null default 'balanced',
      pause_until timestamptz,
      paused_by_user_id uuid references users(id) on delete set null,
      updated_at timestamptz not null default now()
    );

    create table if not exists coach_presence_events (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      message_id uuid references coach_presence_messages(id) on delete set null,
      event_type text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists coach_presence_events_user_created_idx
      on coach_presence_events(user_id, created_at desc);
  `);
}

function activePaidPlan(context: UserCoachPresenceContext) {
  return (context.current_plan === "premium" || context.current_plan === "trainer_pro") &&
    (context.subscription_status === null || ["active", "trialing", "past_due", "canceled"].includes(context.subscription_status));
}

function daysSince(value?: string | null) {
  if (!value) return 999;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 999;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function hoursSince(value?: string | null) {
  if (!value) return 999;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 999;
  return (Date.now() - time) / 3_600_000;
}

function localHour(timeZone = "Asia/Kuala_Lumpur") {
  const value = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone }).format(new Date());
  return Number(value);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getContext(userId: string): Promise<UserCoachPresenceContext | null> {
  const result = await query<UserCoachPresenceContext>(
    `
    select u.id as user_id, u.full_name,
      coalesce(active_subscription.plan::text, 'free') as current_plan,
      active_subscription.status as subscription_status,
      coalesce(athlete_profile.enabled, false) as athlete_mode_enabled,
      trainer_message.last_trainer_message_at,
      trainer_praise.last_trainer_praise_at,
      settings.pause_until,
      settings.style
    from users u
    left join athlete_profiles athlete_profile on athlete_profile.user_id = u.id
    left join coach_presence_settings settings on settings.user_id = u.id
    left join lateral (
      select plan, status, current_period_end
      from subscriptions
      where user_id = u.id
        and (
          status in ('active','trialing','past_due')
          or (status = 'canceled' and current_period_end > now())
        )
      order by case plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, created_at desc
      limit 1
    ) active_subscription on true
    left join lateral (
      select max(created_at) as last_trainer_message_at
      from messages
      where receiver_user_id = u.id
        and sender_user_id <> u.id
    ) trainer_message on true
    left join lateral (
      select max(created_at) as last_trainer_praise_at
      from trainer_recognitions
      where client_user_id = u.id
    ) trainer_praise on true
    where u.id = $1
      and u.status = 'active'
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function getStats(userId: string): Promise<UserCoachPresenceStats> {
  const result = await query<UserCoachPresenceStats>(
    `
    select
      (select count(*) from food_logs where user_id = $1 and logged_at::date = current_date) as food_today,
      (select count(distinct logged_at::date) from food_logs where user_id = $1 and logged_at >= current_date - interval '6 days') as food_days_7,
      (select coalesce(sum(amount_ml), 0) from water_logs where user_id = $1 and logged_at::date = current_date) as water_today_ml,
      (select count(*) from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= current_date - interval '6 days') as workouts_7,
      (select count(*) from habit_logs where user_id = $1 and logged_at::date = current_date and completed = true) as habits_today,
      (
        select count(distinct activity_at::date)
        from (
          select logged_at as activity_at from food_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from weight_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from water_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from habit_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select created_at from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= current_date - interval '6 days'
        ) activity
      ) as activity_days_7,
      (select score from ${momentumScoreTable} where user_id = $1 order by calculated_for_date desc limit 1) as latest_score,
      (select score from ${momentumScoreTable} where user_id = $1 order by calculated_for_date desc offset 1 limit 1) as previous_score,
      (select created_at from body_composition_scans where user_id = $1 and user_confirmed = true order by scan_date desc, created_at desc limit 1) as latest_scan_at
    `,
    [userId]
  );
  return result.rows[0];
}

async function withinFrequencyLimit(userId: string) {
  const result = await query<{ today_count: string | number; latest_at: string | null }>(
    `
    select
      count(*) filter (where created_at::date = current_date) as today_count,
      max(created_at) as latest_at
    from coach_presence_messages
    where user_id = $1
    `,
    [userId]
  );
  const row = result.rows[0];
  if (Number(row?.today_count ?? 0) >= 3) return false;
  if (row?.latest_at && hoursSince(row.latest_at) < 3) return false;
  return true;
}

function trainerRecentlyPresent(context: UserCoachPresenceContext) {
  return Math.min(hoursSince(context.last_trainer_message_at), hoursSince(context.last_trainer_praise_at)) <= 48;
}

function pickMessage(input: {
  trigger: CoachPresenceTrigger;
  context: UserCoachPresenceContext;
  stats: UserCoachPresenceStats;
}): { message: string; tone: string; dedupeKey: string } | null {
  const { trigger, context, stats } = input;
  const key = todayKey();
  const foodToday = Number(stats.food_today ?? 0);
  const foodDays7 = Number(stats.food_days_7 ?? 0);
  const waterTodayMl = Number(stats.water_today_ml ?? 0);
  const workouts7 = Number(stats.workouts_7 ?? 0);
  const activityDays7 = Number(stats.activity_days_7 ?? 0);
  const score = Number(stats.latest_score);
  const previousScore = Number(stats.previous_score);

  if (trigger === "trainer_praise") {
    return {
      message: "Your trainer noticed your effort. Keep stacking these small wins between sessions.",
      tone: "celebration",
      dedupeKey: `trainer-praise:${key}`
    };
  }
  if (trigger === "body_scan" && context.athlete_mode_enabled) {
    return {
      message: "Your Body Scan gives your trainer better information for the next plan adjustment. Nice work keeping the data current.",
      tone: "athlete",
      dedupeKey: `body-scan:${key}`
    };
  }
  if (trigger === "weekly_report") {
    return {
      message: "Your weekly report is ready. Use it as a calm reset: see what improved, then choose one focus for next week.",
      tone: "support",
      dedupeKey: `weekly-report:${key}`
    };
  }
  if (trigger === "food_logged" && foodToday === 1) {
    return {
      message: "Great start to the day. One honest meal log is already building momentum.",
      tone: "celebration",
      dedupeKey: `first-food:${key}`
    };
  }
  if (trigger === "water_logged" && waterTodayMl >= 2000) {
    return {
      message: "Hydration is in a good place today. Your trainer will be able to see this consistency.",
      tone: "celebration",
      dedupeKey: `water-target:${key}`
    };
  }
  if (trigger === "workout_logged" || workouts7 >= 3) {
    return {
      message: "Training effort logged. You're building useful progress for your next coaching session.",
      tone: "support",
      dedupeKey: `workout:${key}`
    };
  }
  if (trigger === "progress_photo") {
    return {
      message: "Progress photo saved. The scale is only one part of the story, and now your visual progress is protected too.",
      tone: "support",
      dedupeKey: `progress-photo:${key}`
    };
  }
  if (activityDays7 >= 5 || foodDays7 >= 5) {
    return {
      message: "Excellent consistency this week. Small actions are starting to look like a routine.",
      tone: "celebration",
      dedupeKey: `weekly-consistency:${key}`
    };
  }
  if (Number.isFinite(score) && Number.isFinite(previousScore) && score - previousScore >= 10) {
    return {
      message: "Momentum is improving. Keep the next action simple and let the trend keep building.",
      tone: "celebration",
      dedupeKey: `momentum-improved:${key}`
    };
  }
  if (activityDays7 <= 1 && trigger === "dashboard_open") {
    return {
      message: "Welcome back. Progress is not about perfection; one meal, one workout, or one check-in is enough to restart momentum.",
      tone: "support",
      dedupeKey: `comeback:${key}`
    };
  }
  return null;
}

export async function createCoachPresenceForEvent(userId: string, trigger: CoachPresenceTrigger) {
  const context = await getContext(userId);
  if (!context || !activePaidPlan(context)) return null;
  if (context.pause_until && new Date(context.pause_until).getTime() > Date.now()) return null;
  if (localHour() >= 22 || localHour() < 8) return null;
  if (trigger !== "trainer_praise" && trainerRecentlyPresent(context)) return null;
  if (!await withinFrequencyLimit(userId)) return null;

  const stats = await getStats(userId);
  const candidate = pickMessage({ trigger, context, stats });
  if (!candidate) return null;
  if ((context.style ?? "balanced") === "minimal" && !["celebration", "athlete"].includes(candidate.tone) && trigger !== "trainer_praise") return null;

  const result = await query(
    `
    insert into coach_presence_messages (user_id, trigger_type, message, tone, dedupe_key, metadata)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (user_id, dedupe_key) do nothing
    returning *
    `,
    [userId, trigger, candidate.message, candidate.tone, candidate.dedupeKey, { trigger, style: context.style ?? "balanced" }]
  );
  if (result.rows[0]) {
    await recordCoachPresenceEvent(userId, "generated", result.rows[0].id, { trigger });
  }
  return result.rows[0] ?? null;
}

export async function getCoachPresenceFeed(userId: string) {
  await createCoachPresenceForEvent(userId, "dashboard_open");
  const context = await getContext(userId);
  if (!context || !activePaidPlan(context)) {
    return { latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } };
  }

  const result = await query(
    `
    select *
    from coach_presence_messages
    where user_id = $1
      and dismissed_at is null
    order by created_at desc
    limit 8
    `,
    [userId]
  );
  const momentumMessages = result.rows.some((message) => String(message.dedupe_key ?? "").startsWith("momentum-improved:"));
  const stats = momentumMessages ? await getStats(userId) : null;
  const latestScore = stats?.latest_score === null || stats?.latest_score === undefined ? null : Number(stats.latest_score);
  const previousScore = stats?.previous_score === null || stats?.previous_score === undefined ? null : Number(stats.previous_score);
  const currentMomentumIsImproving =
    latestScore !== null &&
    previousScore !== null &&
    Number.isFinite(latestScore) &&
    Number.isFinite(previousScore) &&
    latestScore - previousScore >= 10;
  const history = result.rows.filter(
    (message) => !String(message.dedupe_key ?? "").startsWith("momentum-improved:") || currentMomentumIsImproving
  );
  if (history[0]) {
    await query("update coach_presence_messages set shown_count = shown_count + 1, updated_at = now() where id = $1", [history[0].id]);
    await recordCoachPresenceEvent(userId, "shown", history[0].id);
  }
  return {
    latest: history[0] ?? null,
    history,
    settings: {
      style: context.style ?? "balanced",
      paused: Boolean(context.pause_until && new Date(context.pause_until).getTime() > Date.now()),
      pauseUntil: context.pause_until
    }
  };
}

export async function updateCoachPresenceStyle(userId: string, style: CoachPresenceStyle) {
  const result = await query(
    `
    insert into coach_presence_settings (user_id, style)
    values ($1, $2)
    on conflict (user_id) do update set style = excluded.style, updated_at = now()
    returning *
    `,
    [userId, style]
  );
  return result.rows[0];
}

export async function dismissCoachPresence(userId: string, messageId: string) {
  await query("update coach_presence_messages set dismissed_at = now(), updated_at = now() where id = $1 and user_id = $2", [messageId, userId]);
  await recordCoachPresenceEvent(userId, "dismissed", messageId);
}

export async function pauseCoachPresenceForClient(clientId: string, actorId: string, pauseHours: number | null) {
  const result = await query(
    `
    insert into coach_presence_settings (user_id, pause_until, paused_by_user_id)
    values ($1, case when $3::int is null then null else now() + ($3::int || ' hours')::interval end, $2)
    on conflict (user_id) do update set
      pause_until = excluded.pause_until,
      paused_by_user_id = excluded.paused_by_user_id,
      updated_at = now()
    returning *
    `,
    [clientId, actorId, pauseHours]
  );
  await recordCoachPresenceEvent(clientId, pauseHours ? "paused" : "resumed", null, { pauseHours, actorId });
  return result.rows[0];
}

export async function getCoachPresenceForTrainer(clientId: string) {
  const result = await query(
    `
    select *
    from coach_presence_messages
    where user_id = $1
      and dismissed_at is null
    order by created_at desc
    limit 8
    `,
    [clientId]
  );
  const settings = await query("select * from coach_presence_settings where user_id = $1", [clientId]);
  return {
    history: result.rows,
    latest: result.rows[0] ?? null,
    settings: {
      style: settings.rows[0]?.style ?? "balanced",
      paused: Boolean(settings.rows[0]?.pause_until && new Date(settings.rows[0].pause_until).getTime() > Date.now()),
      pauseUntil: settings.rows[0]?.pause_until ?? null
    }
  };
}

async function recordCoachPresenceEvent(userId: string, eventType: string, messageId?: string | null, metadata: Record<string, unknown> = {}) {
  await query(
    "insert into coach_presence_events (user_id, message_id, event_type, metadata) values ($1, $2, $3, $4)",
    [userId, messageId ?? null, eventType, metadata]
  );
}
