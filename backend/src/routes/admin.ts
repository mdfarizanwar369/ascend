import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../db/pool";
import { requireAuth, requireRole } from "../middleware/auth";
import { getRevenueByGym, getRevenueByTrainer } from "../services/analyticsService";
import { aiLimitConfig } from "../services/aiUsageService";
import { getFirebaseAuth } from "../integrations/firebase";
import { deleteStoredObjects } from "../integrations/s3";
import { permanentDeletionBlock } from "../services/userDeletionService";
import { getAdminGymScope, getTrainerGymId, getUserGymId, scopeAllowsGym } from "../services/adminScopeService";
import { getDailyCoachingRolloutMetrics } from "../services/dailyCoachingDecisionService";

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

const grantSubscriptionSchema = z.object({
  plan: z.enum(["free", "premium", "trainer_pro"])
});

const userStatusSchema = z.object({
  status: z.enum(["active", "inactive"])
});

const ownerGymSchema = z.object({ gymId: z.string().uuid() });

const subscriptionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  status: z.enum(["current", "all", "active", "trialing", "past_due", "canceled", "expired"]).default("current"),
  provider: z.string().trim().max(40).default(""),
  q: z.string().trim().max(100).default("")
});

async function hasTrainerSupportedAccess(userId: string) {
  const result = await query<{ has_access: boolean }>(
    `
    select exists (
      select 1
      from subscriptions s
      where s.user_id = $1
        and s.plan in ('premium', 'trainer_pro')
        and (
          s.status in ('active', 'trialing', 'past_due')
          or (s.status = 'canceled' and s.current_period_end > now())
        )
    ) as has_access
    `,
    [userId]
  );
  return Boolean(result.rows[0]?.has_access);
}

adminRouter.get("/admin/analytics/revenue", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  res.json({
    byGym: await getRevenueByGym(scope.gymIds),
    byTrainer: await getRevenueByTrainer(scope.gymIds)
  });
});

adminRouter.get("/admin/analytics/usage", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select
      g.id as gym_id,
      g.name as gym_name,
      (select count(*) from users u where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active') as clients,
      (select count(*) from food_logs fl join users u on u.id = fl.user_id where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and fl.logged_at >= now() - interval '30 days') as food_logs,
      (select count(*) from weight_logs wl join users u on u.id = wl.user_id where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and wl.logged_at >= now() - interval '30 days') as weight_logs,
      (select count(*) from water_logs wat join users u on u.id = wat.user_id where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and wat.logged_at >= now() - interval '30 days') as water_logs,
      (select count(*) from users u where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and u.last_meaningful_activity_at >= now() - interval '7 days') as weekly_active_clients,
      (select count(distinct ae.user_id) from analytics_events ae join users u on u.id = ae.user_id where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and ae.event_name = 'burn_log' and ae.created_at >= now() - interval '7 days') as workout_loggers_7d,
      (select count(distinct bcs.user_id) from body_composition_scans bcs join users u on u.id = bcs.user_id where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and bcs.user_confirmed = true and bcs.experience_scope = 'athlete' and bcs.created_at >= now() - interval '90 days') as body_scan_users_90d,
      (select count(*) from users u where u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active' and u.assigned_trainer_id is not null) as assigned_clients,
      (select count(*) from trainers t join users tu on tu.id = t.user_id where t.gym_id = g.id and t.status = 'active' and tu.status = 'active') as active_trainers,
      (
        select count(distinct m.receiver_user_id)
        from messages m
        join users trainer_user on trainer_user.id = m.sender_user_id
        join trainers t on t.user_id = trainer_user.id and t.gym_id = g.id
        join users client on client.id = m.receiver_user_id and client.assigned_trainer_id = t.id
        where m.created_at >= now() - interval '7 days'
      ) as clients_contacted_7d
    from gyms g
    where ($1::uuid[] is null or g.id = any($1))
    order by g.name
  `, [scope.gymIds]);
  res.json({ usage: result.rows });
});

adminRouter.get("/admin/analytics/compliance", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select g.id as gym_id, g.name as gym_name,
      round(avg(cs.score)) as average_compliance,
      count(u.id) filter (where cs.score < 50) as low_compliance_clients
    from gyms g
    left join users u on u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active'
    left join lateral (
      select score
      from compliance_scores
      where user_id = u.id
      order by calculated_for_date desc
      limit 1
    ) cs on true
    where ($1::uuid[] is null or g.id = any($1))
    group by g.id
    order by g.name
  `, [scope.gymIds]);
  res.json({ compliance: result.rows });
});

adminRouter.get("/admin/analytics/ai-usage", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
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
      where ($1::uuid[] is null or gym_id = any($1))
    `, [scope.gymIds]),
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
        and ($1::uuid[] is null or gym_id = any($1))
      group by created_at::date
      order by period desc
    `, [scope.gymIds]),
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
        and ($1::uuid[] is null or gym_id = any($1))
      group by date_trunc('week', created_at)::date
      order by period desc
    `, [scope.gymIds]),
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
        and ($1::uuid[] is null or gym_id = any($1))
      group by date_trunc('month', created_at)::date
      order by period desc
    `, [scope.gymIds])
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

adminRouter.get("/admin/analytics/ai-errors", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select
      e.id,
      e.event_type,
      e.provider,
      e.model,
      e.status,
      e.metadata,
      e.created_at,
      u.email,
      u.full_name,
      g.name as gym_name
    from ai_usage_events e
    left join users u on u.id = e.user_id
    left join gyms g on g.id = e.gym_id
    where e.status = 'error'
      and ($1::uuid[] is null or e.gym_id = any($1))
    order by e.created_at desc
    limit 50
  `, [scope.gymIds]);

  res.json({ errors: result.rows });
});

adminRouter.get("/admin/analytics/daily-coaching", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  if (!req.user!.isPlatformOwner) {
    return res.status(403).json({ error: "Only the Ascend platform owner can view rollout metrics" });
  }
  const days = z.coerce.number().int().min(1).max(90).default(7).parse(req.query.days);
  res.json({ days, metrics: await getDailyCoachingRolloutMetrics(days) });
});

adminRouter.get("/admin/analytics/pilot-metrics", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const [summary, trends, referrals] = await Promise.all([
    query(`
      with client_base as (
        select id, gym_id, assigned_trainer_id, last_meaningful_activity_at
        from users
        where primary_role = 'client'
          and status = 'active'
          and ($1::uuid[] is null or gym_id = any($1))
      ),
      coached_client_base as (
        select distinct cb.*
        from client_base cb
        join subscriptions s on s.user_id = cb.id
        where s.plan in ('premium', 'trainer_pro')
          and (
            s.status in ('active', 'trialing', 'past_due')
            or (s.status = 'canceled' and s.current_period_end > now())
          )
      ),
      trainer_base as (
        select t.id, t.user_id, t.gym_id
        from trainers t
        join users u on u.id = t.user_id
        where t.status = 'active'
          and u.status = 'active'
          and ($1::uuid[] is null or t.gym_id = any($1))
      ),
      client_activity as (
        select
          (select count(*) from client_base) as total_clients,
          count(*) filter (where last_meaningful_activity_at::date = current_date) as daily_active_users,
          count(*) filter (where last_meaningful_activity_at >= now() - interval '7 days') as weekly_active_users,
          (select count(distinct fl.user_id) from food_logs fl join client_base cb on cb.id = fl.user_id where fl.logged_at >= now() - interval '7 days') as food_loggers,
          (select count(distinct wl.user_id) from weight_logs wl join client_base cb on cb.id = wl.user_id where wl.logged_at >= now() - interval '7 days') as weight_loggers,
          (select count(distinct wat.user_id) from water_logs wat join client_base cb on cb.id = wat.user_id where wat.logged_at >= now() - interval '7 days') as water_loggers,
          (select count(distinct hl.user_id) from habit_logs hl join client_base cb on cb.id = hl.user_id where hl.completed = true and hl.logged_at >= now() - interval '7 days') as habit_completers,
          (select count(distinct ae.user_id) from analytics_events ae join client_base cb on cb.id = ae.user_id where ae.event_name = 'burn_log' and ae.created_at >= now() - interval '7 days') as workout_loggers,
          (select count(distinct bcs.user_id) from body_composition_scans bcs join client_base cb on cb.id = bcs.user_id where bcs.user_confirmed = true and bcs.experience_scope = 'athlete' and bcs.created_at >= now() - interval '90 days') as body_scan_users_90d,
          (select count(*) from athlete_profiles ap join client_base cb on cb.id = ap.user_id where ap.enabled = true) as athlete_clients,
          (select round(avg(latest.score)) from client_base cb left join lateral (select score from compliance_scores where user_id = cb.id order by calculated_for_date desc limit 1) latest on true) as average_compliance_score
        from client_base
      ),
      trainer_activity as (
        select
          (select count(distinct m.sender_user_id) from messages m join trainer_base tb on tb.user_id = m.sender_user_id where m.created_at::date = current_date) as trainers_messaged_today,
          (select count(distinct m.receiver_user_id) from messages m join trainer_base tb on tb.user_id = m.sender_user_id join client_base cb on cb.id = m.receiver_user_id and cb.assigned_trainer_id = tb.id where m.created_at >= now() - interval '7 days') as clients_contacted_7d,
          (
            select count(*)
            from ai_usage_events e
            join trainer_base tb on tb.user_id = e.user_id
            where e.event_type = 'weekly_report_generation'
              and e.created_at >= now() - interval '7 days'
              and e.metadata->>'generatedBy' = 'trainer'
          ) as weekly_reviews_completed_7d,
          (select count(*) from risk_alerts where status = 'open' and ($1::uuid[] is null or gym_id = any($1))) as outstanding_followups,
          (select count(*) from messages cm join client_base cb on cb.id = cm.sender_user_id join trainer_base tb on tb.user_id = cm.receiver_user_id where cm.created_at >= now() - interval '7 days') as client_messages,
          (
            select count(*)
            from messages cm
            join client_base cb on cb.id = cm.sender_user_id
            join trainer_base tb on tb.user_id = cm.receiver_user_id
            where cm.created_at >= now() - interval '7 days'
              and exists (
                select 1 from messages reply
                where reply.sender_user_id = cm.receiver_user_id
                  and reply.receiver_user_id = cm.sender_user_id
                  and reply.created_at > cm.created_at
                  and reply.created_at <= cm.created_at + interval '48 hours'
              )
          ) as client_messages_answered_48h,
          (select count(*) from risk_alerts where created_at >= now() - interval '30 days' and ($1::uuid[] is null or gym_id = any($1))) as risk_alerts_generated,
          (select count(*) from risk_alerts where (resolved_at >= now() - interval '30 days' or (status in ('resolved','acknowledged') and created_at >= now() - interval '30 days')) and ($1::uuid[] is null or gym_id = any($1))) as risk_alerts_resolved,
          (select count(*) from coached_client_base where assigned_trainer_id is not null) as clients_monitored,
          (select count(*) from coached_client_base where assigned_trainer_id is null) as unassigned_clients,
          (select count(*) from trainers t join users u on u.id = t.user_id where t.status <> 'active' and u.status = 'active' and ($1::uuid[] is null or t.gym_id = any($1))) as pending_trainers,
          (select count(*) from trainer_base) as active_trainers
      ),
      business as (
        select
          count(cb.id) filter (where coalesce(s.plan::text, 'free') = 'free' or s.id is null) as free_users,
          count(cb.id) filter (where s.plan = 'premium') as premium_users,
          count(cb.id) filter (where s.plan = 'premium' and coalesce(ap.enabled, false) = false) as premium_review_candidates,
          count(cb.id) filter (where s.plan = 'trainer_pro') as trainer_pro_users,
          count(s.id) filter (where s.id is not null) as active_subscriptions,
          coalesce(sum(s.amount_cents), 0) as active_plan_value_cents
        from client_base cb
        left join athlete_profiles ap on ap.user_id = cb.id
        left join lateral (
          select *
          from subscriptions s
          where s.user_id = cb.id
            and (
              s.status in ('active', 'trialing', 'past_due')
              or (s.status = 'canceled' and s.current_period_end > now())
            )
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
        where ($1::uuid[] is null or gym_id = any($1))
      )
      select
        client_activity.*,
        trainer_activity.*,
        business.*,
        ai.*,
        case when client_activity.weekly_active_users > 0 then round(ai.ai_spend_cents / client_activity.weekly_active_users) else 0 end as cost_per_active_user_cents
      from client_activity, trainer_activity, business, ai
    `, [scope.gymIds]),
    query(`
      with days as (
        select generate_series(current_date - interval '13 days', current_date, interval '1 day')::date as period
      ),
      activity as (
        select fl.user_id, fl.logged_at::date as period, 'food' as type from food_logs fl join users u on u.id = fl.user_id where u.primary_role = 'client' and u.status = 'active' and fl.logged_at >= current_date - interval '13 days' and ($1::uuid[] is null or u.gym_id = any($1))
        union all select wl.user_id, wl.logged_at::date, 'weight' from weight_logs wl join users u on u.id = wl.user_id where u.primary_role = 'client' and u.status = 'active' and wl.logged_at >= current_date - interval '13 days' and ($1::uuid[] is null or u.gym_id = any($1))
        union all select wat.user_id, wat.logged_at::date, 'water' from water_logs wat join users u on u.id = wat.user_id where u.primary_role = 'client' and u.status = 'active' and wat.logged_at >= current_date - interval '13 days' and ($1::uuid[] is null or u.gym_id = any($1))
        union all select hl.user_id, hl.logged_at::date, 'habit' from habit_logs hl join users u on u.id = hl.user_id where u.primary_role = 'client' and u.status = 'active' and hl.logged_at >= current_date - interval '13 days' and hl.completed = true and ($1::uuid[] is null or u.gym_id = any($1))
        union all select ae.user_id, ae.created_at::date, 'workout' from analytics_events ae join users u on u.id = ae.user_id where u.primary_role = 'client' and u.status = 'active' and ae.event_name = 'burn_log' and ae.created_at >= current_date - interval '13 days' and ($1::uuid[] is null or u.gym_id = any($1))
      ),
      daily_activity as (
        select period,
          count(distinct user_id) as active_users,
          count(*) filter (where type = 'food') as food_logs,
          count(*) filter (where type = 'weight') as weight_logs,
          count(*) filter (where type = 'water') as water_logs,
          count(*) filter (where type = 'habit') as habit_completions,
          count(*) filter (where type = 'workout') as workout_logs
        from activity
        group by period
      ),
      daily_compliance as (
        select cs.calculated_for_date as period, round(avg(cs.score)) as average_compliance_score
        from compliance_scores cs
        join users u on u.id = cs.user_id
        where cs.calculated_for_date >= current_date - interval '13 days'
          and u.primary_role = 'client'
          and u.status = 'active'
          and ($1::uuid[] is null or u.gym_id = any($1))
        group by cs.calculated_for_date
      ),
      daily_ai as (
        select created_at::date as period, sum(estimated_cost_cents) as estimated_cost_cents
        from ai_usage_events
        where created_at >= current_date - interval '13 days'
          and ($1::uuid[] is null or gym_id = any($1))
        group by created_at::date
      )
      select
        d.period,
        coalesce(a.active_users, 0) as active_users,
        coalesce(a.food_logs, 0) as food_logs,
        coalesce(a.weight_logs, 0) as weight_logs,
        coalesce(a.water_logs, 0) as water_logs,
        coalesce(a.habit_completions, 0) as habit_completions,
        coalesce(a.workout_logs, 0) as workout_logs,
        coalesce(c.average_compliance_score, 0) as average_compliance_score,
        coalesce(ai.estimated_cost_cents, 0) as ai_cost_cents
      from days d
      left join daily_activity a on a.period = d.period
      left join daily_compliance c on c.period = d.period
      left join daily_ai ai on ai.period = d.period
      order by d.period
    `, [scope.gymIds]),
    query(`
      select rc.code, rc.type, coalesce(g.name, trainer_gym.name) as gym_name, tu.full_name as trainer_name,
        count(distinct u.id) as referred_users,
        count(current_subscription.user_id) filter (where current_subscription.plan in ('premium','trainer_pro')) as converted_users,
        coalesce(sum(current_subscription.amount_cents), 0) as active_plan_value_cents
      from referral_codes rc
      left join gyms g on g.id = rc.gym_id
      left join trainers t on t.id = rc.trainer_id
      left join gyms trainer_gym on trainer_gym.id = t.gym_id
      left join users tu on tu.id = t.user_id
      left join users u on (
        (rc.type = 'gym' and u.referred_by_gym_id = rc.gym_id and u.referred_by_trainer_id is null)
        or (rc.type = 'trainer' and u.referred_by_trainer_id = rc.trainer_id)
      )
      left join lateral (
        select s.user_id, s.plan, s.amount_cents
        from subscriptions s
        where s.user_id = u.id
          and (
            s.status in ('active', 'trialing', 'past_due')
            or (s.status = 'canceled' and s.current_period_end > now())
          )
        order by case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
        limit 1
      ) current_subscription on true
      where ($1::uuid[] is null or coalesce(rc.gym_id, trainer_gym.id) = any($1))
      group by rc.id, g.name, trainer_gym.name, tu.full_name
      order by referred_users desc, active_plan_value_cents desc
      limit 20
    `, [scope.gymIds])
  ]);

  const row = summary.rows[0] ?? {};
  const totalClients = Number(row.total_clients ?? 0);
  const weeklyActiveUsers = Number(row.weekly_active_users ?? 0);
  const clientMessages = Number(row.client_messages ?? 0);
  const clientMessagesAnswered = Number(row.client_messages_answered_48h ?? 0);
  const clientsMonitored = Number(row.clients_monitored ?? 0);
  const clientsContacted = Number(row.clients_contacted_7d ?? 0);
  const athleteClients = Number(row.athlete_clients ?? 0);
  const foodAiEvents = Number(row.food_ai_events ?? 0);
  const cacheHits = Number(row.cache_hits ?? 0);
  const monthCost = Number(row.monthly_estimated_cost_cents ?? 0);
  const dayOfMonth = Math.max(new Date().getDate(), 1);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  res.json({
    generatedAt: new Date().toISOString(),
    clients: {
      totalClients,
      dailyActiveUsers: Number(row.daily_active_users ?? 0),
      weeklyActiveUsers,
      foodLoggingRate: totalClients ? Math.round((Number(row.food_loggers ?? 0) / totalClients) * 100) : 0,
      weightLoggingRate: totalClients ? Math.round((Number(row.weight_loggers ?? 0) / totalClients) * 100) : 0,
      waterLoggingRate: totalClients ? Math.round((Number(row.water_loggers ?? 0) / totalClients) * 100) : 0,
      habitCompletionRate: totalClients ? Math.round((Number(row.habit_completers ?? 0) / totalClients) * 100) : 0,
      workoutLoggingRate: totalClients ? Math.round((Number(row.workout_loggers ?? 0) / totalClients) * 100) : 0,
      bodyScanUsers90d: Number(row.body_scan_users_90d ?? 0),
      athleteClients,
      bodyScanAdoptionRate: athleteClients ? Math.round((Number(row.body_scan_users_90d ?? 0) / athleteClients) * 100) : 0,
      averageComplianceScore: Number(row.average_compliance_score ?? 0)
    },
    trainers: {
      activeTrainers: Number(row.active_trainers ?? 0),
      trainersMessagedToday: Number(row.trainers_messaged_today ?? 0),
      clientsContacted7d: clientsContacted,
      followUpCoverageRate: clientsMonitored ? Math.min(100, Math.round((clientsContacted / clientsMonitored) * 100)) : 0,
      weeklyReviewsCompleted7d: Number(row.weekly_reviews_completed_7d ?? 0),
      outstandingFollowUps: Number(row.outstanding_followups ?? 0),
      unassignedClients: Number(row.unassigned_clients ?? 0),
      pendingTrainers: Number(row.pending_trainers ?? 0),
      responseWithin48hRate: clientMessages ? Math.min(100, Math.round((clientMessagesAnswered / clientMessages) * 100)) : 0,
      riskAlertsGenerated: Number(row.risk_alerts_generated ?? 0),
      riskAlertsResolved: Number(row.risk_alerts_resolved ?? 0),
      clientsMonitored
    },
    business: {
      freeUsers: Number(row.free_users ?? 0),
      premiumUsers: Number(row.premium_users ?? 0),
      premiumReviewCandidates: Number(row.premium_review_candidates ?? 0),
      trainerProUsers: Number(row.trainer_pro_users ?? 0),
      activeSubscriptions: Number(row.active_subscriptions ?? 0),
      activePlanValueCents: Number(row.active_plan_value_cents ?? 0),
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

adminRouter.get("/admin/notifications", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const [pendingTrainers, unassignedClients, freeClients, openRiskAlerts, recentAiErrors] = await Promise.all([
    query(`
      select count(*) as count
      from trainers t
      join users u on u.id = t.user_id
      where t.status <> 'active'
        and u.status = 'active'
        and ($1::uuid[] is null or t.gym_id = any($1))
    `, [scope.gymIds]),
    query(`
      select count(distinct u.id) as count
      from users u
      join subscriptions s on s.user_id = u.id
      where u.primary_role = 'client'
        and u.status = 'active'
        and u.assigned_trainer_id is null
        and s.plan in ('premium', 'trainer_pro')
        and (s.status in ('active', 'trialing', 'past_due') or (s.status = 'canceled' and s.current_period_end > now()))
        and ($1::uuid[] is null or u.gym_id = any($1))
    `, [scope.gymIds]),
    query(`
      select count(*) as count
      from users u
      left join lateral (
        select s.plan, s.status
        from subscriptions s
        where s.user_id = u.id
          and (s.status in ('active', 'trialing', 'past_due') or (s.status = 'canceled' and s.current_period_end > now()))
        order by case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
        limit 1
      ) active_subscription on true
      where u.primary_role = 'client'
        and u.status = 'active'
        and coalesce(active_subscription.plan::text, 'free') = 'free'
        and ($1::uuid[] is null or u.gym_id = any($1))
    `, [scope.gymIds]),
    query(`
      select count(*) as count
      from risk_alerts
      where status = 'open'
        and ($1::uuid[] is null or gym_id = any($1))
    `, [scope.gymIds]),
    query(`
      select count(*) as count
      from ai_usage_events
      where status = 'error'
        and created_at >= now() - interval '24 hours'
        and ($1::uuid[] is null or gym_id = any($1))
    `, [scope.gymIds])
  ]);

  const notifications = [
    {
      id: "pending-trainers",
      type: "trainer_approval",
      severity: "important",
      title: "Trainer approvals waiting",
      body: "Approve new trainers before they can manage clients.",
      href: "/admin/users",
      count: Number(pendingTrainers.rows[0]?.count ?? 0)
    },
    {
      id: "unassigned-clients",
      type: "client_assignment",
      severity: "critical",
      title: "Clients need trainer assignment",
      body: "Premium coached members should be assigned so someone is accountable for them.",
      href: "/admin/users",
      count: Number(unassignedClients.rows[0]?.count ?? 0)
    },
    {
      id: "free-clients",
      type: "premium_review",
      severity: "important",
      title: "Members eligible for Premium review",
      body: "Review active Free members before offering Premium coaching. This is a candidate count, not guaranteed revenue.",
      href: "/admin/users",
      count: Number(freeClients.rows[0]?.count ?? 0)
    },
    {
      id: "risk-alerts",
      type: "risk_alerts",
      severity: "important",
      title: "Open client risk alerts",
      body: "Review clients who may be inactive, missing logs, or drifting from their goal.",
      href: "/trainer",
      count: Number(openRiskAlerts.rows[0]?.count ?? 0)
    },
    {
      id: "ai-errors",
      type: "ai_errors",
      severity: "important",
      title: "AI errors in the last 24 hours",
      body: "Check this when food estimates or AI coach replies feel unreliable.",
      href: "/admin#ai-business-monitor",
      count: Number(recentAiErrors.rows[0]?.count ?? 0)
    }
  ]
    .filter((notification) => notification.count > 0)
    .sort((a, b) => {
      const severityDifference = (a.severity === "critical" ? 0 : 1) - (b.severity === "critical" ? 0 : 1);
      return severityDifference || b.count - a.count;
    });

  res.json({
    notifications,
    summary: {
      total: notifications.reduce((total, notification) => total + notification.count, 0),
      critical: notifications.filter((notification) => notification.severity === "critical").length,
      important: notifications.filter((notification) => notification.severity === "important").length
    }
  });
});

adminRouter.post("/admin/assign-client", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    const input = assignClientSchema.parse(req.body);
    const scope = await getAdminGymScope(req.user!);
    const clientGymId = await getUserGymId(input.clientId);
    const trainerGymId = input.trainerId ? await getTrainerGymId(input.trainerId) : null;
    if (!scopeAllowsGym(scope, clientGymId) || (input.trainerId && !scopeAllowsGym(scope, trainerGymId))) {
      return res.status(403).json({ error: "This account cannot manage that gym" });
    }
    if (input.trainerId && clientGymId && trainerGymId !== clientGymId) {
      return res.status(400).json({ error: "Client and trainer must belong to the same gym" });
    }
    if (input.trainerId && !await hasTrainerSupportedAccess(input.clientId)) {
      return res.status(409).json({
        error: "Upgrade this member to Premium before assigning a trainer.",
        code: "trainer_assignment_requires_premium"
      });
    }
    const result = await query(
      `
      update users
      set assigned_trainer_id = $2,
          gym_id = case
            when $2::uuid is null then gym_id
            else coalesce(gym_id, (select gym_id from trainers where id = $2))
          end,
          coaching_mode = case
            when $2::uuid is null then coaching_mode
            else 'human_coach'
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

adminRouter.get("/admin/users", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select u.id, u.full_name, u.email, u.primary_role::text as primary_role, u.gym_id, g.name as gym_name,
      u.assigned_trainer_id, trainer_user.full_name as assigned_trainer_name,
      u.referred_by_gym_id, referred_gym.name as referred_gym_name,
      u.referred_by_trainer_id, referred_trainer_user.full_name as referred_trainer_name,
      u.coaching_mode,
      coalesce(athlete_profile.enabled, false) as athlete_mode_enabled,
      coalesce((select array_agg(goa.gym_id) from gym_owner_assignments goa where goa.user_id = u.id), '{}') as owner_gym_ids,
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
      coalesce(active_subscription.plan::text, 'free') as current_plan,
      active_subscription.status as subscription_status,
      active_subscription.provider as subscription_provider,
      active_subscription.current_period_end as subscription_current_period_end,
      coalesce(active_subscription.plan::text, 'free') in ('premium', 'trainer_pro') as trainer_assignment_eligible,
      u.status,
      u.created_at
    from users u
    left join gyms g on g.id = u.gym_id
    left join trainers assigned_trainer on assigned_trainer.id = u.assigned_trainer_id
    left join users trainer_user on trainer_user.id = assigned_trainer.user_id
    left join gyms referred_gym on referred_gym.id = u.referred_by_gym_id
    left join trainers referred_trainer on referred_trainer.id = u.referred_by_trainer_id
    left join users referred_trainer_user on referred_trainer_user.id = referred_trainer.user_id
    left join athlete_profiles athlete_profile on athlete_profile.user_id = u.id
    left join lateral (
      select s.plan, s.status, s.provider, s.current_period_end
      from subscriptions s
      where s.user_id = u.id
        and (s.status in ('active', 'trialing', 'past_due') or (s.status = 'canceled' and s.current_period_end > now()))
      order by case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
      limit 1
    ) active_subscription on true
    where ($1::uuid[] is null or u.gym_id = any($1))
    order by u.created_at desc
  `, [scope.gymIds]);
  res.json({ users: result.rows, canManageOwnerGyms: req.user!.isPlatformOwner });
});

adminRouter.patch("/admin/users/:userId/status", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  const db = await pool.connect();
  try {
    const input = userStatusSchema.parse(req.body);
    const scope = await getAdminGymScope(req.user!);
    if (!scopeAllowsGym(scope, await getUserGymId(req.params.userId))) {
      return res.status(403).json({ error: "This account cannot manage that gym" });
    }
    if (req.params.userId === req.user!.id && input.status !== "active") {
      return res.status(400).json({ error: "You cannot deactivate your own owner account" });
    }

    await db.query("begin");

    const result = await db.query(
      `
      update users
      set status = $2, updated_at = now()
      where id = $1
      returning id, full_name, email, primary_role, status
      `,
      [req.params.userId, input.status]
    );
    const user = result.rows[0];
    if (!user) {
      await db.query("rollback");
      return res.status(404).json({ error: "User not found" });
    }

    if (input.status === "inactive") {
      await db.query("update trainers set status = 'inactive' where user_id = $1", [req.params.userId]);
      await db.query(
        `
        update users
        set assigned_trainer_id = null, updated_at = now()
        where assigned_trainer_id in (select id from trainers where user_id = $1)
        `,
        [req.params.userId]
      );
    } else if (user.primary_role === "trainer") {
      await db.query("update trainers set status = 'active' where user_id = $1", [req.params.userId]);
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

adminRouter.post("/admin/owners/:userId/gyms", requireAuth, requireRole(["owner"]), async (req, res, next) => {
  try {
    if (!req.user!.isPlatformOwner) return res.status(403).json({ error: "Only the Ascend platform owner can assign owner gyms" });
    const input = ownerGymSchema.parse(req.body);
    const owner = await query(
      "select 1 from user_roles where user_id = $1 and role = 'owner'",
      [req.params.userId]
    );
    if (!owner.rows[0]) return res.status(400).json({ error: "The selected account is not a gym owner" });
    await query(
      "insert into gym_owner_assignments (user_id, gym_id) values ($1, $2) on conflict do nothing",
      [req.params.userId, input.gymId]
    );
    res.status(201).json({ assigned: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/owners/:userId/gyms/:gymId", requireAuth, requireRole(["owner"]), async (req, res, next) => {
  try {
    if (!req.user!.isPlatformOwner) return res.status(403).json({ error: "Only the Ascend platform owner can remove owner gyms" });
    const gymId = z.string().uuid().parse(req.params.gymId);
    await query("delete from gym_owner_assignments where user_id = $1 and gym_id = $2", [req.params.userId, gymId]);
    res.json({ assigned: false });
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/admin/users/:userId", requireAuth, requireRole(["owner"]), async (req, res, next) => {
  const db = await pool.connect();
  try {
    const scope = await getAdminGymScope(req.user!);
    if (!scopeAllowsGym(scope, await getUserGymId(req.params.userId))) {
      return res.status(403).json({ error: "This account cannot manage that gym" });
    }
    await db.query("begin");
    const targetResult = await db.query<{
      id: string;
      firebase_uid: string;
      full_name: string;
      email: string;
      status: string;
      primary_role: "client" | "trainer" | "admin" | "owner";
      roles: Array<"client" | "trainer" | "admin" | "owner">;
      trainer_id: string | null;
      has_live_paid_subscription: boolean;
    }>(
      `
      select u.id, u.firebase_uid, u.full_name, u.email, u.status, u.primary_role,
        coalesce((select array_agg(ur.role) from user_roles ur where ur.user_id = u.id), '{}') as roles,
        t.id as trainer_id,
        exists (
          select 1 from subscriptions s
          where s.user_id = u.id
            and s.provider <> 'manual'
            and (
              s.status in ('active', 'trialing', 'past_due')
              or (s.status = 'canceled' and s.current_period_end > now())
            )
        ) as has_live_paid_subscription
      from users u
      left join trainers t on t.user_id = u.id
      where u.id = $1
      for update of u
      `,
      [req.params.userId]
    );
    const target = targetResult.rows[0];
    if (!target) {
      await db.query("rollback");
      return res.status(404).json({ error: "User not found" });
    }

    const blocked = permanentDeletionBlock({
      id: target.id,
      status: target.status,
      primaryRole: target.primary_role,
      roles: target.roles,
      hasLivePaidSubscription: target.has_live_paid_subscription
    }, req.user!.id);
    if (blocked) {
      await db.query("rollback");
      return res.status(400).json({ error: blocked });
    }

    const mediaResult = await db.query<{ image_s3_key: string | null }>(
      `
      select image_s3_key from food_logs where user_id = $1 and image_s3_key is not null
      union
      select image_s3_key from progress_photos where user_id = $1 and image_s3_key is not null
      union
      select profile_photo_s3_key as image_s3_key from users where id = $1 and profile_photo_s3_key is not null
      `,
      [target.id]
    );

    if (target.trainer_id) {
      await db.query("update users set assigned_trainer_id = null, updated_at = now() where assigned_trainer_id = $1", [target.trainer_id]);
      await db.query("update users set referred_by_trainer_id = null, updated_at = now() where referred_by_trainer_id = $1", [target.trainer_id]);
      await db.query("update subscriptions set referred_by_trainer_id = null, updated_at = now() where referred_by_trainer_id = $1", [target.trainer_id]);
      await db.query("update risk_alerts set trainer_id = null where trainer_id = $1", [target.trainer_id]);
      await db.query("update weekly_reports set trainer_id = null where trainer_id = $1", [target.trainer_id]);
      await db.query(
        "update subscriptions set referral_code_id = null where referral_code_id in (select id from referral_codes where trainer_id = $1)",
        [target.trainer_id]
      );
      await db.query("delete from referral_codes where trainer_id = $1", [target.trainer_id]);
    }
    await db.query("update referral_codes set created_by_user_id = null where created_by_user_id = $1", [target.id]);

    try {
      await getFirebaseAuth().deleteUser(target.firebase_uid);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") throw error;
    }

    await deleteStoredObjects(mediaResult.rows.map((row) => row.image_s3_key));
    await db.query("delete from users where id = $1", [target.id]);
    await db.query("commit");

    res.json({ deleted: { id: target.id, full_name: target.full_name, email: target.email } });
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

adminRouter.post("/admin/users/:userId/subscription", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  try {
    const input = grantSubscriptionSchema.parse(req.body);
    const scope = await getAdminGymScope(req.user!);
    if (!scopeAllowsGym(scope, await getUserGymId(req.params.userId))) {
      return res.status(403).json({ error: "This account cannot manage that gym" });
    }
    const userResult = await query<{ referred_by_gym_id: string | null; referred_by_trainer_id: string | null }>(
      "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
      [req.params.userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });

    const externalSubscription = await query<{ provider: string }>(
      `
      select provider::text as provider
      from subscriptions
      where user_id = $1
        and provider <> 'manual'
        and (
          status in ('active', 'trialing', 'past_due')
          or (status = 'canceled' and current_period_end > now())
        )
      order by created_at desc
      limit 1
      `,
      [req.params.userId]
    );
    if (externalSubscription.rows[0]) {
      return res.status(409).json({
        error: `This member has an active ${externalSubscription.rows[0].provider.replace("_", " ")} subscription. Manage billing with that provider before changing manual access.`
      });
    }

    await query("update subscriptions set status = 'canceled', updated_at = now() where user_id = $1 and provider = 'manual' and status in ('active', 'trialing')", [
      req.params.userId
    ]);

    if (input.plan === "free") {
      return res.json({ subscription: { plan: "free", status: "active" } });
    }

    const amountCents = input.plan === "premium" ? 1999 : 9999;
    const reference = `PILOT-${req.params.userId}-${Date.now()}`;
    const result = await query(
      `
      insert into subscriptions (
        user_id, plan, provider, provider_subscription_id, status, amount_cents, currency,
        current_period_start, current_period_end, referred_by_gym_id, referred_by_trainer_id
      )
      values ($1, $2, 'manual', $3, 'active', $4, 'MYR', now(), now() + interval '1 month', $5, $6)
      returning *
      `,
      [req.params.userId, input.plan, reference, amountCents, user.referred_by_gym_id, user.referred_by_trainer_id]
    );

    res.status(201).json({ subscription: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/trainers", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select t.id, t.user_id, t.gym_id, u.full_name, u.email, u.status as user_status, g.name as gym_name, t.specialties, t.status
    from trainers t
    join users u on u.id = t.user_id
    join gyms g on g.id = t.gym_id
    where ($1::uuid[] is null or t.gym_id = any($1))
    order by g.name, u.full_name
  `, [scope.gymIds]);
  res.json({ trainers: result.rows });
});

adminRouter.patch("/admin/users/:userId/role", requireAuth, requireRole(["admin", "owner"]), async (req, res, next) => {
  const db = await pool.connect();
  try {
    const input = roleSchema.parse(req.body);
    const scope = await getAdminGymScope(req.user!);
    const currentTarget = await query<{ gym_id: string | null; primary_role: string }>(
      "select gym_id, primary_role::text from users where id = $1",
      [req.params.userId]
    );
    const targetGymId = input.gymId ?? currentTarget.rows[0]?.gym_id ?? null;
    if (!scopeAllowsGym(scope, targetGymId)) {
      return res.status(403).json({ error: "This account cannot manage that gym" });
    }
    if ((input.role === "owner" || currentTarget.rows[0]?.primary_role === "owner") && !scope.isPlatformOwner) {
      return res.status(403).json({ error: "Only the Ascend platform owner can appoint gym owners" });
    }

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
      if (input.gymId) {
        await db.query(
          "insert into gym_owner_assignments (user_id, gym_id) values ($1, $2) on conflict do nothing",
          [req.params.userId, input.gymId]
        );
      }
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
    const scope = await getAdminGymScope(req.user!);
    const referralGymId = input.type === "gym" ? input.gymId : input.trainerId ? await getTrainerGymId(input.trainerId) : null;
    if (!scopeAllowsGym(scope, referralGymId)) {
      return res.status(403).json({ error: "This account cannot create referrals for that gym" });
    }
    const result = await query(
      `
      insert into referral_codes (code, type, gym_id, trainer_id, created_by_user_id)
      values ($1, $2, $3, $4, $5)
      on conflict (code) do nothing
      returning *
      `,
      [input.code.toUpperCase(), input.type, input.gymId ?? null, input.trainerId ?? null, req.user!.id]
    );
    if (!result.rows[0]) return res.status(409).json({ error: "That referral code already exists. Choose a unique code." });
    res.status(201).json({ referral: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/admin/referrals/analytics", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const result = await query(`
    select rc.code, rc.type, coalesce(g.name, trainer_gym.name) as gym_name, tu.full_name as trainer_name,
      count(distinct u.id) as referred_users,
      coalesce(sum(current_subscription.amount_cents), 0) as active_plan_value_cents,
      coalesce(min(current_subscription.currency), 'MYR') as currency,
      count(distinct current_subscription.currency) as currency_count
    from referral_codes rc
    left join gyms g on g.id = rc.gym_id
    left join trainers t on t.id = rc.trainer_id
    left join gyms trainer_gym on trainer_gym.id = t.gym_id
    left join users tu on tu.id = t.user_id
    left join users u on (
      (rc.type = 'gym' and u.referred_by_gym_id = rc.gym_id and u.referred_by_trainer_id is null)
      or (rc.type = 'trainer' and u.referred_by_trainer_id = rc.trainer_id)
    )
    left join lateral (
      select s.amount_cents, s.currency
      from subscriptions s
      where s.user_id = u.id
        and (
          s.status in ('active', 'trialing', 'past_due')
          or (s.status = 'canceled' and s.current_period_end > now())
        )
      order by case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
      limit 1
    ) current_subscription on true
    where ($1::uuid[] is null or coalesce(rc.gym_id, trainer_gym.id) = any($1))
    group by rc.id, g.name, trainer_gym.name, tu.full_name
    order by active_plan_value_cents desc, referred_users desc
  `, [scope.gymIds]);
  res.json({ referrals: result.rows });
});

adminRouter.get("/admin/subscriptions", requireAuth, requireRole(["admin", "owner"]), async (req, res) => {
  const scope = await getAdminGymScope(req.user!);
  const input = subscriptionListSchema.parse(req.query);
  const offset = (input.page - 1) * input.pageSize;
  const [result, countResult, summaryResult] = await Promise.all([query(`
    select s.*, u.full_name, u.email, g.name as referred_gym_name, tu.full_name as referred_trainer_name
    from subscriptions s
    join users u on u.id = s.user_id
    left join gyms g on g.id = s.referred_by_gym_id
    left join trainers t on t.id = s.referred_by_trainer_id
    left join users tu on tu.id = t.user_id
    where ($1::uuid[] is null or u.gym_id = any($1))
      and (
        $2 = 'all'
        or ($2 = 'current' and s.id = (
          select s2.id from subscriptions s2
          where s2.user_id = s.user_id
            and (s2.status in ('active', 'trialing', 'past_due') or (s2.status = 'canceled' and s2.current_period_end > now()))
          order by case s2.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s2.created_at desc
          limit 1
        ))
        or s.status::text = $2
      )
      and ($3 = '' or s.provider::text = $3)
      and ($4 = '' or u.full_name ilike '%' || $4 || '%' or u.email ilike '%' || $4 || '%' or coalesce(g.name, '') ilike '%' || $4 || '%')
    order by s.created_at desc
    limit $5 offset $6
  `, [scope.gymIds, input.status, input.provider, input.q, input.pageSize, offset]), query(`
    select count(*) as total
    from subscriptions s
    join users u on u.id = s.user_id
    left join gyms g on g.id = s.referred_by_gym_id
    where ($1::uuid[] is null or u.gym_id = any($1))
      and (
        $2 = 'all'
        or ($2 = 'current' and s.id = (
          select s2.id from subscriptions s2
          where s2.user_id = s.user_id
            and (s2.status in ('active', 'trialing', 'past_due') or (s2.status = 'canceled' and s2.current_period_end > now()))
          order by case s2.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s2.created_at desc
          limit 1
        ))
        or s.status::text = $2
      )
      and ($3 = '' or s.provider::text = $3)
      and ($4 = '' or u.full_name ilike '%' || $4 || '%' or u.email ilike '%' || $4 || '%' or coalesce(g.name, '') ilike '%' || $4 || '%')
  `, [scope.gymIds, input.status, input.provider, input.q]), query(`
    with current_subscriptions as (
      select distinct on (s.user_id) s.user_id, s.status
      from subscriptions s
      join users u on u.id = s.user_id
      where ($1::uuid[] is null or u.gym_id = any($1))
        and (s.status in ('active', 'trialing', 'past_due') or (s.status = 'canceled' and s.current_period_end > now()))
      order by s.user_id, case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
    )
    select
      count(*) as current,
      count(*) filter (where status = 'trialing') as trials,
      count(*) filter (where status = 'past_due') as past_due
    from current_subscriptions
  `, [scope.gymIds])]);
  const total = Number(countResult.rows[0]?.total ?? 0);
  res.json({
    subscriptions: result.rows,
    summary: {
      current: Number(summaryResult.rows[0]?.current ?? 0),
      trials: Number(summaryResult.rows[0]?.trials ?? 0),
      pastDue: Number(summaryResult.rows[0]?.past_due ?? 0)
    },
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize))
    }
  });
});
