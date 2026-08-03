import type { Role, SubscriptionPlan, WorkoutCaptureAllowance } from "@ascend/shared";
import { query } from "../db/pool";

export const FREE_DETAILED_WORKOUT_LIMIT = 3;

type WorkoutCaptureAccessContext = {
  featureEnabled: boolean;
  primaryRole: Role;
  roles: Role[];
  activePlan: SubscriptionPlan;
  isPlatformOwner: boolean;
  used: number;
  alreadySaved?: boolean;
};

export type WorkoutCaptureAccess = {
  enabled: boolean;
  canCapture: boolean;
  allowance: WorkoutCaptureAllowance | null;
};

export function workoutCaptureAccessFor(context: WorkoutCaptureAccessContext): WorkoutCaptureAccess {
  if (!context.featureEnabled) return { enabled: false, canCapture: false, allowance: null };

  const unlimited =
    context.isPlatformOwner ||
    context.primaryRole === "owner" ||
    context.primaryRole === "admin" ||
    context.roles.includes("owner") ||
    context.roles.includes("admin") ||
    context.activePlan === "premium" ||
    context.activePlan === "trainer_pro";

  if (unlimited) {
    return {
      enabled: true,
      canCapture: true,
      allowance: { tier: "premium", period: "unlimited", limit: null, used: context.used, remaining: null }
    };
  }

  const used = Math.max(0, context.used);
  const remaining = Math.max(FREE_DETAILED_WORKOUT_LIMIT - used, 0);
  return {
    enabled: true,
    canCapture: context.alreadySaved === true || remaining > 0,
    allowance: {
      tier: "free",
      period: "rolling_7_days",
      limit: FREE_DETAILED_WORKOUT_LIMIT,
      used,
      remaining
    }
  };
}

export async function getWorkoutCaptureAccess(input: {
  featureEnabled: boolean;
  userId: string;
  primaryRole: Role;
  roles: Role[];
  isPlatformOwner: boolean;
  workoutCompletionKey?: string | null;
}): Promise<WorkoutCaptureAccess> {
  if (!input.featureEnabled) return workoutCaptureAccessFor({
    featureEnabled: false,
    primaryRole: input.primaryRole,
    roles: input.roles,
    activePlan: "free",
    isPlatformOwner: input.isPlatformOwner,
    used: 0
  });

  const result = await query<{ active_plan: SubscriptionPlan | null; used: string; already_saved: boolean }>(
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
      (
        select count(*)
        from analytics_events e
        where e.user_id = $1
          and e.event_name = 'burn_log'
          and e.metadata->>'source' = 'ai_workout_capture'
          and e.created_at >= now() - interval '7 days'
      ) as used,
      case
        when $2::text is null then false
        else exists (
          select 1
          from analytics_events e
          where e.user_id = $1
            and e.event_name = 'burn_log'
            and e.metadata->>'workoutCompletionKey' = $2
        )
      end as already_saved
    `,
    [input.userId, input.workoutCompletionKey ?? null]
  );
  const row = result.rows[0];

  return workoutCaptureAccessFor({
    featureEnabled: true,
    primaryRole: input.primaryRole,
    roles: input.roles,
    activePlan: row?.active_plan ?? "free",
    isPlatformOwner: input.isPlatformOwner,
    used: Number(row?.used ?? 0),
    alreadySaved: row?.already_saved === true
  });
}
