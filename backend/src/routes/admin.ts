import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getRevenueByGym, getRevenueByTrainer } from "../services/analyticsService";

export const adminRouter = Router();

const roleSchema = z.object({
  role: z.enum(["client", "trainer", "admin", "owner"]),
  gymId: z.string().uuid().optional()
});

const assignClientSchema = z.object({
  clientId: z.string().uuid(),
  trainerId: z.string().uuid().nullable()
});

const referralSchema = z.object({
  code: z.string().min(3).max(40),
  type: z.enum(["gym", "trainer"]),
  gymId: z.string().uuid().nullable().optional(),
  trainerId: z.string().uuid().nullable().optional()
});

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
      count(distinct wat.id) as water_logs
    from gyms g
    left join users u on u.gym_id = g.id
    left join food_logs fl on fl.user_id = u.id and fl.created_at > now() - interval '30 days'
    left join weight_logs wl on wl.user_id = u.id and wl.created_at > now() - interval '30 days'
    left join water_logs wat on wat.user_id = u.id and wat.created_at > now() - interval '30 days'
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

adminRouter.post("/admin/assign-client", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    const input = assignClientSchema.parse(req.body);
    const result = await query(
      `
      update users
      set assigned_trainer_id = $2,
          gym_id = case
            when $2::uuid is null then gym_id
            else coalesce(gym_id, (select gym_id from trainers where id = $2))
          end,
          updated_at = now()
      where id = $1 and primary_role = 'client'
      returning *
      `,
      [input.clientId, input.trainerId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Client not found" });
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/users", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select u.id, u.full_name, u.email, u.primary_role::text as primary_role, u.gym_id, g.name as gym_name,
      u.assigned_trainer_id, trainer_user.full_name as assigned_trainer_name,
      coalesce(
        (
          select array_agg(ur.role::text order by ur.role::text)
          from user_roles ur
          where ur.user_id = u.id
        ),
        array[u.primary_role::text]
      ) as roles,
      u.created_at
    from users u
    left join gyms g on g.id = u.gym_id
    left join trainers assigned_trainer on assigned_trainer.id = u.assigned_trainer_id
    left join users trainer_user on trainer_user.id = assigned_trainer.user_id
    order by u.created_at desc
  `);
  res.json({ users: result.rows });
});

adminRouter.get("/admin/trainers", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const result = await query(`
    select t.id, t.user_id, t.gym_id, u.full_name, u.email, g.name as gym_name, t.specialties, t.status
    from trainers t
    join users u on u.id = t.user_id
    join gyms g on g.id = t.gym_id
    order by g.name, u.full_name
  `);
  res.json({ trainers: result.rows });
});

adminRouter.patch("/admin/users/:userId/role", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  const db = await pool.connect();
  try {
    const input = roleSchema.parse(req.body);

    await db.query("begin");

    const userResult = await db.query(
      "update users set primary_role = $2, gym_id = coalesce($3, gym_id), updated_at = now() where id = $1 returning *",
      [req.params.userId, input.role, input.gymId ?? null]
    );
    const user = userResult.rows[0];
    if (!user) {
      await db.query("rollback");
      return res.status(404).json({ error: "User not found" });
    }

    await db.query("delete from user_roles where user_id = $1", [req.params.userId]);
    await db.query("insert into user_roles (user_id, role) values ($1, $2)", [req.params.userId, input.role]);

    if (input.role === "trainer") {
      const gymId = input.gymId ?? user.gym_id;
      if (!gymId) {
        await db.query("rollback");
        return res.status(400).json({ error: "Trainer role requires a gym" });
      }
      await db.query(
        `
        insert into trainers (user_id, gym_id, specialties)
        values ($1, $2, '{}')
        on conflict (user_id) do update set gym_id = excluded.gym_id, status = 'active'
        `,
        [req.params.userId, gymId]
      );
    } else {
      await db.query("update trainers set status = 'inactive' where user_id = $1", [req.params.userId]);
    }

    await db.query("commit");
    res.json({ user });
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

adminRouter.post("/admin/referral-codes", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    const input = referralSchema.parse(req.body);
    const result = await query(
      `
      insert into referral_codes (code, type, gym_id, trainer_id, created_by_user_id)
      values ($1, $2, $3, $4, $5)
      on conflict (code) do update set
        type = excluded.type,
        gym_id = excluded.gym_id,
        trainer_id = excluded.trainer_id,
        active = true
      returning *
      `,
      [input.code.toUpperCase(), input.type, input.gymId ?? null, input.trainerId ?? null, req.user!.id]
    );
    res.status(201).json({ referral: result.rows[0] });
  } catch (error) {
    next(error);
  }
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
