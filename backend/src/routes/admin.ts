import { Router } from "express";
import { query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getRevenueByGym, getRevenueByTrainer } from "../services/analyticsService";

export const adminRouter = Router();

adminRouter.get("/admin/analytics/revenue", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  res.json({
    byGym: await getRevenueByGym(),
    byTrainer: await getRevenueByTrainer()
  });
});

adminRouter.get("/admin/analytics/usage", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select g.name as gym_name,
      count(distinct u.id) filter (where u.primary_role = 'client') as clients,
      count(distinct fl.id) as food_logs,
      count(distinct wl.id) as weight_logs,
      count(distinct water_logs.id) as water_logs
    from gyms g
    left join users u on u.gym_id = g.id
    left join food_logs fl on fl.user_id = u.id and fl.created_at > now() - interval '30 days'
    left join weight_logs wl on wl.user_id = u.id and wl.created_at > now() - interval '30 days'
    left join water_logs on water_logs.user_id = u.id and water_logs.created_at > now() - interval '30 days'
    group by g.id
    order by g.name
  `);
  res.json({ usage: result.rows });
});

adminRouter.get("/admin/analytics/compliance", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select g.name as gym_name,
      round(avg(cs.score)) as average_compliance,
      count(cs.id) filter (where cs.score < 50) as low_compliance_clients
    from gyms g
    left join users u on u.gym_id = g.id and u.primary_role = 'client'
    left join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
    group by g.id
    order by g.name
  `);
  res.json({ compliance: result.rows });
});

adminRouter.post("/admin/assign-client", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const result = await query("update users set assigned_trainer_id = $2, updated_at = now() where id = $1 returning *", [
    req.body.clientId,
    req.body.trainerId
  ]);
  res.json({ user: result.rows[0] });
});

adminRouter.get("/admin/users", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query("select id, full_name, email, primary_role, gym_id, assigned_trainer_id, created_at from users order by created_at desc");
  res.json({ users: result.rows });
});

adminRouter.get("/admin/trainers", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select t.id, t.user_id, u.full_name, u.email, g.name as gym_name, t.specialties, t.status
    from trainers t
    join users u on u.id = t.user_id
    join gyms g on g.id = t.gym_id
    order by g.name, u.full_name
  `);
  res.json({ trainers: result.rows });
});

adminRouter.get("/admin/referrals/analytics", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select rc.code, rc.type, g.name as gym_name, tu.full_name as trainer_name,
      count(u.id) as referred_users,
      coalesce(sum(s.amount_cents) filter (where s.status = 'active'), 0) as active_revenue_cents
    from referral_codes rc
    left join gyms g on g.id = rc.gym_id
    left join trainers t on t.id = rc.trainer_id
    left join users tu on tu.id = t.user_id
    left join users u on u.referred_by_gym_id = rc.gym_id or u.referred_by_trainer_id = rc.trainer_id
    left join subscriptions s on s.user_id = u.id
    group by rc.id, g.name, tu.full_name
    order by active_revenue_cents desc, referred_users desc
  `);
  res.json({ referrals: result.rows });
});

adminRouter.get("/admin/subscriptions", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select s.*, u.full_name, u.email, g.name as referred_gym_name, tu.full_name as referred_trainer_name
    from subscriptions s
    join users u on u.id = s.user_id
    left join gyms g on g.id = s.referred_by_gym_id
    left join trainers t on t.id = s.referred_by_trainer_id
    left join users tu on tu.id = t.user_id
    order by s.created_at desc
    limit 200
  `);
  res.json({ subscriptions: result.rows });
});
