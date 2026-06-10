import { Router } from "express";
import { query } from "../db/pool";
import { calculateComplianceScore } from "../domain/compliance";
import { requireAuth, requireRole } from "../middleware/auth";

export const complianceRouter = Router();

complianceRouter.get("/compliance/today", requireAuth, async (req, res) => {
  const [food, weight, water, habits] = await Promise.all([
    query<{ count: string }>(
      "select count(*) from food_logs where user_id = $1 and logged_at::date = current_date",
      [req.user!.id]
    ),
    query<{ count: string }>(
      "select count(*) from weight_logs where user_id = $1 and logged_at::date >= current_date - interval '6 days'",
      [req.user!.id]
    ),
    query<{ total_ml: string | null }>(
      "select coalesce(sum(amount_ml), 0) as total_ml from water_logs where user_id = $1 and logged_at::date = current_date",
      [req.user!.id]
    ),
    query<{ assigned: string; completed: string }>(
      `
      select
        count(h.id) as assigned,
        count(distinct hl.habit_id) filter (where hl.completed = true) as completed
      from habits h
      left join habit_logs hl on hl.habit_id = h.id
        and hl.user_id = h.user_id
        and hl.logged_at::date = current_date
      where h.user_id = $1 and h.active = true
      `,
      [req.user!.id]
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
    values ($1, $2, $3, $4, $5, $6, current_date)
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
    [req.user!.id, score.totalScore, score.foodScore, score.weightScore, score.waterScore, score.habitScore]
  );

  res.json({ compliance: result.rows[0] });
});

complianceRouter.get("/compliance/history", requireAuth, async (req, res) => {
  const result = await query(
    "select * from compliance_scores where user_id = $1 order by calculated_for_date desc limit 30",
    [req.user!.id]
  );
  res.json({ compliance: result.rows });
});

complianceRouter.get(
  "/trainer/clients/:clientId/compliance",
  requireAuth,
  requireRole(["trainer", "admin", "owner"]),
  async (req, res) => {
    const result = await query(
      `
      select cs.*
      from compliance_scores cs
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
