import type { Role, SubscriptionPlan, WorkoutDebriefAccess, WorkoutDebriefTier } from "@ascend/shared";
import type { QueryResultRow } from "pg";
import { pool, query } from "../db/pool";

const limits: Record<WorkoutDebriefTier, { daily: number | null; weekly: number }> = {
  free: { daily: null, weekly: 1 },
  premium: { daily: 2, weekly: 10 },
  athlete: { daily: 3, weekly: 20 }
};

type AccessIdentity = {
  userId: string;
  primaryRole: Role;
  roles: Role[];
  isPlatformOwner: boolean;
};

type AccessRow = QueryResultRow & {
  active_plan: SubscriptionPlan | null;
  athlete_enabled: boolean;
  daily_used: string;
  weekly_used: string;
  oldest_weekly_generation: string | null;
};

type QueryExecutor = {
  query<T extends QueryResultRow>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
};

export function workoutDebriefTierFor(input: {
  activePlan: SubscriptionPlan;
  athleteEnabled: boolean;
  primaryRole: Role;
  roles: Role[];
  isPlatformOwner: boolean;
}): WorkoutDebriefTier {
  if (input.isPlatformOwner || input.athleteEnabled) return "athlete";
  if (
    input.activePlan === "premium" ||
    input.activePlan === "trainer_pro" ||
    input.primaryRole === "owner" ||
    input.primaryRole === "admin" ||
    input.primaryRole === "trainer" ||
    input.roles.some((role) => role === "owner" || role === "admin" || role === "trainer")
  ) return "premium";
  return "free";
}

export function workoutDebriefAccessFor(input: {
  tier: WorkoutDebriefTier;
  dailyUsed: number;
  weeklyUsed: number;
  oldestWeeklyGeneration: string | null;
}): WorkoutDebriefAccess {
  const tierLimits = limits[input.tier];
  const dailyUsed = Math.max(0, input.dailyUsed);
  const weeklyUsed = Math.max(0, input.weeklyUsed);
  const dailyRemaining = tierLimits.daily === null ? null : Math.max(tierLimits.daily - dailyUsed, 0);
  const weeklyRemaining = Math.max(tierLimits.weekly - weeklyUsed, 0);
  const canGenerate = weeklyRemaining > 0 && (dailyRemaining === null || dailyRemaining > 0);
  const oldest = input.oldestWeeklyGeneration ? new Date(input.oldestWeeklyGeneration) : null;
  const nextWeeklyReviewAt = !canGenerate && weeklyRemaining === 0 && oldest && Number.isFinite(oldest.getTime())
    ? new Date(oldest.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return {
    tier: input.tier,
    mode: input.tier === "free" ? "select_one" : "automatic",
    canGenerate,
    dailyLimit: tierLimits.daily,
    weeklyLimit: tierLimits.weekly,
    dailyUsed,
    weeklyUsed,
    dailyRemaining,
    weeklyRemaining,
    nextWeeklyReviewAt
  };
}

async function loadAccessRow(client: QueryExecutor, identity: AccessIdentity): Promise<AccessRow> {
  const result = await client.query<AccessRow>(
    `
    select
      (
        select s.plan
        from subscriptions s
        where s.user_id = $1
          and (s.status in ('active', 'trialing') or (s.status = 'canceled' and s.current_period_end > now()))
        order by case s.plan when 'trainer_pro' then 2 when 'premium' then 1 else 0 end desc, s.created_at desc
        limit 1
      ) as active_plan,
      exists (
        select 1 from athlete_profiles ap where ap.user_id = $1 and ap.enabled = true
      ) as athlete_enabled,
      count(*) filter (where wd.generation_started_at >= now() - interval '24 hours')::text as daily_used,
      count(*) filter (where wd.generation_started_at >= now() - interval '7 days')::text as weekly_used,
      min(wd.generation_started_at) filter (where wd.generation_started_at >= now() - interval '7 days') as oldest_weekly_generation
    from workout_debriefs wd
    where wd.user_id = $1
      and wd.generation_started_at is not null
    `,
    [identity.userId]
  );
  return result.rows[0] ?? {
    active_plan: null,
    athlete_enabled: false,
    daily_used: "0",
    weekly_used: "0",
    oldest_weekly_generation: null
  };
}

function accessFromRow(row: AccessRow, identity: AccessIdentity) {
  const tier = workoutDebriefTierFor({
    activePlan: row.active_plan ?? "free",
    athleteEnabled: row.athlete_enabled === true,
    primaryRole: identity.primaryRole,
    roles: identity.roles,
    isPlatformOwner: identity.isPlatformOwner
  });
  return workoutDebriefAccessFor({
    tier,
    dailyUsed: Number(row.daily_used ?? 0),
    weeklyUsed: Number(row.weekly_used ?? 0),
    oldestWeeklyGeneration: row.oldest_weekly_generation
  });
}

export async function getWorkoutDebriefAccess(identity: AccessIdentity) {
  return accessFromRow(await loadAccessRow({ query }, identity), identity);
}

export type WorkoutDebriefReservation = {
  outcome: "reserved" | "existing" | "limit_reached" | "not_found";
  access: WorkoutDebriefAccess;
};

export async function reserveWorkoutDebriefGeneration(
  identity: AccessIdentity,
  workoutEventId: string
): Promise<WorkoutDebriefReservation> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [identity.userId]);
    const target = await client.query<{ status: string; generation_started_at: string | null }>(
      `select status, generation_started_at from workout_debriefs where workout_event_id = $1 and user_id = $2 for update`,
      [workoutEventId, identity.userId]
    );
    const record = target.rows[0];
    const currentAccess = accessFromRow(await loadAccessRow(client, identity), identity);
    if (!record) {
      await client.query("commit");
      return { outcome: "not_found", access: currentAccess };
    }
    if (record.status !== "available") {
      await client.query("commit");
      return { outcome: "existing", access: currentAccess };
    }
    if (!currentAccess.canGenerate) {
      await client.query("commit");
      return { outcome: "limit_reached", access: currentAccess };
    }
    await client.query(
      `
      update workout_debriefs
      set status = 'pending', generation_started_at = now(), updated_at = now()
      where workout_event_id = $1 and user_id = $2 and status = 'available'
      `,
      [workoutEventId, identity.userId]
    );
    const refreshedAccess = accessFromRow(await loadAccessRow(client, identity), identity);
    await client.query("commit");
    return { outcome: "reserved", access: refreshedAccess };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function workoutDebriefIdentity(input: AccessIdentity) {
  return {
    userId: input.userId,
    primaryRole: input.primaryRole,
    roles: input.roles,
    isPlatformOwner: input.isPlatformOwner
  };
}
