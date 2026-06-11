import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { requireActivePlan } from "../middleware/subscription";
import { createWeeklySummary } from "../integrations/openai";
import { createReadUrl } from "../integrations/s3";

export const trainerRouter = Router();

async function withFoodImageUrls<T extends { image_s3_key?: string | null }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      image_url: await createReadUrl(row.image_s3_key)
    }))
  );
}

trainerRouter.get("/trainer/clients", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    select u.id, u.full_name, u.email, u.goal_type, cs.score as compliance_score,
      risk.risk_severity, risk.open_alerts,
      food.last_food_logged_at,
      weight.last_weight_logged_at,
      water.last_water_logged_at,
      msg.last_client_message_at
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
      select max(logged_at) as last_weight_logged_at
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
    where u.assigned_trainer_id = $1 or $2 = any($3::text[]) or $4 = any($3::text[])
    order by risk.open_alerts desc nulls last, cs.score asc nulls last, food.last_food_logged_at asc nulls first
    `,
    [req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ clients: result.rows });
});

trainerRouter.get("/trainer/clients/:clientId", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    select u.id, u.full_name, u.email, u.goal_type, u.starting_weight_kg, u.target_weight_kg,
      g.name as gym_name, cs.score as compliance_score
    from users u
    left join gyms g on g.id = u.gym_id
    left join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
    where u.id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
    limit 1
    `,
    [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );

  if (!result.rows[0]) return res.status(404).json({ error: "Client not found" });
  res.json({ client: result.rows[0] });
});

trainerRouter.get("/trainer/clients/:clientId/food-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    select fl.*
    from food_logs fl
    join users u on u.id = fl.user_id
    where fl.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
    order by fl.logged_at desc
    limit 100
    `,
    [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ foodLogs: await withFoodImageUrls(result.rows) });
});

trainerRouter.get("/trainer/clients/:clientId/weight-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    select wl.*
    from weight_logs wl
    join users u on u.id = wl.user_id
    where wl.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
    order by wl.logged_at desc
    limit 100
    `,
    [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ weightLogs: result.rows });
});

trainerRouter.get("/trainer/clients/:clientId/water-logs", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    select water_logs.*
    from water_logs
    join users u on u.id = water_logs.user_id
    where water_logs.user_id = $1 and (u.assigned_trainer_id = $2 or $3 = any($4::text[]) or $5 = any($4::text[]))
    order by water_logs.logged_at desc
    limit 100
    `,
    [req.params.clientId, req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ waterLogs: result.rows });
});

trainerRouter.get("/trainer/risk-alerts", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    "select * from risk_alerts where (trainer_id = $1 or $2 = any($3::text[]) or $4 = any($3::text[])) and status = 'open' order by created_at desc",
    [req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ alerts: result.rows });
});

trainerRouter.patch("/trainer/risk-alerts/:id", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
  const result = await query(
    `
    update risk_alerts
    set status = $2, resolved_at = case when $2 = 'resolved' then now() else resolved_at end
    where id = $1 and (trainer_id = $3 or $4 = any($5::text[]) or $6 = any($5::text[]))
    returning *
    `,
    [req.params.id, req.body.status ?? "acknowledged", req.user!.trainerId ?? null, "admin", req.user!.roles, "owner"]
  );
  res.json({ alert: result.rows[0] });
});

trainerRouter.post("/ai/weekly-checkin/:clientId", requireAuth, requireActivePlan("trainer_pro"), requireRole(["trainer", "admin", "owner"]), async (req, res) => {
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
  const summary = await createWeeklySummary(JSON.stringify(result.rows[0] ?? {}));
  res.json({ summary });
});
