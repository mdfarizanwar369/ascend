import { query } from "../db/pool";

export async function generateRiskAlerts() {
  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'inactive_7_days', 'high',
      u.full_name || ' has been inactive for 7 days.'
    from users u
    where u.primary_role = 'client'
      and not exists (
        select 1 from analytics_events ae where ae.user_id = u.id and ae.created_at > now() - interval '7 days'
      )
      and not exists (
        select 1 from risk_alerts ra where ra.user_id = u.id and ra.type = 'inactive_7_days' and ra.status = 'open'
      )
  `);

  await query(`
    insert into risk_alerts (user_id, trainer_id, gym_id, type, severity, message)
    select u.id, u.assigned_trainer_id, u.gym_id, 'low_compliance', 'high',
      u.full_name || ' has a compliance score below 50.'
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
}

