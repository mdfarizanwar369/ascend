import { z } from "zod";
import { query } from "../db/pool";

export const onboardingSchema = z.object({
  fullName: z.string().min(2),
  referralCode: z.string().optional(),
  goalType: z.enum(["fat_loss", "muscle_gain", "maintenance"]),
  gender: z.enum(["female", "male", "prefer_not_to_say"]).optional(),
  ageYears: z.number().int().min(13).max(100).optional(),
  activityLevel: z.enum(["low", "moderate", "high"]).optional(),
  heightCm: z.number().positive().optional(),
  startingWeightKg: z.number().positive(),
  targetWeightKg: z.number().positive().optional()
});

export const guideProfileSchema = z.object({
  gender: z.enum(["female", "male", "prefer_not_to_say"]),
  ageYears: z.number().int().min(13).max(100),
  activityLevel: z.enum(["low", "moderate", "high"]),
  heightCm: z.number().positive()
});

export async function ensureUserProfileSchema() {
  await query(`
    alter table users add column if not exists age_years integer;
    alter table users add column if not exists activity_level text;
  `);
}

export async function completeOnboarding(userId: string, input: z.infer<typeof onboardingSchema>) {
  const referral = input.referralCode
    ? await query<{ gym_id: string | null; trainer_id: string | null; id: string }>(
        "select id, gym_id, trainer_id from referral_codes where code = $1 and active = true",
        [input.referralCode.toUpperCase()]
      )
    : undefined;

  const referralRow = referral?.rows[0];

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
        gym_id = coalesce($10, gym_id),
        assigned_trainer_id = coalesce($11, assigned_trainer_id),
        referred_by_gym_id = coalesce($10, referred_by_gym_id),
        referred_by_trainer_id = coalesce($11, referred_by_trainer_id),
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
      referralRow?.trainer_id ?? null
    ]
  );

  return result.rows[0];
}

export async function updateGuideProfile(userId: string, input: z.infer<typeof guideProfileSchema>) {
  const result = await query(
    `
    update users
    set gender = $2,
        age_years = $3,
        activity_level = $4,
        height_cm = $5,
        updated_at = now()
    where id = $1
    returning *
    `,
    [userId, input.gender, input.ageYears, input.activityLevel, input.heightCm]
  );

  return result.rows[0];
}
