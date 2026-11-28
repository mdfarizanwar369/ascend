import { ptLocalDate, type ChallengeDetail, type ChallengeList, type ChallengeRole, type ChallengeRules, type ChallengeTemplate, type MonthlyChallenge } from "@ascend/shared";
import { query } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { getAdminGymScope } from "./adminScopeService";
import { resolveNutritionTargets } from "./nutritionTargetService";

type Gym = ChallengeList["gyms"][number];
type ChallengeRow = Omit<MonthlyChallenge, "status"> & { published: boolean; today: string };
type ChallengeScore = {
  userId: string;
  displayName: string | null;
  waterTargetMl: number | null;
  score: number;
  todayActions: ChallengeTemplate[];
  mealLogAvailable: boolean;
};

const fields = `
  c.id, c.gym_id as "gymId", c.time_zone as "timeZone", g.name as "gymName",
  case when c.trainer_id is null then 'gym' else 'trainer' end as audience,
  coalesce(coach.full_name, g.name) as organizer, c.title, c.template, c.actions,
  c.required_actions as "requiredActions", c.starts_on::text as "startsOn", c.ends_on::text as "endsOn",
  c.goal_days as "goalDays", c.leaderboard, c.version, c.published_at is not null as published,
  (now() at time zone c.time_zone)::date::text as today, m.user_id is not null as joined`;
const from = `
  from monthly_challenges c
  join gyms g on g.id = c.gym_id
  left join trainers t on t.id = c.trainer_id
  left join users coach on coach.id = t.user_id
  left join monthly_challenge_members m on m.challenge_id = c.id and m.user_id = $1`;
const membershipScope = `
  u.gym_id = c.gym_id and u.primary_role = 'client' and u.status = 'active'
  and (c.trainer_id is null or (c.trainer_id = u.assigned_trainer_id and t.status = 'active' and coach.status = 'active'))`;

function challengeError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function toChallenge(row: ChallengeRow): MonthlyChallenge {
  const { today, published, ...challenge } = row;
  const status = !published ? "draft" : today < row.startsOn ? "upcoming" : today > row.endsOn ? "finished" : "live";
  return { ...challenge, status };
}

async function availableGyms(user: AuthUser, role: ChallengeRole): Promise<Gym[]> {
  if (role === "gym") {
    const scope = await getAdminGymScope(user);
    return (await query<Gym>(`
      select id, name, timezone as "timeZone" from gyms
      where ($1::uuid[] is null or id = any($1)) order by name, id
    `, [scope.gymIds])).rows;
  }
  if (role === "trainer") {
    return (await query<Gym>(`
      select g.id, g.name, g.timezone as "timeZone" from trainers t join gyms g on g.id = t.gym_id
      where t.id = $1 and t.user_id = $2 and t.status = 'active'
    `, [user.trainerId ?? null, user.id])).rows;
  }
  return (await query<Gym>(`
    select g.id, g.name, g.timezone as "timeZone" from users u join gyms g on g.id = u.gym_id
    where u.id = $1 and u.primary_role = 'client' and u.status = 'active'
  `, [user.id])).rows;
}

async function accessibleRows(user: AuthUser, role: ChallengeRole, gyms: Gym[], id?: string) {
  const scope = role === "member"
    ? `c.published_at is not null and exists (select 1 from users u where u.id = $1 and ${membershipScope})`
    : role === "trainer" ? "c.trainer_id = $4" : "c.trainer_id is null";
  return (await query<ChallengeRow>(`
    select ${fields} ${from}
    where c.gym_id = any($2::uuid[]) and ($3::uuid is null or c.id = $3) and ${scope}
    order by c.starts_on desc, c.created_at desc, c.id limit 60
  `, role === "trainer" ? [user.id, gyms.map((gym) => gym.id), id ?? null, user.trainerId ?? null]
    : [user.id, gyms.map((gym) => gym.id), id ?? null])).rows;
}

export async function listMonthlyChallenges(user: AuthUser, role: ChallengeRole): Promise<ChallengeList> {
  const gyms = await availableGyms(user, role);
  return { gyms, challenges: (await accessibleRows(user, role, gyms)).map(toChallenge) };
}

async function getRow(user: AuthUser, role: ChallengeRole, id: string) {
  const rows = await accessibleRows(user, role, await availableGyms(user, role), id);
  if (!rows[0]) throw challengeError(404, "This challenge is unavailable.");
  return rows[0];
}

export async function saveMonthlyChallenge(user: AuthUser, role: "trainer" | "gym", rules: ChallengeRules, gymId: string, publish: boolean, edit?: { id: string; version: number }) {
  const gym = (await availableGyms(user, role)).find((item) => item.id === gymId);
  if (!gym) throw challengeError(403, "Choose a gym you manage.");
  const prior = edit ? await getRow(user, role, edit.id) : null;
  if (prior && prior.gymId !== gymId) throw challengeError(400, "This challenge belongs to a different gym.");
  const timeZone = prior?.timeZone ?? gym.timeZone;
  const values = [rules.title, rules.template, rules.actions, rules.requiredActions, rules.startsOn, rules.endsOn, rules.goalDays, rules.leaderboard, publish];
  if (publish && rules.startsOn < ptLocalDate(new Date(), timeZone)) {
    throw challengeError(400, "Choose today or a future date to publish.");
  }
  const result = edit ? await query<{ id: string }>(`
    update monthly_challenges set title=$1, template=$2, actions=$3, required_actions=$4, starts_on=$5, ends_on=$6,
      goal_days=$7, leaderboard=$8, published_at=case when $9 then now() end, version=version+1
    where id=$10 and version=$11 and published_at is null returning id
  `, [...values, edit.id, edit.version]) : await query<{ id: string }>(`
    insert into monthly_challenges (title, template, actions, required_actions, starts_on, ends_on,
      goal_days, leaderboard, published_at, gym_id, trainer_id, time_zone)
    values ($1,$2,$3,$4,$5,$6,$7,$8,case when $9 then now() end,$10,$11,$12) returning id
  `, [...values, gym.id, role === "trainer" ? user.trainerId : null, timeZone]);
  if (!result.rows[0]) throw challengeError(409, "This challenge changed or was already published. Reopen it to see the latest version.");
  return { id: result.rows[0].id };
}

async function challengeScores(challenge: ChallengeRow, viewerId: string) {
  const { rows } = await query<ChallengeScore>(`
    with eligible as (
      select p.user_id, p.joined_on, p.display_name, p.water_target_ml
      from monthly_challenges c
      join monthly_challenge_members p on p.challenge_id = c.id
      join users u on u.id = p.user_id
      left join trainers t on t.id = c.trainer_id
      left join users coach on coach.id = t.user_id
      where c.id = $1 and ${membershipScope}
    ), bounds as (
      select e.*, greatest(e.joined_on, $2::date)::timestamp at time zone $4 as opens,
        least(now(), ($3::date+1)::timestamp at time zone $4) as closes
      from eligible e
    ), food as (
      select distinct e.user_id, (f.logged_at at time zone $4)::date as day
      from bounds e join food_logs f on f.user_id=e.user_id and f.logged_at>=e.opens and f.logged_at<e.closes
      where 'meals'=any($6::text[])
    ), actions as (
      select f.user_id, f.day, 'meals' as action from food f
      join monthly_challenge_meal_days d on d.user_id=f.user_id and d.time_zone=$4 and d.day=f.day
      union all
      select e.user_id, (w.logged_at at time zone $4)::date, 'hydration'
      from bounds e join water_logs w on w.user_id=e.user_id and w.logged_at>=e.opens and w.logged_at<e.closes
      where 'hydration'=any($6) group by 1,2,e.water_target_ml having sum(w.amount_ml)>=e.water_target_ml
      union all
      select e.user_id, (a.created_at at time zone $4)::date, 'movement'
      from bounds e join analytics_events a on a.user_id=e.user_id and a.event_name='burn_log' and a.created_at>=e.opens and a.created_at<e.closes
      where 'movement'=any($6)
      union all
      select e.user_id, (s.completed_at at time zone $4)::date, 'movement'
      from bounds e join trainer_coaching_sessions s on s.client_id=e.user_id and s.status='completed'
        and s.completed_at>=e.opens and s.completed_at<e.closes
      where 'movement'=any($6)
    ), daily as (
      select user_id, day, count(distinct action) as action_count
      from actions group by user_id, day
    )
    select e.user_id as "userId", e.display_name as "displayName", e.water_target_ml as "waterTargetMl",
      count(d.day) filter (where d.action_count >= $7)::int as score,
      case when e.user_id=$8 then array(select distinct a.action from actions a where a.user_id=e.user_id and a.day=$5) else '{}' end as "todayActions",
      e.user_id=$8 and exists(select 1 from food f where f.user_id=e.user_id and f.day=$5) as "mealLogAvailable"
    from eligible e left join daily d on d.user_id=e.user_id group by e.user_id,e.display_name,e.water_target_ml
  `, [challenge.id, challenge.startsOn, challenge.endsOn, challenge.timeZone, challenge.today, challenge.actions, challenge.requiredActions, viewerId]);
  return rows;
}

export async function getMonthlyChallenge(user: AuthUser, role: ChallengeRole, id: string): Promise<ChallengeDetail> {
  const row = await getRow(user, role, id);
  const challenge = toChallenge(row);
  const scores = row.published ? await challengeScores(row, user.id) : [];
  const own = scores.find((score) => score.userId === user.id);
  const ranked = challenge.leaderboard && (role !== "member" || own)
    ? scores.filter((score) => score.displayName && score.score > 0).sort((a, b) => b.score - a.score || a.displayName!.localeCompare(b.displayName!)) : [];
  let rank = 0;
  const leaderboard = ranked.slice(0, 20).map((score, index) => {
    if (index === 0 || score.score !== ranked[index - 1].score) rank = index + 1;
    return { rank, name: score.displayName!, score: score.score, isMe: score.userId === user.id };
  });
  return {
    challenge, today: row.today, joinedCount: scores.length, completedCount: scores.filter((score) => score.score >= row.goalDays).length, leaderboard,
    membership: own ? { score: own.score, todayActions: own.todayActions, mealLogAvailable: own.mealLogAvailable, displayName: own.displayName, waterTargetMl: own.waterTargetMl } : null
  };
}

export async function joinMonthlyChallenge(user: AuthUser, id: string, displayName: string | null) {
  const row = await getRow(user, "member", id);
  if (row.today > row.endsOn) {
    if (!row.joined || displayName) throw challengeError(409, "This challenge has finished.");
    await query("update monthly_challenge_members set display_name=null where challenge_id=$1 and user_id=$2", [id, user.id]);
    return;
  }
  if (displayName && !row.leaderboard) throw challengeError(400, "This challenge has no leaderboard.");
  const waterTarget = row.actions.includes("hydration") ? (await resolveNutritionTargets(user.id)).waterMl : null;
  await query(`
    insert into monthly_challenge_members (challenge_id, user_id, joined_on, display_name, water_target_ml)
    values ($1,$2,$3,$4,$5) on conflict(challenge_id,user_id) do update set display_name=excluded.display_name
  `, [id, user.id, row.today, displayName, waterTarget]);
}

export async function leaveMonthlyChallenge(user: AuthUser, id: string) {
  await query("delete from monthly_challenge_members where challenge_id=$1 and user_id=$2", [id, user.id]);
}

export async function completeChallengeMealDay(user: AuthUser, id: string, day: string) {
  const row = await getRow(user, "member", id);
  if (!row.joined || !row.actions.includes("meals") || toChallenge(row).status !== "live" || row.today !== day) {
    throw challengeError(409, "Meal check-in is unavailable for this date.");
  }
  const result = await query(`
    insert into monthly_challenge_meal_days (user_id,time_zone,day)
    select $1,$2,$3 where exists (
      select 1 from food_logs where user_id=$1 and logged_at>=($3::date::timestamp at time zone $2)
        and logged_at<least(now(),($3::date+1)::timestamp at time zone $2)
    ) on conflict (user_id,time_zone,day) do update set day=excluded.day
    returning day
  `, [user.id, row.timeZone, day]);
  if (!result.rowCount) throw challengeError(400, "Log a meal before marking today complete.");
}
