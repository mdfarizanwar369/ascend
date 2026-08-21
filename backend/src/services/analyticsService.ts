import { query } from "../db/pool";

export async function getRevenueByGym(gymIds: string[] | null = null) {
  const result = await query(`
    with current_subscriptions as (
      select distinct on (s.user_id)
        s.user_id,
        s.amount_cents,
        s.currency
      from subscriptions s
      where s.status in ('active', 'trialing', 'past_due')
        or (s.status = 'canceled' and s.current_period_end > now())
      order by
        s.user_id,
        case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc,
        s.created_at desc
    )
    select
      g.id,
      g.name as gym_name,
      coalesce(sum(cs.amount_cents), 0) as active_plan_value_cents,
      count(cs.user_id) as active_subscriptions,
      coalesce(min(cs.currency), 'MYR') as currency,
      count(distinct cs.currency) as currency_count
    from gyms g
    left join users u on u.gym_id = g.id and u.primary_role = 'client' and u.status = 'active'
    left join current_subscriptions cs on cs.user_id = u.id
    where ($1::uuid[] is null or g.id = any($1))
    group by g.id
    order by active_plan_value_cents desc, g.name
  `, [gymIds]);
  return result.rows;
}

export async function getRevenueByTrainer(gymIds: string[] | null = null) {
  const result = await query(`
    select
      t.id,
      u.full_name as trainer_name,
      g.id as gym_id,
      g.name as gym_name,
      coalesce(assigned.clients_assigned, 0) as clients_assigned,
      coalesce(contacted.clients_contacted_7d, 0) as clients_contacted_7d,
      coalesce(reviews.weekly_reviews_7d, 0) as weekly_reviews_7d,
      coalesce(alerts.open_risk_alerts, 0) as open_risk_alerts,
      coalesce(attribution.active_plan_value_cents, 0) as attributed_plan_value_cents,
      coalesce(attribution.active_subscriptions, 0) as attributed_subscriptions,
      coalesce(attribution.currency, 'MYR') as currency,
      coalesce(attribution.currency_count, 0) as currency_count
    from trainers t
    join users u on u.id = t.user_id
    join gyms g on g.id = t.gym_id
    left join lateral (
      select count(*) as clients_assigned
      from users c
      where c.assigned_trainer_id = t.id
        and c.primary_role = 'client'
        and c.status = 'active'
    ) assigned on true
    left join lateral (
      select count(distinct m.receiver_user_id) as clients_contacted_7d
      from messages m
      join users c on c.id = m.receiver_user_id
      where m.sender_user_id = u.id
        and m.created_at >= now() - interval '7 days'
        and c.assigned_trainer_id = t.id
        and c.status = 'active'
    ) contacted on true
    left join lateral (
      select count(*) as weekly_reviews_7d
      from weekly_reports wr
      where wr.trainer_id = t.id
        and wr.created_at >= now() - interval '7 days'
    ) reviews on true
    left join lateral (
      select count(*) as open_risk_alerts
      from risk_alerts ra
      where ra.trainer_id = t.id and ra.status = 'open'
    ) alerts on true
    left join lateral (
      select
        coalesce(sum(current_subscription.amount_cents), 0) as active_plan_value_cents,
        count(*) as active_subscriptions,
        min(current_subscription.currency) as currency,
        count(distinct current_subscription.currency) as currency_count
      from (
        select distinct on (s.user_id) s.amount_cents, s.currency
        from subscriptions s
        where s.referred_by_trainer_id = t.id
          and (
            s.status in ('active', 'trialing', 'past_due')
            or (s.status = 'canceled' and s.current_period_end > now())
          )
        order by s.user_id, case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
      ) current_subscription
    ) attribution on true
    where t.status = 'active'
      and u.status = 'active'
      and ($1::uuid[] is null or g.id = any($1))
    order by clients_contacted_7d desc, clients_assigned desc, u.full_name
  `, [gymIds]);
  return result.rows;
}
