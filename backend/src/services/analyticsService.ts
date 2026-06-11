import { query } from "../db/pool";

export async function getRevenueByGym() {
  const result = await query(`
    select g.id, g.name as gym_name, coalesce(sum(s.amount_cents), 0) as revenue_cents, count(s.id) as active_subscriptions
    from gyms g
    left join subscriptions s on s.referred_by_gym_id = g.id and s.status = 'active'
    group by g.id
    order by revenue_cents desc
  `);
  return result.rows;
}

export async function getRevenueByTrainer() {
  const result = await query(`
    select t.id, u.full_name as trainer_name, g.name as gym_name,
      coalesce(sum(s.amount_cents), 0) as revenue_cents,
      count(s.id) as active_subscriptions
    from trainers t
    join users u on u.id = t.user_id
    join gyms g on g.id = t.gym_id
    left join subscriptions s on s.referred_by_trainer_id = t.id and s.status = 'active'
    group by t.id, u.full_name, g.name
    order by revenue_cents desc
  `);
  return result.rows;
}
