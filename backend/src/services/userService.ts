import { z } from "zod";
import { query } from "../db/pool";

export const onboardingSchema = z.object({
  fullName: z.string().min(2),
  referralCode: z.string().optional(),
  goalType: z.enum(["fat_loss", "muscle_gain", "maintenance"]),
  heightCm: z.number().positive().optional(),
  startingWeightKg: z.number().positive(),
  targetWeightKg: z.number().positive().optional()
});

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
        gym_id = coalesce($7, gym_id),
        assigned_trainer_id = coalesce($8, assigned_trainer_id),
        referred_by_gym_id = coalesce($7, referred_by_gym_id),
        referred_by_trainer_id = coalesce($8, referred_by_trainer_id),
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
      referralRow?.gym_id ?? null,
      referralRow?.trainer_id ?? null
    ]
  );

  return result.rows[0];
}

