import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getRevenueByGym, getRevenueByTrainer } from "../services/analyticsService";
import { aiLimitConfig } from "../services/aiUsageService";

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

adminRouter.get("/admin/analytics/ai-usage", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const limits = aiLimitConfig();
  const [summary, daily, weekly, monthly] = await Promise.all([
    query(`
      select
        count(*) filter (where event_type = 'food_image_analysis' and created_at >= date_trunc('month', now())) as monthly_food_image_analyses,
        count(*) filter (where event_type = 'ai_chat_message' and created_at >= date_trunc('month', now())) as monthly_ai_chat_messages,
        count(*) filter (where event_type = 'weekly_report_generation' and created_at >= date_trunc('month', now())) as monthly_weekly_reports,
        count(*) filter (where cache_hit = true and created_at >= date_trunc('month', now())) as monthly_cache_hits,
        count(*) filter (where status = 'error' and created_at >= date_trunc('month', now())) as monthly_errors,
        coalesce(sum(estimated_cost_cents) filter (where created_at >= date_trunc('month', now())), 0) as monthly_estimated_cost_cents
      from ai_usage_events
    `),
    query(`
      select created_at::date as period,
        count(*) filter (where event_type = 'food_image_analysis') as food_image_analyses,
        count(*) filter (where event_type = 'ai_chat_message') as ai_chat_messages,
        count(*) filter (where event_type = 'weekly_report_generation') as weekly_reports,
        count(*) filter (where cache_hit = true) as cache_hits,
        count(*) filter (where status = 'error') as errors,
        coalesce(sum(estimated_cost_cents), 0) as estimated_cost_cents
      from ai_usage_events
      where created_at >= current_date - interval '13 days'
      group by created_at::date
      order by period desc
    `),
    query(`
      select date_trunc('week', created_at)::date as period,
        count(*) filter (where event_type = 'food_image_analysis') as food_image_analyses,
        count(*) filter (where event_type = 'ai_chat_message') as ai_chat_messages,
        count(*) filter (where event_type = 'weekly_report_generation') as weekly_reports,
        count(*) filter (where cache_hit = true) as cache_hits,
        count(*) filter (where status = 'error') as errors,
        coalesce(sum(estimated_cost_cents), 0) as estimated_cost_cents
      from ai_usage_events
      where created_at >= date_trunc('week', now()) - interval '7 weeks'
      group by date_trunc('week', created_at)::date
      order by period desc
    `),
    query(`
      select date_trunc('month', created_at)::date as period,
        count(*) filter (where event_type = 'food_image_analysis') as food_image_analyses,
        count(*) filter (where event_type = 'ai_chat_message') as ai_chat_messages,
        count(*) filter (where event_type = 'weekly_report_generation') as weekly_reports,
        count(*) filter (where cache_hit = true) as cache_hits,
        count(*) filter (where status = 'error') as errors,
        coalesce(sum(estimated_cost_cents), 0) as estimated_cost_cents
      from ai_usage_events
      where created_at >= date_trunc('month', now()) - interval '11 months'
      group by date_trunc('month', created_at)::date
      order by period desc
    `)
  ]);

  const current = summary.rows[0] ?? {};
  const monthlyCost = Number(current.monthly_estimated_cost_cents ?? 0);
  const dayOfMonth = Math.max(new Date().getDate(), 1);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const projectedMonthlyCostCents = Math.round((monthlyCost / dayOfMonth) * daysInMonth);
  const spendPercent = limits.monthlySpendLimitCents ? Math.round((projectedMonthlyCostCents / limits.monthlySpendLimitCents) * 100) : 0;
  const warningLevel = spendPercent >= 90 ? 90 : spendPercent >= 75 ? 75 : spendPercent >= 50 ? 50 : null;

  res.json({
    summary: {
      ...current,
      projected_monthly_cost_cents: projectedMonthlyCostCents,
      spend_limit_cents: limits.monthlySpendLimitCents,
      spend_percent: spendPercent,
      warning_level: warningLevel,
      limits
    },
    daily: daily.rows,
    weekly: weekly.rows,
    monthly: monthly.rows
  });
});

adminRouter.get("/admin/analytics/pilot-metrics", requireAuth, requireRole(["admin", "owner"]), async (_req, res) => {
  const [summary, trends, referrals] = await Promise.all([
    query(`
      with client_base as (
        select id
        from users
        where primary_role = 'client'
      ),
      active_today as (
        select distinct user_id from food_logs where logged_at::date = current_date
        union select distinct user_id from weight_logs where logged_at::date = current_date
        union select distinct user_id from water_logs where logged_at::date = current_date
        union select distinct user_id from habit_logs where logged_at::date = current_date
        union select distinct user_id from analytics_events where created_at::date = current_date
        union select distinct sender_user_id as user_id from messages where created_at::date = current_date
        union select distinct user_id from ai_usage_events where created_at::date = current_date
      ),
      active_week as (
        select distinct user_id from food_logs where logged_at >= now() - interval '7 days'
        union select distinct user_id from weight_logs where logged_at >= now() - interval '7 days'
        union select distinct user_id from water_logs where logged_at >= now() - interval '7 days'
        union select distinct user_id from habit_logs where logged_at >= now() - interval '7 days'
        union select distinct user_id from analytics_events where created_at >= now() - interval '7 days'
        union select distinct sender_user_id as user_id from messages where created_at >= now() - interval '7 days'
        union select distinct user_id from ai_usage_events where created_at >= now() - interval '7 days'
      ),
      client_activity as (
        select
          (select count(*) from client_base) as total_clients,
          (select count(*) from active_today a join client_base c on c.id = a.user_id) as daily_active_users,
          (select count(*) from active_week a join client_base c on c.id = a.user_id) as weekly_active_users,
          (select count(distinct user_id) from food_logs where logged_at >= now() - interval '7 days') as food_loggers,
          (select count(distinct user_id) from weight_logs where logged_at >= now() - interval '7 days') as weight_loggers,
          (select count(distinct user_id) from water_logs where logged_at >= now() - interval '7 days') as water_loggers,
          (select count(distinct user_id) from habit_logs where completed = true and logged_at >= now() - interval '7 days') as habit_completers,
          (select round(avg(score)) from compliance_scores where calculated_for_date >= current_date - interval '7 days') as average_compliance_score
      ),
      trainer_activity as (
        select
          count(distinct m.sender_user_id) filter (where m.created_at::date = current_date and su.primary_role in ('trainer','admin','owner')) as daily_trainer_logins,
          count(m.id) filter (where su.primary_role in ('trainer','admin','owner') and m.created_at >= now() - interval '7 days') as trainer_replies,
          count(m.id) filter (where su.primary_role = 'client' and m.created_at >= now() - interval '7 days') as client_messages,
          (select count(*) from risk_alerts where created_at >= now() - interval '30 days') as risk_alerts_generated,
          (select count(*) from risk_alerts where resolved_at >= now() - interval '30 days' or (status in ('resolved','acknowledged') and created_at >= now() - interval '30 days')) as risk_alerts_resolved,
          (select count(distinct id) from users where primary_role = 'client' and assigned_trainer_id is not null) as clients_monitored
        from messages m
        join users su on su.id = m.sender_user_id
      ),
      business as (
        select
          count(cb.id) filter (where coalesce(s.plan::text, 'free') = 'free' or s.id is null) as free_users,
          count(cb.id) filter (where s.plan = 'premium' and s.status in ('active','trialing')) as premium_users,
          count(cb.id) filter (where s.plan in ('premium','trainer_pro') and s.status in ('active','trialing')) as trial_conversions,
          coalesce(sum(s.amount_cents) filter (where s.status in ('active','trialing') and s.plan in ('premium','trainer_pro')), 0) as monthly_recurring_revenue_cents,
          count(s.id) filter (where s.status in ('canceled','expired') and s.plan in ('premium','trainer_pro')) as churned_subscriptions,
          count(s.id) filter (where s.plan in ('premium','trainer_pro')) as paid_subscriptions_ever
        from client_base cb
        left join lateral (
          select *
          from subscriptions s
          where s.user_id = cb.id
          order by s.created_at desc
          limit 1
        ) s on true
      ),
      ai as (
        select
          coalesce(sum(estimated_cost_cents) filter (where created_at >= date_trunc('month', now())), 0) as ai_spend_cents,
          count(*) filter (where cache_hit = true and created_at >= date_trunc('month', now())) as cache_hits,
          count(*) filter (where event_type = 'food_image_analysis' and created_at >= date_trunc('month', now())) as food_ai_events,
          coalesce(sum(estimated_cost_cents) filter (where created_at >= date_trunc('month', now())), 0) as monthly_estimated_cost_cents
        from ai_usage_events
      )
      select
        client_activity.*,
        trainer_activity.*,
        business.*,
        ai.*,
        case when client_activity.weekly_active_users > 0 then round(ai.ai_spend_cents / client_activity.weekly_active_users) else 0 end as cost_per_active_user_cents
      from client_activity, trainer_activity, business, ai
    `),
    query(`
      with days as (
        select generate_series(current_date - interval '13 days', current_date, interval '1 day')::date as period
      ),
      activity as (
        select user_id, logged_at::date as period, 'food' as type from food_logs where logged_at >= current_date - interval '13 days'
        union all select user_id, logged_at::date, 'weight' from weight_logs where logged_at >= current_date - interval '13 days'
        union all select user_id, logged_at::date, 'water' from water_logs where logged_at >= current_date - interval '13 days'
        union all select user_id, logged_at::date, 'habit' from habit_logs where logged_at >= current_date - interval '13 days' and completed = true
        union all select user_id, created_at::date, 'activity' from analytics_events where created_at >= current_date - interval '13 days'
        union all select sender_user_id, created_at::date, 'message' from messages where created_at >= current_date - interval '13 days'
      )
      select
        d.period,
        count(distinct a.user_id) as active_users,
        count(*) filter (where a.type = 'food') as food_logs,
        count(*) filter (where a.type = 'weight') as weight_logs,
        count(*) filter (where a.type = 'water') as water_logs,
        count(*) filter (where a.type = 'habit') as habit_completions,
        coalesce(round(avg(cs.score)), 0) as average_compliance_score,
        coalesce(ai.estimated_cost_cents, 0) as ai_cost_cents
      from days d
      left join activity a on a.period = d.period
      left join compliance_scores cs on cs.calculated_for_date = d.period
      left join lateral (
        select sum(estimated_cost_cents) as estimated_cost_cents
        from ai_usage_events
        where created_at::date = d.period
      ) ai on true
      group by d.period, ai.estimated_cost_cents
      order by d.period
    `),
    query(`
      select rc.code, rc.type, coalesce(g.name, trainer_gym.name) as gym_name, tu.full_name as trainer_name,
        count(u.id) as referred_users,
        count(s.id) filter (where s.status in ('active','trialing') and s.plan in ('premium','trainer_pro')) as converted_users,
        coalesce(sum(s.amount_cents) filter (where s.status in ('active','trialing')), 0) as revenue_cents
      from referral_codes rc
      left join gyms g on g.id = rc.gym_id
      left join trainers t on t.id = rc.trainer_id
      left join gyms trainer_gym on trainer_gym.id = t.gym_id
      left join users tu on tu.id = t.user_id
      left join users u on (
        (rc.type = 'gym' and u.referred_by_gym_id = rc.gym_id and u.referred_by_trainer_id is null)
        or (rc.type = 'trainer' and u.referred_by_trainer_id = rc.trainer_id)
      )
      left join subscriptions s on s.user_id = u.id
      group by rc.id, g.name, trainer_gym.name, tu.full_name
      order by referred_users desc, revenue_cents desc
      limit 20
    `)
  ]);

  const row = summary.rows[0] ?? {};
  const totalClients = Number(row.total_clients ?? 0);
  const weeklyActiveUsers = Number(row.weekly_active_users ?? 0);
  const trainerReplies = Number(row.trainer_replies ?? 0);
  const clientMessages = Number(row.client_messages ?? 0);
  const paidEver = Number(row.paid_subscriptions_ever ?? 0);
  const churned = Number(row.churned_subscriptions ?? 0);
  const foodAiEvents = Number(row.food_ai_events ?? 0);
  const cacheHits = Number(row.cache_hits ?? 0);
  const monthCost = Number(row.monthly_estimated_cost_cents ?? 0);
  const dayOfMonth = Math.max(new Date().getDate(), 1);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  res.json({
    clients: {
      dailyActiveUsers: Number(row.daily_active_users ?? 0),
      weeklyActiveUsers,
      foodLoggingRate: totalClients ? Math.round((Number(row.food_loggers ?? 0) / totalClients) * 100) : 0,
      weightLoggingRate: totalClients ? Math.round((Number(row.weight_loggers ?? 0) / totalClients) * 100) : 0,
      waterLoggingRate: totalClients ? Math.round((Number(row.water_loggers ?? 0) / totalClients) * 100) : 0,
      habitCompletionRate: totalClients ? Math.round((Number(row.habit_completers ?? 0) / totalClients) * 100) : 0,
      averageComplianceScore: Number(row.average_compliance_score ?? 0)
    },
    trainers: {
      dailyTrainerLogins: Number(row.daily_trainer_logins ?? 0),
      trainerResponseRate: clientMessages ? Math.min(100, Math.round((trainerReplies / clientMessages) * 100)) : 0,
      riskAlertsGenerated: Number(row.risk_alerts_generated ?? 0),
      riskAlertsResolved: Number(row.risk_alerts_resolved ?? 0),
      clientsMonitored: Number(row.clients_monitored ?? 0)
    },
    business: {
      freeUsers: Number(row.free_users ?? 0),
      premiumUsers: Number(row.premium_users ?? 0),
      trialConversions: Number(row.trial_conversions ?? 0),
      monthlyRecurringRevenueCents: Number(row.monthly_recurring_revenue_cents ?? 0),
      churnRate: paidEver ? Math.round((churned / paidEver) * 100) : 0,
      referralPerformance: referrals.rows
    },
    ai: {
      aiSpendCents: Number(row.ai_spend_cents ?? 0),
      costPerActiveUserCents: weeklyActiveUsers ? Number(row.cost_per_active_user_cents ?? 0) : 0,
      cacheHitRate: foodAiEvents ? Math.round((cacheHits / foodAiEvents) * 100) : 0,
      estimatedMonthlyCostCents: Math.round((monthCost / dayOfMonth) * daysInMonth)
    },
    trends: trends.rows
  });
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
      u.referred_by_gym_id, referred_gym.name as referred_gym_name,
      u.referred_by_trainer_id, referred_trainer_user.full_name as referred_trainer_name,
      case
        when u.referred_by_trainer_id is not null then 'trainer'
        when u.referred_by_gym_id is not null then 'gym'
        else 'none'
      end as referral_source,
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
    left join gyms referred_gym on referred_gym.id = u.referred_by_gym_id
    left join trainers referred_trainer on referred_trainer.id = u.referred_by_trainer_id
    left join users referred_trainer_user on referred_trainer_user.id = referred_trainer.user_id
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
    if (input.role === "owner") {
      await db.query("insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin')", [req.params.userId]);
    } else {
      await db.query("insert into user_roles (user_id, role) values ($1, $2)", [req.params.userId, input.role]);
    }

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
    select rc.code, rc.type, coalesce(g.name, trainer_gym.name) as gym_name, tu.full_name as trainer_name,
      count(u.id) as referred_users,
      coalesce(sum(s.amount_cents) filter (where s.status = 'active'), 0) as active_revenue_cents
    from referral_codes rc
    left join gyms g on g.id = rc.gym_id
    left join trainers t on t.id = rc.trainer_id
    left join gyms trainer_gym on trainer_gym.id = t.gym_id
    left join users tu on tu.id = t.user_id
    left join users u on (
      (rc.type = 'gym' and u.referred_by_gym_id = rc.gym_id and u.referred_by_trainer_id is null)
      or (rc.type = 'trainer' and u.referred_by_trainer_id = rc.trainer_id)
    )
    left join subscriptions s on s.user_id = u.id
    group by rc.id, g.name, trainer_gym.name, tu.full_name
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
