import { env } from "../config/env";
import { query } from "../db/pool";
import { createAscendMemoryReflection } from "../integrations/openai";
import { logAiUsage } from "./aiUsageService";
import { bodyCompositionScanFromDb, buildBodyCompositionSummary } from "./bodyCompositionService";

type MemoryEvent = {
  milestoneKey: string;
  type: string;
  title: string;
  subtitle: string;
  occurredAt: string;
  priority: number;
  metadata?: Record<string, unknown>;
};

export type AscendMemoryTimelineItem = MemoryEvent & {
  id?: string;
  reflection?: string | null;
  aiGenerated?: boolean;
  imageUrl?: string | null;
};

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value?: string | Date | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function round(value: number | null, decimals = 1) {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function ensureAscendMemorySchema() {
  await query(`
    create table if not exists ascend_memory_reflections (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      milestone_key text not null,
      milestone_type text not null,
      title text not null,
      subtitle text not null,
      reflection text not null,
      ai_generated boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      occurred_at timestamptz not null,
      created_at timestamptz not null default now(),
      unique (user_id, milestone_key)
    );

    create index if not exists ascend_memory_user_occurred_idx
      on ascend_memory_reflections(user_id, occurred_at desc);
  `);
}

async function activeClientContext(userId: string) {
  const result = await query<{
    id: string;
    full_name: string | null;
    email: string;
    goal_type: string | null;
    starting_weight_kg: string | number | null;
    target_weight_kg: string | number | null;
    gym_id: string | null;
    athlete_mode_enabled: boolean;
    current_plan: "free" | "premium" | "trainer_pro";
    subscription_status: string | null;
    created_at: string;
  }>(
    `
    select u.id, u.full_name, u.email, u.goal_type, u.starting_weight_kg, u.target_weight_kg, u.gym_id,
      coalesce(ap.enabled, false) as athlete_mode_enabled,
      coalesce(active_subscription.plan::text, 'free') as current_plan,
      active_subscription.status as subscription_status,
      u.created_at
    from users u
    left join athlete_profiles ap on ap.user_id = u.id
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
    where u.id = $1
      and u.status = 'active'
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function activityStreaks(userId: string) {
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
    where activity_date >= current_date - interval '180 days'
    order by activity_date asc
    `,
    [userId]
  );
  const days = result.rows.map((row) => row.activity_date);
  let best = 0;
  let run = 0;
  let bestDate: string | null = null;
  let previous: Date | null = null;
  for (const key of days) {
    const current = new Date(`${key}T00:00:00Z`);
    const diff = previous ? Math.round((current.getTime() - previous.getTime()) / 86_400_000) : 1;
    run = diff === 1 ? run + 1 : 1;
    if (run > best) {
      best = run;
      bestDate = key;
    }
    previous = current;
  }
  const activeDays7 = days.filter((key) => new Date(`${key}T00:00:00Z`).getTime() >= Date.now() - 7 * 86_400_000).length;
  return { best, bestDate, activeDays7 };
}

async function buildMemoryEvents(userId: string, context: NonNullable<Awaited<ReturnType<typeof activeClientContext>>>) {
  const [
    food,
    weights,
    workouts,
    progressPhotos,
    scans,
    milestones,
    recognitions,
    coachPresence,
    weeklyReports,
    coachHomework,
    streak,
    monthlyConsistency
  ] = await Promise.all([
    query<{ first_at: string | null; days_30: string | number; total: string | number }>(
      "select min(logged_at) as first_at, count(distinct logged_at::date) filter (where logged_at >= current_date - interval '29 days') as days_30, count(*) as total from food_logs where user_id = $1",
      [userId]
    ),
    query<{ weight_kg: string | number; logged_at: string }>(
      "select weight_kg, logged_at from weight_logs where user_id = $1 order by logged_at asc",
      [userId]
    ),
    query<{ created_at: string; metadata: Record<string, unknown> | null }>(
      `
      select created_at, metadata
      from analytics_events
      where user_id = $1
        and event_name = 'burn_log'
      order by created_at asc
      `,
      [userId]
    ),
    query<{ logged_at: string; image_url: string | null }>(
      `
      select logged_at, image_url
      from progress_photos
      where user_id = $1
      order by logged_at asc
      `,
      [userId]
    ),
    query("select * from body_composition_scans where user_id = $1 and user_confirmed = true order by scan_date asc, created_at asc", [userId]),
    query<{ milestone_type: string; achieved_weight_kg: string | number | null; achieved_at: string }>(
      "select milestone_type, achieved_weight_kg, achieved_at from goal_milestones where user_id = $1 order by achieved_at asc",
      [userId]
    ),
    query<{ count: string | number; latest_at: string | null }>(
      "select count(*) as count, max(created_at) as latest_at from trainer_recognitions where client_user_id = $1",
      [userId]
    ),
    query<{ count: string | number; latest_at: string | null }>(
      "select count(*) as count, max(created_at) as latest_at from coach_presence_messages where user_id = $1",
      [userId]
    ),
    query<{ count: string | number; latest_at: string | null }>(
      "select count(*) as count, max(created_at) as latest_at from weekly_reports where user_id = $1",
      [userId]
    ),
    query<{
      id: string;
      title: string;
      assignment_date: string;
      due_date: string;
      status: string;
      completed_at: string | null;
      coach_note: string | null;
      trainer_name: string | null;
      completed_burn_log_id: string | null;
    }>(
      `
      select tha.id, tha.title, tha.assignment_date, tha.due_date, tha.status, tha.completed_at, tha.coach_note,
        assigned_by.full_name as trainer_name, tha.completed_burn_log_id
      from trainer_homework_assignments tha
      join users assigned_by on assigned_by.id = tha.assigned_by_user_id
      where tha.client_id = $1
      order by tha.assignment_date asc, tha.created_at asc
      limit 24
      `,
      [userId]
    ).catch(() => ({ rows: [] as Array<{
      id: string;
      title: string;
      assignment_date: string;
      due_date: string;
      status: string;
      completed_at: string | null;
      coach_note: string | null;
      trainer_name: string | null;
      completed_burn_log_id: string | null;
    }> })),
    activityStreaks(userId),
    query<{ month_key: string; active_days: string | number }>(
      `
      with activity as (
        select logged_at::date as activity_date from food_logs where user_id = $1 and logged_at >= current_date - interval '180 days'
        union
        select logged_at::date from weight_logs where user_id = $1 and logged_at >= current_date - interval '180 days'
        union
        select logged_at::date from water_logs where user_id = $1 and logged_at >= current_date - interval '180 days'
        union
        select logged_at::date from habit_logs where user_id = $1 and completed = true and logged_at >= current_date - interval '180 days'
        union
        select created_at::date from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= now() - interval '180 days'
      )
      select to_char(date_trunc('month', activity_date), 'YYYY-MM') as month_key, count(distinct activity_date)::int as active_days
      from activity
      group by 1
      order by 1 asc
      `,
      [userId]
    )
  ]);

  const events: MemoryEvent[] = [{
    milestoneKey: "started-journey",
    type: "started_journey",
    title: "Started Journey",
    subtitle: "Your Ascend story began here.",
    occurredAt: isoDate(context.created_at),
    priority: 1,
    metadata: { goal: context.goal_type }
  }];

  const firstFood = food.rows[0]?.first_at;
  if (firstFood) {
    events.push({
      milestoneKey: "first-ai-meal",
      type: "first_meal",
      title: "First Meal Logged",
      subtitle: "You made your nutrition visible for the first time.",
      occurredAt: isoDate(firstFood),
      priority: 2,
      metadata: { totalMeals: Number(food.rows[0]?.total ?? 0), foodDays30: Number(food.rows[0]?.days_30 ?? 0) }
    });
  }

  const firstWorkoutAt = workouts.rows[0]?.created_at ?? null;
  if (firstWorkoutAt) {
    const workoutName = String(workouts.rows[0]?.metadata?.workoutTitle ?? workouts.rows[0]?.metadata?.activityType ?? "First workout");
    events.push({
      milestoneKey: "first-workout",
      type: "first_workout",
      title: "First Workout Completed",
      subtitle: workoutName,
      occurredAt: isoDate(firstWorkoutAt),
      priority: 5,
      metadata: { totalWorkouts: workouts.rows.length }
    });
  }

  const firstPhotoAt = progressPhotos.rows[0]?.logged_at ?? null;
  if (firstPhotoAt) {
    events.push({
      milestoneKey: "first-progress-photo",
      type: "first_photo",
      title: "First Progress Photo",
      subtitle: "You started tracking change that the scale can miss.",
      occurredAt: isoDate(firstPhotoAt),
      priority: 4,
      metadata: { totalPhotos: progressPhotos.rows.length }
    });
  }

  for (const threshold of [7, 14, 30, 90]) {
    if (streak.best >= threshold) {
      events.push({
        milestoneKey: `streak-${threshold}`,
        type: "streak",
        title: `${threshold}-Day Streak`,
        subtitle: "You kept showing up long enough for consistency to become visible.",
        occurredAt: isoDate(streak.bestDate),
        priority: threshold >= 30 ? 8 : 5,
        metadata: { bestStreak: streak.best, activeDays7: streak.activeDays7 }
      });
    }
  }

  const weightRows = weights.rows;
  if (weightRows[0]?.logged_at) {
    events.push({
      milestoneKey: "first-weight",
      type: "first_weight",
      title: "First Weight Logged",
      subtitle: "You gave your journey a measurable starting point.",
      occurredAt: isoDate(weightRows[0].logged_at),
      priority: 3,
      metadata: { firstWeightKg: numberValue(weightRows[0].weight_kg) }
    });
  }
  const firstWeight = numberValue(weightRows[0]?.weight_kg ?? context.starting_weight_kg);
  const latestWeight = numberValue(weightRows[weightRows.length - 1]?.weight_kg);
  if (firstWeight !== null && latestWeight !== null) {
    const change = round(latestWeight - firstWeight, 1);
    const loss = firstWeight - latestWeight;
    for (const threshold of [5, 10, 20]) {
      if (loss >= threshold) {
        events.push({
          milestoneKey: `weight-loss-${threshold}`,
          type: "weight_milestone",
          title: `Lost First ${threshold}kg`,
          subtitle: "Your scale trend shows a meaningful change from where you started.",
          occurredAt: isoDate(weightRows[weightRows.length - 1]?.logged_at),
          priority: threshold >= 10 ? 9 : 6,
          metadata: { startingWeightKg: firstWeight, currentWeightKg: latestWeight, weightChangeKg: change }
        });
      }
    }
  }

  const lowestWeight = weightRows.reduce<{ value: number | null; loggedAt: string | null }>(
    (best, row) => {
      const value = numberValue(row.weight_kg);
      if (value === null) return best;
      if (best.value === null || value < best.value) return { value, loggedAt: row.logged_at };
      return best;
    },
    { value: null, loggedAt: null }
  );
  if (lowestWeight.value !== null && lowestWeight.loggedAt && weightRows.length >= 3) {
    events.push({
      milestoneKey: "lowest-weight",
      type: "lowest_weight",
      title: "Lowest Recorded Weight",
      subtitle: `${lowestWeight.value}kg is your lightest logged point so far.`,
      occurredAt: isoDate(lowestWeight.loggedAt),
      priority: 5,
      metadata: { lowestWeightKg: lowestWeight.value }
    });
  }

  for (const milestone of milestones.rows) {
    if (milestone.milestone_type === "target_reached") {
      events.push({
        milestoneKey: "goal-reached",
        type: "goal_reached",
        title: "Goal Reached",
        subtitle: "You reached the goal you set for this phase.",
        occurredAt: isoDate(milestone.achieved_at),
        priority: 20,
        metadata: { achievedWeightKg: numberValue(milestone.achieved_weight_kg) }
      });
    }
  }

  const scanRows = scans.rows.map(bodyCompositionScanFromDb);
  if (scanRows[0]) {
    events.push({
      milestoneKey: "first-body-scan",
      type: "body_scan",
      title: "First Body Scan",
      subtitle: "You created a deeper baseline than weight alone.",
      occurredAt: isoDate(scanRows[0].scanDate),
      priority: 7,
      metadata: { bodyFatPercent: scanRows[0].bodyFatPercent, skeletalMuscleMassKg: scanRows[0].skeletalMuscleMassKg }
    });
  }
  if (scanRows[1]) {
    events.push({
      milestoneKey: "second-body-scan",
      type: "body_scan",
      title: "Second Body Scan",
      subtitle: "Now Ascend can compare change over time.",
      occurredAt: isoDate(scanRows[1].scanDate),
      priority: 8,
      metadata: { bodyFatPercent: scanRows[1].bodyFatPercent, skeletalMuscleMassKg: scanRows[1].skeletalMuscleMassKg }
    });
  }
  if (scanRows.length >= 2) {
    const summary = buildBodyCompositionSummary(scanRows);
    const dnaChange = numberValue(summary.dnaScore.change);
    const firstScan = scanRows[0];
    const latestScan = scanRows[scanRows.length - 1];
    const bodyFatChange = numberValue(firstScan.bodyFatPercent) !== null && numberValue(latestScan.bodyFatPercent) !== null
      ? round(Number(firstScan.bodyFatPercent) - Number(latestScan.bodyFatPercent), 1)
      : null;
    const muscleChange = numberValue(firstScan.skeletalMuscleMassKg) !== null && numberValue(latestScan.skeletalMuscleMassKg) !== null
      ? round(Number(latestScan.skeletalMuscleMassKg) - Number(firstScan.skeletalMuscleMassKg), 1)
      : null;
    if ((dnaChange ?? 0) >= 6 || (bodyFatChange ?? 0) >= 3 || (muscleChange ?? 0) >= 1) {
      events.push({
        milestoneKey: "dna-improved",
        type: "dna_improved",
        title: "Ascend DNA Improved",
        subtitle: "Your body composition trend is moving in a better direction.",
        occurredAt: isoDate(latestScan.scanDate),
        priority: 12,
        metadata: { dnaChange, bodyFatChange, muscleChange }
      });
    }
  }

  if (Number(recognitions.rows[0]?.count ?? 0) >= 3) {
    events.push({
      milestoneKey: "coach-recognition-3",
      type: "coach_recognition",
      title: "Coach Recognition",
      subtitle: "Your trainer has recognised your effort several times.",
      occurredAt: isoDate(recognitions.rows[0]?.latest_at),
      priority: 6,
      metadata: { recognitions: Number(recognitions.rows[0]?.count ?? 0) }
    });
  }

  if (Number(coachPresence.rows[0]?.count ?? 0) >= 5) {
    events.push({
      milestoneKey: "coach-presence-5",
      type: "weekly_highlight",
      title: "Momentum Noticed",
      subtitle: "Ascend has had enough signals to reflect your consistency between sessions.",
      occurredAt: isoDate(coachPresence.rows[0]?.latest_at),
      priority: 4,
      metadata: { coachPresenceMessages: Number(coachPresence.rows[0]?.count ?? 0) }
    });
  }

  if (Number(weeklyReports.rows[0]?.count ?? 0) >= 4) {
    events.push({
      milestoneKey: "first-month-completed",
      type: "first_month",
      title: "First Month Completed",
      subtitle: "You have enough weekly history to see patterns, not just single days.",
      occurredAt: isoDate(weeklyReports.rows[0]?.latest_at),
      priority: 10,
      metadata: { weeklyReports: Number(weeklyReports.rows[0]?.count ?? 0) }
    });
  }

  const bestMonth = [...monthlyConsistency.rows]
    .map((row) => ({ monthKey: row.month_key, activeDays: Number(row.active_days ?? 0) }))
    .sort((left, right) => right.activeDays - left.activeDays || right.monthKey.localeCompare(left.monthKey))[0];
  if (bestMonth && bestMonth.activeDays >= 10) {
    events.push({
      milestoneKey: `best-month-${bestMonth.monthKey}`,
      type: "best_month",
      title: "Best Month So Far",
      subtitle: `${bestMonth.activeDays} active days made this your strongest month yet.`,
      occurredAt: isoDate(`${bestMonth.monthKey}-28`),
      priority: 9,
      metadata: { monthKey: bestMonth.monthKey, activeDays: bestMonth.activeDays }
    });
  }

  for (const homework of coachHomework.rows) {
    const trainerName = homework.trainer_name ?? "your coach";
    events.push({
      milestoneKey: `coach-homework-assigned-${homework.id}`,
      type: "coach_homework_assigned",
      title: "Coach Homework Assigned",
      subtitle: `${trainerName} assigned ${homework.title}.`,
      occurredAt: isoDate(homework.assignment_date),
      priority: 4,
      metadata: {
        trainerName,
        dueDate: homework.due_date,
        status: homework.status,
        coachNote: homework.coach_note
      }
    });

    if (homework.completed_at) {
      events.push({
        milestoneKey: `coach-homework-completed-${homework.id}`,
        type: "coach_homework_completed",
        title: "Coach Homework Completed",
        subtitle: `${homework.title} completed for ${trainerName}.`,
        occurredAt: isoDate(homework.completed_at),
        priority: 6,
        metadata: {
          trainerName,
          completedBurnLogId: homework.completed_burn_log_id,
          coachNote: homework.coach_note
        }
      });
    }
  }

  const activityDays = await query<{ activity_date: string }>(
    `
    select distinct to_char(activity_date::date, 'YYYY-MM-DD') as activity_date
    from (
      select logged_at::date as activity_date from food_logs where user_id = $1
      union all select logged_at::date from weight_logs where user_id = $1
      union all select logged_at::date from water_logs where user_id = $1
      union all select logged_at::date from habit_logs where user_id = $1 and completed = true
      union all select created_at::date from analytics_events where user_id = $1 and event_name = 'burn_log'
    ) activity
    order by activity_date asc
    `,
    [userId]
  );
  for (let index = 1; index < activityDays.rows.length; index += 1) {
    const previous = new Date(`${activityDays.rows[index - 1].activity_date}T00:00:00Z`);
    const current = new Date(`${activityDays.rows[index].activity_date}T00:00:00Z`);
    const gap = Math.round((current.getTime() - previous.getTime()) / 86_400_000);
    if (gap >= 14) {
      events.push({
        milestoneKey: `comeback-${activityDays.rows[index].activity_date}`,
        type: "comeback",
        title: "Comeback After A Break",
        subtitle: `You came back after ${gap} days away. That return matters.`,
        occurredAt: isoDate(activityDays.rows[index].activity_date),
        priority: 11,
        metadata: { gapDays: gap }
      });
    }
  }

  return events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

function deterministicReflection(event: MemoryEvent) {
  if (event.type === "streak") return "This milestone matters because you repeated small actions long enough for them to become visible. Keep comparing yourself to the version of you that started.";
  if (event.type === "body_scan") return "This scan gives your journey a clearer baseline. The value is not in one number, but in being able to see what changes over time.";
  if (event.type === "goal_reached") return "You reached the target for this phase. Take the win, then work with your coach to decide what the next version of progress should look like.";
  if (event.type === "weight_milestone") return "Your weight trend shows real change from where you started. The consistency behind that change is the part worth protecting.";
  return "This is part of your Ascend story. Small actions become meaningful when you can look back and see that you kept going.";
}

function reflectionContext(event: MemoryEvent, context: NonNullable<Awaited<ReturnType<typeof activeClientContext>>>, events: MemoryEvent[]) {
  return JSON.stringify({
    currentDate: new Date().toISOString().slice(0, 10),
    milestone: event,
    member: {
      name: context.full_name,
      goal: context.goal_type,
      startingWeightKg: context.starting_weight_kg,
      targetWeightKg: context.target_weight_kg,
      athleteMode: context.athlete_mode_enabled
    },
    journeySignals: events.slice(0, 8).map((item) => ({
      title: item.title,
      subtitle: item.subtitle,
      type: item.type,
      occurredAt: item.occurredAt,
      metadata: item.metadata
    }))
  });
}

async function maybeCreateReflection(userId: string, context: NonNullable<Awaited<ReturnType<typeof activeClientContext>>>, events: MemoryEvent[]) {
  const candidates = [...events].sort((a, b) => b.priority - a.priority || new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const existing = await query<{ milestone_key: string }>("select milestone_key from ascend_memory_reflections where user_id = $1", [userId]);
  const existingKeys = new Set(existing.rows.map((row) => row.milestone_key));
  const candidate = candidates.find((event) => !existingKeys.has(event.milestoneKey) && event.priority >= 5);
  if (!candidate) return;

  const monthly = await query<{ count: string | number }>(
    "select count(*) as count from ascend_memory_reflections where user_id = $1 and ai_generated = true and created_at >= date_trunc('month', now())",
    [userId]
  );
  const monthlyAiCount = Number(monthly.rows[0]?.count ?? 0);
  let reflection = deterministicReflection(candidate);
  let aiGenerated = false;

  if (monthlyAiCount < 4) {
    try {
      reflection = await createAscendMemoryReflection(reflectionContext(candidate, context, events));
      aiGenerated = true;
      await logAiUsage({
        userId,
        gymId: context.gym_id,
        eventType: "memory_reflection",
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        status: "success",
        inputUnits: reflectionContext(candidate, context, events).length,
        outputUnits: reflection.length,
        metadata: { milestoneKey: candidate.milestoneKey, milestoneType: candidate.type }
      });
    } catch {
      await logAiUsage({
        userId,
        gymId: context.gym_id,
        eventType: "memory_reflection",
        provider: env.AI_PROVIDER,
        model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
        status: "fallback",
        metadata: { milestoneKey: candidate.milestoneKey, milestoneType: candidate.type }
      }).catch(() => undefined);
    }
  }

  await query(
    `
    insert into ascend_memory_reflections (
      user_id, milestone_key, milestone_type, title, subtitle, reflection, ai_generated, metadata, occurred_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (user_id, milestone_key) do nothing
    `,
    [
      userId,
      candidate.milestoneKey,
      candidate.type,
      candidate.title,
      candidate.subtitle,
      reflection,
      aiGenerated,
      candidate.metadata ?? {},
      candidate.occurredAt
    ]
  );
}

export async function getAscendMemoryTimeline(userId: string) {
  const context = await activeClientContext(userId);
  if (!context) return { timeline: [], stats: { aiReflectionsThisMonth: 0, monthlyLimit: 4, cacheHits: 0 }, access: "none" as const };
  const events = await buildMemoryEvents(userId, context);
  const premiumAccess =
    (context.current_plan === "premium" || context.current_plan === "trainer_pro") &&
    (context.subscription_status === null || ["active", "trialing", "past_due", "canceled"].includes(context.subscription_status));

  if (premiumAccess) {
    await maybeCreateReflection(userId, context, events);
  }

  const reflections = await query<{
    id: string;
    milestone_key: string;
    reflection: string;
    ai_generated: boolean;
  }>(
    "select id, milestone_key, reflection, ai_generated from ascend_memory_reflections where user_id = $1",
    [userId]
  );
  const reflectionMap = new Map(reflections.rows.map((row) => [row.milestone_key, row]));
  const monthly = premiumAccess
    ? await query<{ count: string | number }>(
        "select count(*) as count from ascend_memory_reflections where user_id = $1 and ai_generated = true and created_at >= date_trunc('month', now())",
        [userId]
      )
    : { rows: [{ count: 0 }] };

  const timeline: AscendMemoryTimelineItem[] = events.map((event) => {
    const reflection = reflectionMap.get(event.milestoneKey);
    return {
      ...event,
      id: reflection?.id,
      reflection: premiumAccess ? reflection?.reflection ?? null : null,
      aiGenerated: premiumAccess ? reflection?.ai_generated ?? false : false
    };
  });

  return {
    access: context.athlete_mode_enabled ? "athlete" as const : premiumAccess ? "premium" as const : "free" as const,
    timeline: premiumAccess ? timeline : timeline.slice(0, 12),
    stats: {
      aiReflectionsThisMonth: Number(monthly.rows[0]?.count ?? 0),
      monthlyLimit: 4,
      cacheHits: premiumAccess ? timeline.filter((item) => item.reflection).length : 0
    }
  };
}
