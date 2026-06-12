import { query } from "../db/pool";

export async function generateRiskAlerts() {
  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'inactive_7_days', 'high',
      u.full_name || ' has been inactive for 7 days.'
    from users u
    where u.primary_role = 'client'
      and not exists (select 1 from food_logs fl where fl.user_id = u.id and fl.logged_at > now() - interval '7 days')
      and not exists (select 1 from weight_logs wl where wl.user_id = u.id and wl.logged_at > now() - interval '7 days')
      and not exists (select 1 from water_logs wat where wat.user_id = u.id and wat.logged_at > now() - interval '7 days')
      and not exists (select 1 from habit_logs hl where hl.user_id = u.id and hl.logged_at > now() - interval '7 days')
      and not exists (select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at > now() - interval '7 days')
      and not exists (
        select 1 from risk_alerts ra where ra.user_id = u.id and ra.type = 'inactive_7_days' and ra.status = 'open'
      )
  `);

  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'low_compliance', 'high',
      u.full_name || ' has low momentum today.'
    from users u
    join compliance_scores cs on cs.user_id = u.id and cs.calculated_for_date = current_date
    where cs.score < 50
      and not exists (
        select 1 from risk_alerts ra where ra.user_id = u.id and ra.type = 'low_compliance' and ra.status = 'open'
      )
  `);

  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'no_food_logs', 'medium',
      u.full_name || ' has not logged food for 3 days.'
    from users u
    where u.primary_role = 'client'
      and not exists (
        select 1 from food_logs fl where fl.user_id = u.id and fl.logged_at > now() - interval '3 days'
      )
      and not exists (
        select 1 from risk_alerts ra where ra.user_id = u.id and ra.type = 'no_food_logs' and ra.status = 'open'
      )
  `);

  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'weight_trend_off_goal', 'medium',
      u.full_name || '''s weight trend is moving away from their goal.'
    from users u
    join lateral (
      select weight_kg
      from weight_logs
      where user_id = u.id
      order by logged_at desc
      limit 1
    ) latest on true
    join lateral (
      select weight_kg
      from weight_logs
      where user_id = u.id
      order by logged_at desc
      offset 1
      limit 1
    ) previous on true
    where u.primary_role = 'client'
      and u.goal_type is not null
      and (
        (u.goal_type = 'fat_loss' and latest.weight_kg > previous.weight_kg + 0.3)
        or (u.goal_type = 'muscle_gain' and latest.weight_kg < previous.weight_kg - 0.3)
      )
      and not exists (
        select 1 from risk_alerts ra where ra.user_id = u.id and ra.type = 'weight_trend_off_goal' and ra.status = 'open'
      )
  `);
}
