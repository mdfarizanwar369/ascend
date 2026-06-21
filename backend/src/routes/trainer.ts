import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createWeeklySummary } from "../integrations/openai";
import { createReadUrl } from "../integrations/s3";
import { logAiUsage } from "../services/aiUsageService";
import { env } from "../config/env";
import { withProfilePhotoUrl, withProfilePhotoUrls } from "../services/profilePhotoService";
import { getAdminGymScope } from "../services/adminScopeService";
import { canManageClient } from "../services/clientAccessService";
import { getProgressComparison } from "../services/progressComparisonService";

export const trainerRouter = Router();

async function withFoodImageUrls<T extends { image_s3_key?: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_url: await createReadUrl(row.image_s3_key)
    }))
  );
}

function daysSince(value?: string | Date | null) {
  if (!value) return 999;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 999;
  return Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
}

function isWeightMovingAway(row: {
  goal_type?: string | null;
  latest_weight_kg?: string | number | null;
  previous_weight_kg?: string | number | null;
  target_weight_kg?: string | number | null;
}) {
  const latest = Number(row.latest_weight_kg);
  const previous = Number(row.previous_weight_kg);
  const target = Number(row.target_weight_kg);
  if (!Number.isFinite(latest) || !Number.isFinite(previous)) return false;

  if (row.goal_type === "fat_loss") return latest > previous + 0.5;
  if (row.goal_type === "muscle_gain") return latest < previous - 0.5;
  if (row.goal_type === "maintenance" && Number.isFinite(target)) {
    return Math.abs(latest - target) > Math.abs(previous - target) + 0.5;
  }
  return false;
}

function attentionReason(row: {
  current_score?: string | number | null;
  previous_score?: string | number | null;
  last_food_logged_at?: string | null;
  last_water_logged_at?: string | null;
  last_activity_at?: string | null;
  missed_missions?: string | number | null;
  goal_type?: string | null;
  latest_weight_kg?: string | number | null;
  previous_weight_kg?: string | number | null;
  target_weight_kg?: string | number | null;
}) {
  const currentScore = Number(row.current_score);
  const previousScore = Number(row.previous_score);
  const scoreDrop = Number.isFinite(currentScore) && Number.isFinite(previousScore) ? previousScore - currentScore : 0;
  const foodGap = daysSince(row.last_food_logged_at);
  const waterGap = daysSince(row.last_water_logged_at);
  const inactiveDays = daysSince(row.last_activity_at);
  const missedMissions = Number(row.missed_missions ?? 0);

  if (missedMissions > 0) return { priority: 95, reason: "Missed trainer mission", detail: "A quick nudge may help them complete the task." };
  if (inactiveDays >= 7) return { priority: 90, reason: `Quiet for ${inactiveDays} days`, detail: "They may need a simple check-in." };
  if (foodGap >= 3) return { priority: 85, reason: `No food logs for ${foodGap} days`, detail: "Food logging has gone quiet." };
  if (scoreDrop >= 30) return { priority: 80, reason: `Momentum dropped ${Math.round(scoreDrop)} points`, detail: "Their routine may have slipped this week." };
  if (isWeightMovingAway(row)) return { priority: 75, reason: "Weight trend needs review", detail: "Their latest weigh-in is moving away from the goal." };
  if (waterGap >= 3) return { priority: 60, reason: `No water logs for ${waterGap} days`, detail: "A light reminder may be enough." };
  if (Number.isFinite(currentScore) && currentScore < 50) return { priority: 55, reason: "Momentum is low", detail: "They may benefit from encouragement." };
  return null;
}

async function createPraiseMessage(clientId: string) {
  const result = await query<{
    food_today: string | number;
    completed_mission_today: string | number;
    active_days: string | number;
    last_activity_at: string | null;
  }>(
    `
    select
      (select count(*) from food_logs where user_id = $1 and logged_at::date = current_date) as food_today,
      (select count(*) from trainer_missions where client_user_id = $1 and status = 'completed' and completed_at::date = current_date) as completed_mission_today,
      (
        select count(distinct activity_at::date)
        from (
          select logged_at as activity_at from food_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from weight_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from water_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
          union all select logged_at from habit_logs where user_id = $1 and logged_at >= current_date - interval '6 days'
        ) activity
      ) as active_days,
      (
        select max(activity_at)
        from (
          select logged_at as activity_at from food_logs where user_id = $1
          union all select logged_at from weight_logs where user_id = $1
          union all select logged_at from water_logs where user_id = $1
          union all select logged_at from habit_logs where user_id = $1
        ) last_activity
      ) as last_activity_at
    `,
    [clientId]
  );
  const row = result.rows[0];
  const daysSinceActivity = daysSince(row.last_activity_at);

  if (Number(row.completed_mission_today) > 0) {
    return { signal: "mission", message: "Your trainer noticed you completed today's mission. Great work." };
  }
  if (Number(row.food_today) > 0) {
    return { signal: "food_logging", message: "Your trainer noticed your food logging today. Great work." };
  }
  if (Number(row.active_days) >= 4) {
    return { signal: "consistency", message: "Your trainer noticed your consistency this week. Keep this momentum." };
  }
  if (daysSinceActivity <= 1) {
    return { signal: "comeback", message: "Your trainer noticed you checked in again. Great comeback." };
  }
  return { signal: "effort", message: "Your trainer noticed your effort today. Great work." };
}

trainerRouter.get("/trainer/attention", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    const scope = await getAdminGymScope(req.user!);
    const result = await query(
      `
      select u.id, u.full_name, u.email, u.profile_photo_s3_key, u.goal_type, u.target_weight_kg,
        current_score.score as current_score,
        previous_score.score as previous_score,
        food.last_food_logged_at,
        water.last_water_logged_at,
        activity.last_activity_at,
        latest_weight.weight_kg as latest_weight_kg,
        previous_weight.weight_kg as previous_weight_kg,
        coalesce(missions.missed_missions, 0) as missed_missions
      from users u
      left join lateral (
        select score
        from compliance_scores
        where user_id = u.id
        order by calculated_for_date desc
        limit 1
      ) current_score on true
      left join lateral (
        select score
        from compliance_scores
        where user_id = u.id
          and calculated_for_date < current_date
        order by calculated_for_date desc
        limit 1
      ) previous_score on true
      left join lateral (
        select max(logged_at) as last_food_logged_at
        from food_logs
        where user_id = u.id
      ) food on true
      left join lateral (
        select max(logged_at) as last_water_logged_at
        from water_logs
        where user_id = u.id
      ) water on true
      left join lateral (
        select max(activity_at) as last_activity_at
        from (
          select logged_at as activity_at from food_logs where user_id = u.id
          union all select logged_at from weight_logs where user_id = u.id
          union all select logged_at from water_logs where user_id = u.id
          union all select logged_at from habit_logs where user_id = u.id
          union all select created_at from messages where sender_user_id = u.id
          union all select created_at from trainer_missions where client_user_id = u.id and status = 'completed'
        ) activity_union
      ) activity on true
      left join lateral (
        select weight_kg
        from weight_logs
        where user_id = u.id
        order by logged_at desc
        limit 1
      ) latest_weight on true
      left join lateral (
        select weight_kg
        from weight_logs
        where user_id = u.id
        order by logged_at desc
        offset 1
        limit 1
      ) previous_weight on true
      left join lateral (
        select count(*) as missed_missions
        from trainer_missions
        where client_user_id = u.id
          and status = 'open'
          and due_date < current_date
      ) missions on true
      where u.primary_role = 'client'
        and u.status = 'active'
        and (u.assigned_trainer_id = $1 or (($2 = any($3::text[]) or $4 = any($3::text[])) and ($5::uuid[] is null or u.gym_id = any($5))))
      `,
      [req.user!.trainerId ?? null, "admin", req.user!.roles, "owner", scope.gymIds]
    );

    const attention = result.rows
      .flatMap((row) => {
        const signal = attentionReason(row);
        if (!signal) return [];
        return [{
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          profile_photo_s3_key: row.profile_photo_s3_key,
          goal_type: row.goal_type,
          current_score: row.current_score,
          reason: signal.reason,
          detail: signal.detail,
          priority: signal.priority
        }];
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);

    res.json({
      attention: await withProfilePhotoUrls(attention),
      summary: {
        totalClients: result.rows.length,
        needsAttention: attention.length,
        allClear: attention.length === 0
      }
    });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/recognitions/latest", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `
      select r.*, trainer_user.full_name as trainer_name
      from trainer_recognitions r
      left join trainers t on t.id = r.trainer_id
      left join users trainer_user on trainer_user.id = t.user_id
      where r.client_user_id = $1
        and r.created_at >= now() - interval '7 days'
      order by r.created_at desc
      limit 1
      `,
      [req.user!.id]
    );
    res.json({ recognition: result.rows[0] ?? null });
  } catch (error) {
    next(error);
  }
});

trainerRouter.post("/trainer/clients/:clientId/praise", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    const allowed = await canManageClient(req.user!, req.params.clientId);
    if (!allowed) return res.status(404).json({ error: "Client not found" });

    const existing = await query(
      `
      select *
      from trainer_recognitions
      where client_user_id = $1
        and created_by_user_id = $2
        and created_at::date = current_date
      order by created_at desc
      limit 1
      `,
      [req.params.clientId, req.user!.id]
    );
    if (existing.rows[0]) return res.json({ recognition: existing.rows[0], reused: true });

    const clientResult = await query<{ assigned_trainer_id: string | null }>("select assigned_trainer_id from users where id = $1", [
      req.params.clientId
    ]);
    const trainerId = req.user!.trainerId ?? clientResult.rows[0]?.assigned_trainer_id ?? null;
    const praise = await createPraiseMessage(req.params.clientId);

    const recognitionResult = await query(
      `
      insert into trainer_recognitions (client_user_id, trainer_id, created_by_user_id, message, signal)
      values ($1, $2, $3, $4, $5)
      returning *
      `,
      [req.params.clientId, trainerId, req.user!.id, praise.message, praise.signal]
    );

    await query("insert into messages (sender_user_id, receiver_user_id, body) values ($1, $2, $3)", [
      req.user!.id,
      req.params.clientId,
      praise.message
    ]);

    res.status(201).json({ recognition: recognitionResult.rows[0], reused: false });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    const scope = await getAdminGymScope(req.user!);
    const result = await query(
      `
      select u.id, u.full_name, u.email, u.profile_photo_s3_key, u.goal_type, u.goal_updated_at, u.gender, u.age_years, u.activity_level,
        u.height_cm, u.starting_weight_kg, u.target_weight_kg,
        cs.score as compliance_score,
        risk.risk_severity, risk.open_alerts,
        food.last_food_logged_at,
        coalesce(food_today.calories, 0) as calories_today,
        coalesce(food_today.protein_g, 0) as protein_g_today,
        coalesce(food_today.carbs_g, 0) as carbs_g_today,
        coalesce(food_today.fat_g, 0) as fat_g_today,
        weight.last_weight_logged_at,
        weight.latest_weight_kg,
        water.last_water_logged_at,
        msg.last_client_message_at,
        goal_milestone.achieved_at as goal_achieved_at,
        coalesce(streak.current_streak, 0) as consistency_streak
      from users u
      left join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
      left join lateral (
        select max(severity) as risk_severity, count(*) as open_alerts
        from risk_alerts
        where user_id = u.id and status = 'open'
      ) risk on true
      left join lateral (
        select max(logged_at) as last_food_logged_at
        from food_logs
        where user_id = u.id
      ) food on true
      left join lateral (
        select
          coalesce(sum(calories), 0) as calories,
          coalesce(sum(protein_g), 0) as protein_g,
          coalesce(sum(carbs_g), 0) as carbs_g,
          coalesce(sum(fat_g), 0) as fat_g
        from food_logs
        where user_id = u.id and logged_at::date = current_date
      ) food_today on true
      left join lateral (
        select max(logged_at) as last_weight_logged_at, (array_agg(weight_kg order by logged_at desc))[1] as latest_weight_kg
        from weight_logs
        where user_id = u.id
      ) weight on true
      left join lateral (
        select max(logged_at) as last_water_logged_at
        from water_logs
        where user_id = u.id
      ) water on true
      left join lateral (
        select max(created_at) as last_client_message_at
        from messages
        where sender_user_id = u.id
      ) msg on true
      left join lateral (
        select achieved_at from goal_milestones
        where user_id = u.id and goal_version = u.goal_version and milestone_type = 'target_reached'
        order by achieved_at desc limit 1
      ) goal_milestone on true
      left join lateral (
        with days as (
          select day::date as activity_date, row_number() over (order by day desc) as day_rank
          from generate_series(current_date - interval '30 days', current_date, interval '1 day') day
        ),
        activity_days as (
          select distinct activity_date::date
          from (
            select logged_at::date as activity_date from food_logs where user_id = u.id
            union all select logged_at::date from weight_logs where user_id = u.id
            union all select logged_at::date from water_logs where user_id = u.id
            union all select logged_at::date from habit_logs where user_id = u.id and completed = true
            union all select created_at::date from analytics_events where user_id = u.id and event_name = 'burn_log'
            union all select completed_at::date from trainer_missions where client_user_id = u.id and status = 'completed' and completed_at is not null
          ) activity
        )
        select count(*) as current_streak
        from days d
        where exists (select 1 from activity_days a where a.activity_date = d.activity_date)
          and not exists (
            select 1
            from days earlier_day
            where earlier_day.day_rank < d.day_rank
              and not exists (select 1 from activity_days a where a.activity_date = earlier_day.activity_date)
          )
      ) streak on true
      where u.primary_role = 'client'
        and u.status = 'active'
        and (u.assigned_trainer_id = $1 or (($2 = any($3::text[]) or $4 = any($3::text[])) and ($5::uuid[] is null or u.gym_id = any($5))))
      order by risk.open_alerts desc nulls last, cs.score asc nulls last, food.last_food_logged_at asc nulls first
      `,
      [req.user!.trainerId ?? null, "admin", req.user!.roles, "owner", scope.gymIds]
    );
    res.json({ clients: await withProfilePhotoUrls(result.rows) });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients/:clientId/progress-comparison", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    res.json({ comparison: await getProgressComparison(req.params.clientId) });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients/:clientId", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select u.id, u.full_name, u.email, u.profile_photo_s3_key, u.goal_type, u.goal_updated_at, u.gender, u.age_years, u.activity_level,
        u.height_cm, u.starting_weight_kg, u.target_weight_kg,
        g.name as gym_name, cs.score as compliance_score,
        trainer_message.last_trainer_message_at,
        goal_milestone.achieved_at as goal_achieved_at
      from users u
      left join gyms g on g.id = u.gym_id
      left join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
      left join lateral (
        select max(created_at) as last_trainer_message_at
        from messages
        where sender_user_id = $6
          and receiver_user_id = u.id
      ) trainer_message on true
      left join lateral (
        select achieved_at from goal_milestones
        where user_id = u.id and goal_version = u.goal_version and milestone_type = 'target_reached'
        order by achieved_at desc limit 1
      ) goal_milestone on true
      where u.id = $1
        and u.primary_role = 'client'
        and u.status = 'active'
        and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      limit 1
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner", req.user!.id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: "Client not found" });
    res.json({ client: await withProfilePhotoUrl(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients/:clientId/food-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select fl.*
      from food_logs fl
      join users u on u.id = fl.user_id
      where fl.user_id = $1
        and u.status = 'active'
        and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      order by fl.logged_at desc
      limit 100
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
    );
    res.json({ foodLogs: await withFoodImageUrls(result.rows) });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients/:clientId/weight-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select wl.*
      from weight_logs wl
      join users u on u.id = wl.user_id
      where wl.user_id = $1
        and u.status = 'active'
        and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      order by wl.logged_at desc
      limit 100
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
    );
    res.json({ weightLogs: result.rows });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/clients/:clientId/water-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select water_logs.*
      from water_logs
      join users u on u.id = water_logs.user_id
      where water_logs.user_id = $1
        and u.status = 'active'
        and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
      order by water_logs.logged_at desc
      limit 100
      `,
      [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
    );
    res.json({ waterLogs: result.rows });
  } catch (error) {
    next(error);
  }
});

trainerRouter.get("/trainer/risk-alerts", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    const scope = await getAdminGymScope(req.user!);
    const result = await query(
      `
      select ra.*, u.full_name, u.profile_photo_s3_key
      from risk_alerts ra
      join users u on u.id = ra.user_id
      where (ra.trainer_id = $1 or (($2 = any($3::text[]) or $4 = any($3::text[])) and ($5::uuid[] is null or ra.gym_id = any($5))))
        and ra.status = 'open'
      order by ra.created_at desc
      `,
      [req.user!.trainerId ?? null, "admin", req.user!.roles, "owner", scope.gymIds]
    );
    res.json({ alerts: await withProfilePhotoUrls(result.rows) });
  } catch (error) {
    next(error);
  }
});

trainerRouter.patch("/trainer/risk-alerts/:id", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    const status = z.enum(["acknowledged", "resolved"]).default("acknowledged").parse(req.body.status);
    const scope = await getAdminGymScope(req.user!);
    const result = await query(
      `
      update risk_alerts
      set status = $2, resolved_at = case when $2 = 'resolved' then now() else resolved_at end
      where id = $1 and (trainer_id = $3 or (($4 = any($5::text[]) or $6 = any($5::text[])) and ($7::uuid[] is null or gym_id = any($7))))
      returning *
      `,
      [req.params.id, status, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner", scope.gymIds]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Risk alert not found" });
    res.json({ alert: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

trainerRouter.post("/ai/weekly-checkin/:clientId", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res, next) => {
  try {
    if (!await canManageClient(req.user!, req.params.clientId)) return res.status(404).json({ error: "Client not found" });
    const result = await query(
      `
      select u.full_name, u.goal_type, cs.score, count(fl.id) as food_logs
      from users u
      left join compliance_scores cs on cs.user_id = u.id
      left join food_logs fl on fl.user_id = u.id and fl.logged_at > now() - interval '7 days'
      where u.id = $1
      group by u.id, cs.score
      order by cs.score desc nulls last
      limit 1
      `,
      [req.params.clientId]
    );
    const context = JSON.stringify(result.rows[0] ?? {});
    const summary = await createWeeklySummary(context);
    await logAiUsage({
      userId: req.user!.id,
      gymId: req.user!.gymId,
      eventType: "weekly_report_generation",
      provider: env.AI_PROVIDER,
      model: env.AI_PROVIDER === "gemini" ? env.GEMINI_MODEL : env.OPENAI_MODEL,
      status: "success",
      inputUnits: context.length,
      outputUnits: summary.length,
      metadata: { clientId: req.params.clientId, generatedBy: "trainer" }
    });
    res.json({ summary });
  } catch (error) {
    next(error);
  }
});
