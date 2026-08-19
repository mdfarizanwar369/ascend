import { z } from "zod";
import { MOTIVATION_ANCHOR_VALUES, PRIMARY_BARRIER_VALUES } from "@ascend/shared";
import { query } from "../db/pool";

export const onboardingSchema = z.object({
  fullName: z.string().min(2),
  referralCode: z.string().optional(),
  coachingMode: z.enum(["self_coached", "ai_coach", "human_coach"]).default("self_coached"),
  goalType: z.enum(["fat_loss", "muscle_gain", "maintenance"]),
  gender: z.enum(["female", "male", "prefer_not_to_say"]).optional(),
  ageYears: z.number().int().min(13).max(100).optional(),
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  heightCm: z.number().positive().optional(),
  startingWeightKg: z.number().positive(),
  targetWeightKg: z.number().positive().optional(),
  // Optional at the API boundary so older installed clients remain compatible.
  primaryBarrier: z.enum(PRIMARY_BARRIER_VALUES).optional(),
  motivationAnchor: z.enum(MOTIVATION_ANCHOR_VALUES).nullable().optional()
});

export const guideProfileSchema = z.object({
  gender: z.enum(["female", "male", "prefer_not_to_say"]),
  ageYears: z.number().int().min(13).max(100),
  activityLevel: z.enum(["low", "moderate", "high"]),
  heightCm: z.number().positive(),
  goalType: z.enum(["fat_loss", "muscle_gain", "maintenance"]),
  targetWeightKg: z.number().positive().nullable().optional()
}).superRefine((input, ctx) => {
  if (input.goalType !== "maintenance" && !input.targetWeightKg) {
    ctx.addIssue({ code: "custom", path: ["targetWeightKg"], message: "A target weight is required for this goal" });
  }
});

export async function ensureUserProfileSchema() {
  await query(`
    alter table users add column if not exists age_years integer;
    alter table users add column if not exists activity_level text;
    alter table users add column if not exists coaching_mode text not null default 'self_coached';
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint
        where conname = 'users_coaching_mode_check'
      ) then
        alter table users add constraint users_coaching_mode_check
          check (coaching_mode in ('self_coached', 'ai_coach', 'human_coach'));
      end if;
    end $$;
    update users
    set coaching_mode = 'human_coach'
    where assigned_trainer_id is not null
      and coaching_mode <> 'human_coach';
  `);
}

export async function completeOnboarding(userId: string, input: z.infer<typeof onboardingSchema>) {
  const referral = input.referralCode
    ? await query<{ gym_id: string | null; trainer_id: string | null; id: string }>(
        `
        select rc.id, coalesce(rc.gym_id, t.gym_id) as gym_id, rc.trainer_id
        from referral_codes rc
        left join trainers t on t.id = rc.trainer_id
        where rc.code = $1 and rc.active = true
        `,
        [input.referralCode.toUpperCase()]
      )
    : undefined;

  const referralRow = referral?.rows[0];
  if (input.referralCode && !referralRow) {
    throw new z.ZodError([{ code: "custom", path: ["referralCode"], message: "Referral code not found" }]);
  }

  const result = await query(
    `
    update users
    set full_name = $2,
        goal_type = $3,
        height_cm = $4,
        starting_weight_kg = $5,
        target_weight_kg = $6,
        gender = $7,
        age_years = $8,
        activity_level = $9,
        goal_updated_at = now(),
        gym_id = coalesce($10, gym_id),
        assigned_trainer_id = coalesce($11, assigned_trainer_id),
        referred_by_gym_id = coalesce($10, referred_by_gym_id),
        referred_by_trainer_id = coalesce($11, referred_by_trainer_id),
        coaching_mode = case
          when coalesce($11, assigned_trainer_id) is not null then 'human_coach'
          else $12
        end,
        primary_barrier = coalesce($13, primary_barrier),
        motivation_anchor = case when $14 then $15 else motivation_anchor end,
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      userId,
      input.fullName,
      input.goalType,
      input.heightCm ?? null,
      input.startingWeightKg,
      input.targetWeightKg ?? null,
      input.gender ?? null,
      input.ageYears ?? null,
      input.activityLevel ?? null,
      referralRow?.gym_id ?? null,
      referralRow?.trainer_id ?? null,
      input.coachingMode,
      input.primaryBarrier ?? null,
      Object.prototype.hasOwnProperty.call(input, "motivationAnchor"),
      input.motivationAnchor ?? null
    ]
  );

  return result.rows[0];
}

export async function updateGuideProfile(userId: string, input: z.infer<typeof guideProfileSchema>) {
  const result = await query(
    `
    with current_profile as (
      select goal_type, target_weight_kg, goal_version, starting_weight_kg
      from users
      where id = $1
    ),
    updated as (
      update users u
      set gender = $2,
          age_years = $3,
          activity_level = $4,
          height_cm = $5,
          goal_type = $6,
          target_weight_kg = $7,
          starting_weight_kg = case
            when u.goal_type is distinct from $6::goal_type or u.target_weight_kg is distinct from $7::numeric
              then coalesce((select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1), u.starting_weight_kg)
            else u.starting_weight_kg
          end,
          goal_version = case
            when u.goal_type is distinct from $6::goal_type or u.target_weight_kg is distinct from $7::numeric
              then u.goal_version + 1
            else u.goal_version
          end,
          goal_updated_at = case
            when u.goal_type is distinct from $6::goal_type or u.target_weight_kg is distinct from $7::numeric
              then now()
            else u.goal_updated_at
          end,
          updated_at = now()
      where u.id = $1
        and (
          (u.goal_type is not distinct from $6::goal_type and u.target_weight_kg is not distinct from $7::numeric)
          or $6::goal_type = 'maintenance'
          or ($6::goal_type = 'fat_loss' and $7::numeric < coalesce((select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1), u.starting_weight_kg))
          or ($6::goal_type = 'muscle_gain' and $7::numeric > coalesce((select weight_kg from weight_logs where user_id = $1 order by logged_at desc limit 1), u.starting_weight_kg))
        )
      returning u.*
    ),
    history as (
      insert into goal_changes (
        user_id, goal_version, previous_goal_type, goal_type, previous_target_weight_kg,
        target_weight_kg, journey_start_weight_kg
      )
      select u.id, u.goal_version, p.goal_type, u.goal_type, p.target_weight_kg,
        u.target_weight_kg, u.starting_weight_kg
      from updated u
      cross join current_profile p
      where u.goal_version <> p.goal_version
      on conflict (user_id, goal_version) do nothing
    )
    select * from updated
    `,
    [userId, input.gender, input.ageYears, input.activityLevel, input.heightCm, input.goalType, input.targetWeightKg ?? null]
  );

  if (!result.rows[0]) {
    throw new z.ZodError([{ code: "custom", path: ["targetWeightKg"], message: "Choose a target weight in the direction of your goal" }]);
  }

  return result.rows[0];
}

export async function getGoalStatus(userId: string) {
  const result = await query(
    `
    select u.goal_type, u.goal_version, u.goal_updated_at, u.starting_weight_kg, u.target_weight_kg,
      latest.weight_kg as current_weight_kg,
      milestone.id as milestone_id, milestone.goal_type as milestone_goal_type,
      milestone.target_weight_kg as milestone_target_weight_kg,
      milestone.achieved_weight_kg, milestone.achieved_at, milestone.acknowledged_at
    from users u
    left join lateral (
      select weight_kg from weight_logs where user_id = u.id order by logged_at desc limit 1
    ) latest on true
    left join lateral (
      select * from goal_milestones
      where user_id = u.id and goal_version = u.goal_version and milestone_type = 'target_reached'
      order by achieved_at desc limit 1
    ) milestone on true
    where u.id = $1
    `,
    [userId]
  );
  return result.rows[0];
}

export async function acknowledgeGoalMilestone(userId: string, milestoneId: string) {
  const result = await query(
    `update goal_milestones set acknowledged_at = coalesce(acknowledged_at, now())
     where id = $1 and user_id = $2 returning *`,
    [milestoneId, userId]
  );
  return result.rows[0];
}
