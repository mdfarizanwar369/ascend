import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
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
    const allowedOwnerEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const currentEmail = firebaseUser.email?.trim().toLowerCase();
    const isBootstrapOwner = Boolean(allowedOwnerEmail && currentEmail && allowedOwnerEmail === currentEmail);
    const primaryRole = isBootstrapOwner ? "owner" : input.primaryRole;
    const existingUser = await query<{ id: string }>("select id from users where firebase_uid = $1 limit 1", [firebaseUser.firebaseUid]);
    const isExistingUser = Boolean(existingUser.rows[0]);
    const referral = input.referralCode
      ? await query<{ id: string; gym_id: string | null; trainer_id: string | null }>(
          `
          select rc.id, coalesce(rc.gym_id, referred_trainer.gym_id) as gym_id, rc.trainer_id
          from referral_codes rc
          left join trainers referred_trainer on referred_trainer.id = rc.trainer_id
          where rc.code = $1 and rc.active = true
          `,
          [input.referralCode.toUpperCase()]
        )
      : undefined;
    const referralRow = referral?.rows[0];
    const fallbackGym =
      primaryRole === "trainer" && !referralRow?.gym_id
        ? await query<{ id: string }>("select id from gyms order by created_at asc limit 1")
        : undefined;
    const gymId = referralRow?.gym_id ?? fallbackGym?.rows[0]?.id ?? null;
    const assignedTrainerId = primaryRole === "client" ? referralRow?.trainer_id ?? null : null;

    const result = await query(
      `
      insert into users (
        firebase_uid, email, full_name, primary_role, gym_id, assigned_trainer_id,
        referred_by_gym_id, referred_by_trainer_id
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (firebase_uid) do update
      set email = excluded.email,
          full_name = coalesce(nullif(excluded.full_name, ''), users.full_name),
          primary_role = case when $9 = true then 'owner'::user_role else users.primary_role end,
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
        primaryRole,
        gymId,
        assignedTrainerId,
        referralRow?.gym_id ?? null,
        referralRow?.trainer_id ?? null,
        isBootstrapOwner
      ]
    );

    if (isBootstrapOwner) {
      await query("delete from user_roles where user_id = $1", [result.rows[0].id]);
      await query("insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin')", [result.rows[0].id]);
    } else if (!isExistingUser) {
      await query("insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing", [result.rows[0].id, input.primaryRole]);
    }

    if (!isBootstrapOwner && primaryRole === "trainer" && gymId) {
      await query(
        `
        insert into trainers (user_id, gym_id, specialties, status)
        values ($1, $2, '{}', 'pending')
        on conflict (user_id) do update
        set gym_id = excluded.gym_id
        `,
        [result.rows[0].id, gymId]
      );
    }

    res.status(201).json({ user: result.rows[0], referralApplied: Boolean(referralRow) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/bootstrap-owner", requireFirebaseToken, async (req, res, next) => {
  try {
    const firebaseUser = req.firebaseUser!;
    const allowedEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const currentEmail = firebaseUser.email?.trim().toLowerCase();

    if (!allowedEmail) {
      return res.status(400).json({ error: "BOOTSTRAP_OWNER_EMAIL is not configured" });
    }

    if (!currentEmail || currentEmail !== allowedEmail) {
      return res.status(403).json({ error: "This email is not allowed to bootstrap owner access" });
    }

    const gym = await query<{ id: string }>("select id from gyms order by created_at asc limit 1");
    const gymId = gym.rows[0]?.id ?? null;

    const result = await query(
      `
      insert into users (firebase_uid, email, full_name, primary_role, gym_id)
      values ($1, $2, $3, 'owner', $4)
      on conflict (firebase_uid) do update
      set email = excluded.email,
          full_name = coalesce(nullif(users.full_name, ''), excluded.full_name),
          primary_role = 'owner',
          gym_id = coalesce(users.gym_id, excluded.gym_id),
          updated_at = now()
      returning *
      `,
      [firebaseUser.firebaseUid, firebaseUser.email ?? "", firebaseUser.name ?? firebaseUser.email ?? "Ascend Owner", gymId]
    );

    await query("delete from user_roles where user_id = $1", [result.rows[0].id]);
    await query("insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin')", [result.rows[0].id]);

    if (gymId) {
      await query("update gyms set owner_user_id = $1 where id = $2 and owner_user_id is null", [result.rows[0].id, gymId]);
    }

    res.json({ user: result.rows[0], roles: ["owner", "admin"] });
  } catch (error) {
    next(error);
  }
});
