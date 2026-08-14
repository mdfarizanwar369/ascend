import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { query } from "../db/pool";
import { calculateComplianceScore } from "../domain/compliance";
import { requireAuth, requireRole } from "../middleware/auth";
import { canManageClient } from "../services/clientAccessService";
import { calculateAndStoreMomentumV2 } from "../services/momentumV2Service";
import { userDayUtcBounds, userLocalDateKey } from "../utils/userTime";

export const complianceRouter = Router();

function dateKeyDaysAgo(todayKey: string, daysAgo: number) {
  const date = new Date(`${todayKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

complianceRouter.get("/compliance/today", requireAuth, async (req, res) => {
  if (env.MOMENTUM_V2) {
    const momentum = await calculateAndStoreMomentumV2(req.user!.id);
    return res.json({
      compliance: {
        ...momentum,
        food_score: momentum.fuel_score,
        weight_score: momentum.move_score,
        water_score: momentum.recover_score,
        habit_score: momentum.focus_score ?? 0
      }
    });
  }
  const day = userDayUtcBounds(new Date(), req.user!.timezone);
  const weekStart = dateKeyDaysAgo(day.dateKey, 6);
  const [food, weight, water, habits] = await Promise.all([
    query<{ count: string }>(
      "select count(*) from food_logs where user_id = $1 and logged_at >= $2 and logged_at < $3",
      [req.user!.id, day.start, day.end]
    ),
    query<{ count: string }>(
      "select count(*) from weight_logs where user_id = $1 and (logged_at at time zone $2)::date >= $3::date",
      [req.user!.id, req.user!.timezone, weekStart]
    ),
    query<{ total_ml: string | null }>(
      "select coalesce(sum(amount_ml), 0) as total_ml from water_logs where user_id = $1 and logged_at >= $2 and logged_at < $3",
      [req.user!.id, day.start, day.end]
    ),
    query<{ assigned: string; completed: string }>(
      `
      select
        count(h.id) as assigned,
        count(distinct hl.habit_id) filter (where hl.completed = true) as completed
      from habits h
      left join habit_logs hl on hl.habit_id = h.id
        and hl.user_id = h.user_id
        and hl.logged_at >= $2 and hl.logged_at < $3
      where h.user_id = $1 and h.active = true
      `,
      [req.user!.id, day.start, day.end]
    )
  ]);

  const score = calculateComplianceScore({
    foodLogsToday: Number(food.rows[0]?.count ?? 0),
    weightLogsThisWeek: Number(weight.rows[0]?.count ?? 0),
    waterMlToday: Number(water.rows[0]?.total_ml ?? 0),
    waterTargetMl: 2500,
    habitsCompletedToday: Number(habits.rows[0]?.completed ?? 0),
    habitsAssignedToday: Number(habits.rows[0]?.assigned ?? 0)
  });

  const result = await query(
    `
    insert into compliance_scores (
      user_id, score, food_score, weight_score, water_score, habit_score, calculated_for_date
    )
    values ($1, $2, $3, $4, $5, $6, $7::date)
    on conflict (user_id, calculated_for_date)
    do update set
      score = excluded.score,
      food_score = excluded.food_score,
      weight_score = excluded.weight_score,
      water_score = excluded.water_score,
      habit_score = excluded.habit_score,
      created_at = now()
    returning *
    `,
    [req.user!.id, score.totalScore, score.foodScore, score.weightScore, score.waterScore, score.habitScore, day.dateKey]
  );

  res.json({ compliance: result.rows[0] });
});

complianceRouter.get("/compliance/history", requireAuth, async (req, res) => {
  if (env.MOMENTUM_V2) {
    const result = await query(
      "select * from momentum_scores_v2 where user_id = $1 order by calculated_for_date desc limit 30",
      [req.user!.id]
    );
    return res.json({ compliance: result.rows });
  }
  const result = await query(
    "select * from compliance_scores where user_id = $1 order by calculated_for_date desc limit 30",
    [req.user!.id]
  );
  res.json({ compliance: result.rows });
});

const recoveryCheckinSchema = z.object({
  sleepQuality: z.enum(["poor", "okay", "good"])
});

complianceRouter.get("/recovery-checkins/today", requireAuth, async (req, res) => {
  const today = userLocalDateKey(new Date(), req.user!.timezone);
  const result = await query(
    "select * from recovery_checkins where user_id = $1 and checkin_date = $2::date limit 1",
    [req.user!.id, today]
  );
  res.json({ checkin: result.rows[0] ?? null });
});

complianceRouter.post("/recovery-checkins", requireAuth, async (req, res) => {
  const input = recoveryCheckinSchema.parse(req.body);
  const today = userLocalDateKey(new Date(), req.user!.timezone);
  const result = await query(
    `
    insert into recovery_checkins (user_id, checkin_date, sleep_quality)
    values ($1, $2::date, $3)
    on conflict (user_id, checkin_date) do update set sleep_quality = excluded.sleep_quality, updated_at = now()
    returning *
    `,
    [req.user!.id, today, input.sleepQuality]
  );
  if (env.MOMENTUM_V2) await calculateAndStoreMomentumV2(req.user!.id);
  res.status(201).json({ checkin: result.rows[0] });
});

complianceRouter.get("/streaks/me", requireAuth, async (req, res) => {
  const todayKey = userLocalDateKey(new Date(), req.user!.timezone);
  const result = await query<{ activity_date: string }>(
    `
    select distinct to_char(activity_date::date, 'YYYY-MM-DD') as activity_date
    from (
      select (logged_at at time zone $2)::date as activity_date from food_logs where user_id = $1
      union all select (logged_at at time zone $2)::date from weight_logs where user_id = $1
      union all select (logged_at at time zone $2)::date from water_logs where user_id = $1
      union all select (logged_at at time zone $2)::date from habit_logs where user_id = $1 and completed = true
      union all select (created_at at time zone $2)::date from analytics_events where user_id = $1 and event_name = 'burn_log'
      union all select (completed_at at time zone $2)::date from trainer_missions where client_user_id = $1 and status = 'completed' and completed_at is not null
    ) activity
    where activity_date >= $3::date - interval '120 days'
    order by activity_date desc
    `,
    [req.user!.id, req.user!.timezone, todayKey]
  );
  const activeDays = new Set(result.rows.map((row) => row.activity_date));
  let currentStreak = 0;

  for (let index = 0; index < 120; index += 1) {
    const key = dateKeyDaysAgo(todayKey, index);
    if (!activeDays.has(key)) break;
    currentStreak += 1;
  }

  let bestStreak = 0;
  let runningStreak = 0;
  for (let index = 119; index >= 0; index -= 1) {
    const key = dateKeyDaysAgo(todayKey, index);
    if (activeDays.has(key)) {
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  const activeDaysThisWeek = Array.from({ length: 7 }, (_, index) => dateKeyDaysAgo(todayKey, index)).filter((key) =>
    activeDays.has(key)
  ).length;

  res.json({
    streak: {
      current: currentStreak,
      best: bestStreak,
      activeDaysThisWeek,
      checkedInToday: activeDays.has(todayKey)
    }
  });
});

complianceRouter.get(
  "/trainer/clients/:clientId/compliance",
  requireAuth,
  requireRole(["trainer", "admin", "owner"]),
  async (req, res) => {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select cs.*
      from ${env.MOMENTUM_V2 ? "momentum_scores_v2" : "compliance_scores"} cs
      join users u on u.id = cs.user_id
      where cs.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      order by cs.calculated_for_date desc
      limit 30
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
    );
    res.json({ compliance: result.rows });
  }
);
