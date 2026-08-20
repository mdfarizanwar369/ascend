import { AscendDNAService, AscendDnaEvent, buildCoachZoeProactiveInsight, NotificationCandidate, NotificationEngine } from "@ascend/shared";
import { query } from "../db/pool";
import { getFirebaseMessaging } from "../integrations/firebase";
import { getHealthSyncSummary } from "./healthSyncService";
import { resolveNutritionTargets } from "./nutritionTargetService";
import { env } from "../config/env";
import {
  dailyCoachingNotificationSource,
  dailyCoachingRolloutMode,
  getLatestCachedDailyCoachingInsight,
  resolveDailyCoachingDecision
} from "./dailyCoachingDecisionService";
import { dailyCoachingCorrelation, dailyCoachingTelemetry, safeDailyCoachingError } from "./dailyCoachingTelemetry";
import { isPlatformOwnerEmail } from "./platformOwnerService";
import { buildTodayPriorityDayContext, loadTodayPriorityFacts } from "./todayPriorityContextService";
import { deterministicTodayPriority } from "./todayPriorityService";
import { TODAY_PRIORITY_PROMPT_VERSION } from "../integrations/openai";

const momentumScoreTable = env.MOMENTUM_V2 ? "momentum_scores_v2" : "compliance_scores";

type Platform = "android" | "ios" | "desktop" | "web";

export async function ensureNotificationSchema() {
  await query(`
    create table if not exists notification_devices (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      fcm_token text not null unique,
      platform text not null default 'web',
      user_agent text,
      enabled boolean not null default true,
      last_seen_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists notification_devices_user_enabled_idx
      on notification_devices(user_id, enabled, last_seen_at desc);

    alter table notification_devices
      add column if not exists timezone_offset_minutes smallint not null default 0;

    create table if not exists notification_events (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      notification_type text not null,
      priority integer not null,
      title text not null,
      body text not null,
      href text not null default '/dashboard',
      tag text not null default 'ascend-coach',
      dedupe_key text not null,
      status text not null default 'sent',
      channel text not null default 'push',
      error text,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    );

    create unique index if not exists notification_events_user_dedupe_idx
      on notification_events(user_id, dedupe_key);

    create index if not exists notification_events_user_type_created_idx
      on notification_events(user_id, notification_type, created_at desc);
  `);
}

export async function registerNotificationDevice(input: {
  userId: string;
  fcmToken: string;
  platform: Platform;
  userAgent?: string | null;
  timezoneOffsetMinutes: number;
}) {
  const result = await query(
    `
    insert into notification_devices (user_id, fcm_token, platform, user_agent, timezone_offset_minutes)
    values ($1, $2, $3, $4, $5)
    on conflict (fcm_token) do update set
      user_id = excluded.user_id,
      platform = excluded.platform,
      user_agent = excluded.user_agent,
      timezone_offset_minutes = excluded.timezone_offset_minutes,
      enabled = true,
      last_seen_at = now(),
      updated_at = now()
    returning id, platform, enabled, last_seen_at
    `,
    [input.userId, input.fcmToken, input.platform, input.userAgent ?? null, input.timezoneOffsetMinutes]
  );
  return result.rows[0];
}

export async function disableNotificationDevice(userId: string, fcmToken: string) {
  await query("update notification_devices set enabled = false, updated_at = now() where user_id = $1 and fcm_token = $2", [userId, fcmToken]);
}

export async function recordNotificationActivity(userId: string, screenName = "app", timezoneOffsetMinutes?: number) {
  await query(
    `
    insert into analytics_events (user_id, gym_id, event_name, metadata)
    select id, gym_id, 'screen_open', $2::jsonb
    from users
    where id = $1
    `,
    [userId, { screenName }]
  );
  if (timezoneOffsetMinutes !== undefined) {
    await query(
      `
      update notification_devices
      set timezone_offset_minutes = $2, updated_at = now()
      where user_id = $1 and enabled = true
      `,
      [userId, timezoneOffsetMinutes]
    );
  }
}

function notificationLink(href: string) {
  return href.startsWith("http") ? href : `${process.env.FRONTEND_URL ?? "https://www.getascend.fit"}${href}`;
}

async function logNotificationEvent(userId: string, candidate: NotificationCandidate, status: "sent" | "skipped" | "error", error?: string | null) {
  await query(
    `
    insert into notification_events (
      user_id, notification_type, priority, title, body, href, tag, dedupe_key, status, error, sent_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $9 = 'sent' then now() else null end)
    on conflict (user_id, dedupe_key) do nothing
    `,
    [
      userId,
      candidate.type,
      candidate.priority,
      candidate.title,
      candidate.body,
      candidate.href,
      candidate.tag,
      candidate.dedupeKey,
      status,
      error ?? null
    ]
  );
}

export async function sendNotificationToUser(userId: string, candidate: NotificationCandidate) {
  const duplicate = await query("select id from notification_events where user_id = $1 and dedupe_key = $2 limit 1", [
    userId,
    candidate.dedupeKey
  ]);
  if (duplicate.rows[0]) return { sent: 0, skipped: true };

  const devices = await query<{ fcm_token: string }>(
    "select fcm_token from notification_devices where user_id = $1 and enabled = true order by last_seen_at desc limit 5",
    [userId]
  );
  if (!devices.rows.length) {
    await logNotificationEvent(userId, candidate, "skipped", "no_enabled_devices");
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  let lastError: string | null = null;
  for (const device of devices.rows) {
    try {
      await getFirebaseMessaging().send({
        token: device.fcm_token,
        notification: {
          title: candidate.title,
          body: candidate.body
        },
        data: {
          href: candidate.href,
          type: candidate.type,
          tag: candidate.tag
        },
        webpush: {
          fcmOptions: { link: notificationLink(candidate.href) },
          notification: {
            icon: "/brand/ascend-logo.png",
            badge: "/brand/ascend-logo.png",
            tag: candidate.tag,
            renotify: false,
            requireInteraction: false
          }
        }
      });
      sent += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown_error";
      if (/registration-token-not-registered|invalid-registration-token/i.test(lastError)) {
        await query("update notification_devices set enabled = false, updated_at = now() where fcm_token = $1", [device.fcm_token]);
      }
    }
  }

  await logNotificationEvent(userId, candidate, sent > 0 ? "sent" : "error", sent > 0 ? null : lastError);
  return { sent, skipped: false };
}

export async function notifyHumanCoachEvent(input: {
  userId: string;
  event: "message" | "praise" | "mission" | "nutrition_plan";
  senderName?: string | null;
  missionTitle?: string | null;
}) {
  try {
    const candidate = NotificationEngine.select({
      now: new Date(),
      dna: AscendDNAService.buildProfile({ events: [], now: new Date() }),
      openedToday: false,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      trainerEvent: {
        type: input.event,
        senderName: input.senderName,
        missionTitle: input.missionTitle
      }
    });
    if (!candidate) return { sent: 0, skipped: true };
    return sendNotificationToUser(input.userId, candidate);
  } catch {
    return { sent: 0, skipped: true };
  }
}

async function buildDnaEvents(userId: string): Promise<AscendDnaEvent[]> {
  const result = await query<AscendDnaEvent>(
    `
    select 'food' as type, logged_at as "occurredAt" from food_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'water' as type, logged_at as "occurredAt" from water_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'weight' as type, logged_at as "occurredAt" from weight_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'activity' as type, created_at as "occurredAt" from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= now() - interval '28 days'
    union all select 'progress_photo' as type, logged_at as "occurredAt" from progress_photos where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'screen_open' as type, created_at as "occurredAt" from analytics_events where user_id = $1 and event_name = 'screen_open' and created_at >= now() - interval '28 days'
    `
    ,
    [userId]
  );
  return result.rows;
}

function dateKeyDaysAgo(todayKey: string, daysAgo: number) {
  const date = new Date(`${todayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function getCurrentStreak(userId: string) {
  const result = await query<{ activity_date: string }>(
    `
    select distinct to_char(activity_date::date, 'YYYY-MM-DD') as activity_date
    from (
      select logged_at::date as activity_date from food_logs where user_id = $1
      union all select logged_at::date from weight_logs where user_id = $1
      union all select logged_at::date from water_logs where user_id = $1
      union all select logged_at::date from habit_logs where user_id = $1 and completed = true
      union all select created_at::date from analytics_events where user_id = $1 and event_name = 'burn_log'
      union all select completed_at::date from trainer_missions where client_user_id = $1 and status = 'completed' and completed_at is not null
    ) activity
    where activity_date >= current_date - interval '120 days'
    order by activity_date desc
    `,
    [userId]
  );

  const todayResult = await query<{ today: string }>("select to_char(current_date, 'YYYY-MM-DD') as today");
  const activeDays = new Set(result.rows.map((row) => row.activity_date));
  const todayKey = todayResult.rows[0]?.today ?? new Date().toISOString().slice(0, 10);
  let currentStreak = 0;

  for (let index = 0; index < 120; index += 1) {
    const key = dateKeyDaysAgo(todayKey, index);
    if (!activeDays.has(key)) break;
    currentStreak += 1;
  }

  return currentStreak;
}

async function buildProactiveInsightForUser(userId: string, todayKey: string) {
  const [profileResult, recentFood, recentWater, recentBurns, recentWeights, momentumResult, healthSyncSummary, currentStreakResult, memoryResult, nutritionTargets] = await Promise.all([
    query<{
      goal_type: "fat_loss" | "muscle_gain" | "maintenance" | null;
      gender: "female" | "male" | "prefer_not_to_say" | null;
      age_years: string | number | null;
      activity_level: "low" | "moderate" | "high" | null;
      height_cm: string | number | null;
      starting_weight_kg: string | number | null;
      target_weight_kg: string | number | null;
    }>(
      `
      select goal_type, gender, age_years, activity_level, height_cm, starting_weight_kg, target_weight_kg
      from users
      where id = $1
      `,
      [userId]
    ),
    query<{ logged_date: string; calories: string | number; protein_g: string | number; meal_count: string | number }>(
      `
      select
        to_char(logged_at::date, 'YYYY-MM-DD') as logged_date,
        coalesce(sum(calories), 0) as calories,
        coalesce(sum(protein_g), 0) as protein_g,
        count(*) as meal_count
      from food_logs
      where user_id = $1
        and logged_at >= current_date - interval '2 days'
      group by logged_at::date
      order by logged_at::date desc
      `,
      [userId]
    ),
    query<{ water_today_ml: string | number }>(
      `
      select coalesce(sum(amount_ml), 0) as water_today_ml
      from water_logs
      where user_id = $1
        and logged_at::date = current_date
      `,
      [userId]
    ),
    query<{ metadata: Record<string, unknown> | null; created_at: string }>(
      `
      select metadata, created_at
      from analytics_events
      where user_id = $1
        and event_name = 'burn_log'
      order by created_at desc
      limit 7
      `,
      [userId]
    ),
    query<{ weight_kg: string | number; logged_at: string }>(
      `
      select weight_kg, logged_at
      from weight_logs
      where user_id = $1
      order by logged_at desc
      limit 2
      `,
      [userId]
    ),
    query<{ score: string | number }>(
      `
      select score
      from ${momentumScoreTable}
      where user_id = $1
      order by calculated_for_date desc
      limit 2
      `,
      [userId]
    ),
    getHealthSyncSummary(userId),
    getCurrentStreak(userId),
    query<{ title: string }>(
      `
      select title
      from ascend_memory_reflections
      where user_id = $1
      order by occurred_at desc
      limit 1
      `,
      [userId]
    ).catch(() => ({ rows: [] as Array<{ title: string }> })),
    resolveNutritionTargets(userId)
  ]);

  const foodByDate = new Map(recentFood.rows.map((row) => [row.logged_date, row]));
  const recent3Keys = Array.from({ length: 3 }, (_, index) => dateKeyDaysAgo(todayKey, index));
  const lowProteinDays3 = recent3Keys.filter((key) => Number(foodByDate.get(key)?.meal_count ?? 0) > 0 && Number(foodByDate.get(key)?.protein_g ?? 0) < nutritionTargets.proteinG * 0.6).length;
  const highCaloriesDays3 = recent3Keys.filter((key) => Number(foodByDate.get(key)?.meal_count ?? 0) > 0 && Number(foodByDate.get(key)?.calories ?? 0) > nutritionTargets.calories * 1.1).length;
  const lowCaloriesDays3 = recent3Keys.filter((key) => Number(foodByDate.get(key)?.meal_count ?? 0) > 0 && Number(foodByDate.get(key)?.calories ?? 0) < nutritionTargets.calories * 0.65).length;
  const todayFood = foodByDate.get(todayKey);
  const latestBurn = recentBurns.rows[0] ?? null;
  const latestBurnAt = latestBurn ? new Date(latestBurn.created_at).getTime() : null;
  const daysSinceWorkout = latestBurnAt ? Math.max(0, Math.floor((Date.now() - latestBurnAt) / 86_400_000)) : null;
  const latestWeight = recentWeights.rows[0] ? Number(recentWeights.rows[0].weight_kg) : null;
  const previousWeight = recentWeights.rows[1] ? Number(recentWeights.rows[1].weight_kg) : null;
  const currentMomentum = momentumResult.rows[0] ? Number(momentumResult.rows[0].score) : null;
  const previousMomentum = momentumResult.rows[1] ? Number(momentumResult.rows[1].score) : null;
  const profile = profileResult.rows[0];

  const insight = buildCoachZoeProactiveInsight({
    goalType: profile?.goal_type ?? null,
    currentStreak: currentStreakResult,
    momentumScore: currentMomentum,
    previousMomentumScore: previousMomentum,
    todaysFoodCount: Number(todayFood?.meal_count ?? 0),
    caloriesToday: Number(todayFood?.calories ?? 0),
    calorieTarget: nutritionTargets.calories,
    proteinTodayG: Number(todayFood?.protein_g ?? 0),
    proteinTargetG: nutritionTargets.proteinG,
    waterTodayMl: Number(recentWater.rows[0]?.water_today_ml ?? 0),
    waterTargetMl: nutritionTargets.waterMl,
    workoutDays7: recentBurns.rows.length,
    daysSinceWorkout,
    lowProteinDays3,
    highCaloriesDays3,
    lowCaloriesDays3,
    weightTrendKg: latestWeight !== null && previousWeight !== null ? latestWeight - previousWeight : null,
    latestWorkout: latestBurn
      ? {
          title: typeof latestBurn.metadata?.workoutTitle === "string" ? latestBurn.metadata.workoutTitle : null,
          type:
            typeof latestBurn.metadata?.workoutType === "string"
              ? latestBurn.metadata.workoutType
              : typeof latestBurn.metadata?.activityType === "string"
                ? latestBurn.metadata.activityType
                : null,
          completedToday: latestBurn.created_at.slice(0, 10) === todayKey,
          completedYesterday: latestBurn.created_at.slice(0, 10) === dateKeyDaysAgo(todayKey, 1)
        }
      : null,
    healthSync: healthSyncSummary
      ? {
          connected: healthSyncSummary.connected,
          todaySteps: healthSyncSummary.todaySteps,
          averageSteps7d: healthSyncSummary.averageSteps7d,
          todayActiveCalories: healthSyncSummary.todayActiveCalories,
          workoutsThisWeek: healthSyncSummary.workoutsThisWeek,
          workoutCompletedToday: healthSyncSummary.workoutCompletedToday
        }
      : null,
    recentMilestoneTitle: memoryResult.rows[0]?.title ?? null
  });

  return {
    title: "Today's Insight",
    body: insight.body,
    href: insight.href,
    dedupeKey: `proactive:${insight.key}:${todayKey}`
  };
}

type UnifiedNotificationInsight = Awaited<ReturnType<typeof getLatestCachedDailyCoachingInsight>>;

type UnifiedNotificationDependencies = {
  getCached?: typeof getLatestCachedDailyCoachingInsight;
  loadFacts?: typeof loadTodayPriorityFacts;
  resolveDecision?: typeof resolveDailyCoachingDecision;
};

export async function resolveUnifiedNotificationInsightForUser(
  userId: string,
  timezoneOffsetMinutes: number,
  dependencies: UnifiedNotificationDependencies = {}
): Promise<UnifiedNotificationInsight> {
  const getCached = dependencies.getCached ?? getLatestCachedDailyCoachingInsight;
  const loadFacts = dependencies.loadFacts ?? loadTodayPriorityFacts;
  const resolveDecision = dependencies.resolveDecision ?? resolveDailyCoachingDecision;
  const dayContext = buildTodayPriorityDayContext(timezoneOffsetMinutes);
  const cached = await getCached(
    userId,
    dayContext.localDate,
    timezoneOffsetMinutes,
    TODAY_PRIORITY_PROMPT_VERSION
  );
  if (cached) return cached;

  const { context, facts } = await loadFacts(userId, timezoneOffsetMinutes);
  const deterministic = deterministicTodayPriority(facts);
  const decision = await resolveDecision({
    userId,
    localDate: context.localDate,
    timezoneOffsetMinutes,
    expiresAt: context.dayEndUtc.toISOString(),
    facts,
    allowAiRefinement: false,
    legacyPriorityKey: deterministic.key
  });
  return decision.id ? { id: decision.id, insight: decision.insight } : null;
}

export async function runCoachNotificationJob(limit = 500) {
  const users = await query<{ id: string; email: string; timezone_offset_minutes: number | string }>(
    `
    select u.id, u.email, latest_device.timezone_offset_minutes
    from users u
    join lateral (
      select timezone_offset_minutes
      from notification_devices
      where user_id = u.id and enabled = true
      order by last_seen_at desc
      limit 1
    ) latest_device on true
    where u.status = 'active'
    order by u.id
    limit $1
    `,
    [limit]
  );

  let sent = 0;
  for (const user of users.rows) {
    const timezoneOffsetMinutes = Number(user.timezone_offset_minutes ?? 0);
    const localDayContext = buildTodayPriorityDayContext(timezoneOffsetMinutes);
    const todayKey = localDayContext.localDate;
    const rolloutMode = dailyCoachingRolloutMode({
      enabledForAll: env.DAILY_COACHING_DECISION_V1,
      shadowEnabled: env.DAILY_COACHING_DECISION_SHADOW,
      ownerPilotEnabled: env.DAILY_COACHING_DECISION_OWNER_PILOT,
      isPlatformOwner: isPlatformOwnerEmail(user.email)
    });
    let unifiedNotificationInsight: Awaited<ReturnType<typeof getLatestCachedDailyCoachingInsight>> = null;
    if (rolloutMode === "active") {
      try {
        unifiedNotificationInsight = await resolveUnifiedNotificationInsightForUser(user.id, timezoneOffsetMinutes);
        dailyCoachingTelemetry("notification_decision_resolved", {
          rolloutMode,
          correlation: dailyCoachingCorrelation(user.id),
          decisionAvailable: Boolean(unifiedNotificationInsight)
        });
      } catch (error) {
        dailyCoachingTelemetry("notification_decision_lookup_failed", {
          rolloutMode,
          correlation: dailyCoachingCorrelation(user.id),
          ...safeDailyCoachingError(error)
        }, "warn");
      }
    }
    const coachingNotificationSource = dailyCoachingNotificationSource(rolloutMode, Boolean(unifiedNotificationInsight));
    const [events, sentTodayResult, openedTodayResult, foodTodayResult, weeklyReflectionResult, proactiveInsight, nutritionTargets] = await Promise.all([
      buildDnaEvents(user.id),
      query<{
        coaching: string;
        celebration: string;
        trainer_message: string;
      }>(
        `
        select
          count(*) filter (where notification_type in ('next_best_move', 'weekly_reflection', 'proactive_coaching')) as coaching,
          count(*) filter (where notification_type = 'celebration') as celebration,
          count(*) filter (where notification_type in ('trainer_message', 'trainer_praise', 'trainer_mission', 'trainer_nutrition_plan')) as trainer_message
        from notification_events
        where user_id = $1 and created_at >= $2 and created_at < $3
        `,
        [user.id, localDayContext.dayStartUtc.toISOString(), localDayContext.dayEndUtc.toISOString()]
      ),
      query<{ opened: string }>(
        "select count(*) as opened from analytics_events where user_id = $1 and event_name = 'screen_open' and created_at >= $2 and created_at < $3",
        [user.id, localDayContext.dayStartUtc.toISOString(), localDayContext.dayEndUtc.toISOString()]
      ),
      query<{ food_count: string; protein_g: string; water_ml: string }>(
        `
        select
          (select count(*) from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3) as food_count,
          (select coalesce(sum(protein_g), 0) from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3) as protein_g,
          (select coalesce(sum(amount_ml), 0) from water_logs where user_id = $1 and logged_at >= $2 and logged_at < $3) as water_ml
        `,
        [user.id, localDayContext.dayStartUtc.toISOString(), localDayContext.dayEndUtc.toISOString()]
      ),
      query<{ report_count: string }>(
        "select count(*) as report_count from weekly_reports where user_id = $1 and created_at >= now() - interval '7 days'",
        [user.id]
      ),
      coachingNotificationSource === "unified" && unifiedNotificationInsight
        ? Promise.resolve({
            title: unifiedNotificationInsight.insight.title,
            body: unifiedNotificationInsight.insight.body,
            href: unifiedNotificationInsight.insight.href,
            dedupeKey: `daily-decision:${unifiedNotificationInsight.id}`
          })
        : coachingNotificationSource === "none"
          ? Promise.resolve(null)
          : buildProactiveInsightForUser(user.id, todayKey).catch(() => null),
      resolveNutritionTargets(user.id)
    ]);
    const now = new Date();
    const dna = AscendDNAService.buildProfile({ now, events, timezoneOffsetMinutes });
    const sentToday = sentTodayResult.rows[0];
    const foodToday = foodTodayResult.rows[0];
    const foodCount = Number(foodToday?.food_count ?? 0);
    const proteinLeft = Math.max(0, nutritionTargets.proteinG - Number(foodToday?.protein_g ?? 0));
    const waterLeftMl = Math.max(0, nutritionTargets.waterMl - Number(foodToday?.water_ml ?? 0));
    const nextBestMove = AscendDNAService.getNextBestMove({
      now,
      timezoneOffsetMinutes,
      dna,
      todaysFoodCount: foodCount,
      caloriesLeft: foodCount ? 0 : nutritionTargets.calories,
      calorieOver: 0,
      proteinLeft,
      waterLeftMl,
      completedHabits: 0,
      totalHabits: 0,
      todaysBurnCalories: 0,
      latestWeightLoggedToday: dna.daysSinceWeight === 0,
      progressPhotoDue: dna.progressPhotoConsistency < 25
    });
    const candidate = NotificationEngine.select({
      now,
      timezoneOffsetMinutes,
      dna,
      openedToday: Number(openedTodayResult.rows[0]?.opened ?? 0) > 0,
      prioritiesComplete: foodCount > 0 && proteinLeft <= 15 && waterLeftMl <= 250,
      sentToday: {
        coaching: Number(sentToday?.coaching ?? 0) > 0,
        celebration: Number(sentToday?.celebration ?? 0) > 0,
        trainerMessage: Number(sentToday?.trainer_message ?? 0) > 0
      },
      weeklyReflectionDue: now.getDay() === 1 && Number(weeklyReflectionResult.rows[0]?.report_count ?? 0) > 0,
      proactiveInsight,
      celebrationSignals: dna.currentStreak > dna.bestStreak && dna.currentStreak > 1
        ? [{ type: "longest_streak", value: dna.currentStreak }]
        : dna.averageWeeklyConsistency >= 85
          ? [{ type: "best_week" }]
          : [],
      nextBestMove: coachingNotificationSource === "legacy" ? nextBestMove : null
    });
    if (!candidate) continue;
    const result = await sendNotificationToUser(user.id, candidate);
    sent += result.sent;
  }

  return { usersChecked: users.rows.length, notificationsSent: sent };
}
