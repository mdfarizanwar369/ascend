import type { GoalType } from "@ascend/shared";
import { query } from "../db/pool";
import { calculateMomentumV2,type MomentumDay } from "../domain/momentumV2";
import { getPrivateHealthActivityDays } from "./healthActivityService";
import { resolveNutritionTargets } from "./nutritionTargetService";

// Self-only derived scores. Do not persist them in the existing shared Momentum,
// weekly report, trainer or AI tables: those consumers lack Health sharing consent.
export async function getPrivateHealthInsights(userId: string) {
  const activity = await getPrivateHealthActivityDays(userId);
  if (!activity.length) return { days:[],momentum:null };
  const timezone = activity.at(-1)!.timezone;
  const [profile,targets,logs] = await Promise.all([
    query<{ goal_type:GoalType | null; created_day:string }>("select goal_type,(created_at at time zone $2)::date::text as created_day from users where id=$1",[userId,timezone]),
    resolveNutritionTargets(userId),
    query<{ day:string; meals:string; calories:string; protein:string; water:string; sleep:MomentumDay["sleepQuality"]; assigned:string; completed:string }>(`
      with days as (select * from unnest($2::date[],$3::text[]) as t(day,timezone))
      select d.day::text,
        (select count(*) from food_logs f where f.user_id=$1 and (f.logged_at at time zone d.timezone)::date=d.day)::text as meals,
        (select coalesce(sum(calories),0) from food_logs f where f.user_id=$1 and (f.logged_at at time zone d.timezone)::date=d.day)::text as calories,
        (select coalesce(sum(protein_g),0) from food_logs f where f.user_id=$1 and (f.logged_at at time zone d.timezone)::date=d.day)::text as protein,
        (select coalesce(sum(amount_ml),0) from water_logs w where w.user_id=$1 and (w.logged_at at time zone d.timezone)::date=d.day)::text as water,
        rc.sleep_quality as sleep,
        (coalesce(h.assigned,0)+coalesce(m.assigned,0))::text as assigned,
        (coalesce(h.completed,0)+coalesce(m.completed,0))::text as completed
      from days d left join recovery_checkins rc on rc.user_id=$1 and rc.checkin_date=d.day
      left join lateral (
        select count(distinct h.id) as assigned,count(distinct hl.habit_id) filter(where hl.completed) as completed
        from habits h left join habit_logs hl on hl.user_id=$1 and hl.habit_id=h.id and (hl.logged_at at time zone d.timezone)::date=d.day
        where h.user_id=$1 and h.active and (h.created_at at time zone d.timezone)::date<=d.day
          and lower(h.name) !~ '(meal|food|protein|water|hydrat|workout|exercise|steps|sleep)'
      ) h on true
      left join lateral (
        select count(*) as assigned,count(*) filter(where status='completed') as completed
        from trainer_missions where client_user_id=$1 and due_date::date=d.day
      ) m on true order by d.day`,[userId,activity.map(day => day.day),activity.map(day => day.timezone)])
  ]);
  const created = profile.rows[0]?.created_day;
  const days: MomentumDay[] = logs.rows.filter(row => !created || row.day >= created).map((row,index) => {
    const day = activity.find(item => item.day === row.day)!;
    return { date:row.day,weight:1+index*0.12,meals:Number(row.meals),calories:Number(row.calories),proteinG:Number(row.protein),
      waterMl:Number(row.water),workouts:day.workoutCount,activeMinutes:0,steps:day.steps ?? 0,activeCalories:day.displayedCalories ?? 0,
      sleepQuality:row.sleep,focusAssigned:Number(row.assigned),focusCompleted:Number(row.completed) };
  });
  const momentum = days.length ? calculateMomentumV2({ goal:profile.rows[0]?.goal_type ?? null,calorieTarget:targets.calories,
    proteinTargetG:targets.proteinG,waterTargetMl:targets.waterMl,days }) : null;
  return { days:activity,momentum };
}
