import { Router } from "express";
import { z } from "zod";
import { query } from "../db/pool";
import { requireFirebaseToken } from "../middleware/auth";

export const authRouter = Router();

const provisionSchema = z.object({
  fullName: z.string().min(2).optional(),
  referralCode: z.string().optional(),
  primaryRole: z.enum(["client", "trainer"]).default("client")
});

authRouter.post("/auth/provision", requireFirebaseToken, async (req, res, next) => {
  try {
    const input = provisionSchema.parse(req.body);
    const firebaseUser = req.firebaseUser!;
    const referral = input.referralCode
      ? await query<{ id: string; gym_id: string | null; trainer_id: string | null }>(
          "select id, gym_id, trainer_id from referral_codes where code = $1 and active = true",
          [input.referralCode.toUpperCase()]
        )
      : undefined;
    const referralRow = referral?.rows[0];

    const result = await query(
      `
      insert into users (
        firebase_uid, email, full_name, primary_role, gym_id, assigned_trainer_id,
        referred_by_gym_id, referred_by_trainer_id
      )
      values ($1, $2, $3, $4, $5, $6, $5, $6)
      on conflict (firebase_uid) do update
      set email = excluded.email,
          full_name = coalesce(nullif(excluded.full_name, ''), users.full_name),
          gym_id = coalesce(excluded.gym_id, users.gym_id),
          assigned_trainer_id = coalesce(excluded.assigned_trainer_id, users.assigned_trainer_id),
          referred_by_gym_id = coalesce(excluded.referred_by_gym_id, users.referred_by_gym_id),
          referred_by_trainer_id = coalesce(excluded.referred_by_trainer_id, users.referred_by_trainer_id),
          updated_at = now()
      returning *
      `,
      [
        firebaseUser.firebaseUid,
        firebaseUser.email ?? "",
        input.fullName ?? firebaseUser.name ?? firebaseUser.email ?? "Ascend Member",
        input.primaryRole,
        referralRow?.gym_id ?? null,
        referralRow?.trainer_id ?? null
      ]
    );

    await query("insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing", [
      result.rows[0].id,
      input.primaryRole
    ]);

    res.status(201).json({ user: result.rows[0], referralApplied: Boolean(referralRow) });
  } catch (error) {
    next(error);
  }
});

