import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { query } from "../db/pool";
import { requireFirebaseToken } from "../middleware/auth";
import { authRateLimit } from "../middleware/rateLimits";
import { isValidTimeZone, normalizeTimeZone } from "../utils/userTime";

export const authRouter = Router();

const provisionSchema = z.object({
  fullName: z.string().min(2).optional(),
  referralCode: z.string().optional(),
  primaryRole: z.enum(["client", "trainer"]).default("client"),
  timezone: z.string().trim().min(1).max(80).refine(isValidTimeZone, "Invalid IANA timezone").optional()
});

type ProvisionUserRow = {
  id: string;
  firebase_uid: string;
  email: string;
};

export async function upsertProvisionedUser(options: {
  assignedTrainerId: string | null;
  currentEmail: string;
  firebaseUid: string;
  fullName: string;
  gymId: string | null;
  isBootstrapOwner: boolean;
  primaryRole: "client" | "trainer" | "owner";
  referredByGymId: string | null;
  referredByTrainerId: string | null;
  timezone?: string | null;
}) {
  const existingByFirebaseUid = await query<ProvisionUserRow>(
    "select id, firebase_uid, email from users where firebase_uid = $1 limit 1",
    [options.firebaseUid]
  );

  const existingByEmail =
    options.currentEmail
      ? await query<ProvisionUserRow>(
          "select id, firebase_uid, email from users where lower(email) = lower($1) limit 1",
          [options.currentEmail]
        )
      : { rows: [] as ProvisionUserRow[] };

  const matchedExistingUser = existingByFirebaseUid.rows[0] ?? existingByEmail.rows[0] ?? null;

  if (matchedExistingUser) {
    const updatedUser = await query(
      `
      update users
      set firebase_uid = $2,
          email = $3,
          full_name = coalesce(nullif($4, ''), full_name),
          primary_role = case when $5 = true then 'owner'::user_role else primary_role end,
          gym_id = coalesce($6, gym_id),
          assigned_trainer_id = coalesce($7, assigned_trainer_id),
          referred_by_gym_id = coalesce($8, referred_by_gym_id),
          referred_by_trainer_id = coalesce($9, referred_by_trainer_id),
          coaching_mode = case
            when coalesce($7, assigned_trainer_id) is not null then 'human_coach'
            else coaching_mode
          end,
          timezone = coalesce($10, timezone),
          updated_at = now()
      where id = $1
      returning *
      `,
      [
        matchedExistingUser.id,
        options.firebaseUid,
        options.currentEmail,
        options.fullName,
        options.isBootstrapOwner,
        options.gymId,
        options.assignedTrainerId,
        options.referredByGymId,
        options.referredByTrainerId,
        options.timezone ? normalizeTimeZone(options.timezone) : null
      ]
    );

    return { isExistingUser: true, user: updatedUser.rows[0] };
  }

  const insertedUser = await query(
    `
    insert into users (
      firebase_uid, email, full_name, primary_role, gym_id, assigned_trainer_id,
      referred_by_gym_id, referred_by_trainer_id, coaching_mode, timezone
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, case when $6::uuid is not null then 'human_coach' else 'self_coached' end, $9)
    returning *
    `,
    [
      options.firebaseUid,
      options.currentEmail,
      options.fullName,
      options.primaryRole,
      options.gymId,
      options.assignedTrainerId,
      options.referredByGymId,
      options.referredByTrainerId,
      options.timezone ? normalizeTimeZone(options.timezone) : null
    ]
  );

  return { isExistingUser: false, user: insertedUser.rows[0] };
}

authRouter.post("/auth/provision", authRateLimit, requireFirebaseToken, async (req, res, next) => {
  try {
    const input = provisionSchema.parse(req.body);
    const firebaseUser = req.firebaseUser!;
    const allowedOwnerEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const currentEmail = firebaseUser.email?.trim().toLowerCase();
    const isBootstrapOwner = Boolean(allowedOwnerEmail && currentEmail && allowedOwnerEmail === currentEmail);
    const primaryRole = isBootstrapOwner ? "owner" : input.primaryRole;
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
    if (primaryRole === "trainer" && !referralRow?.gym_id) {
      return res.status(400).json({ error: "Trainer signup requires a valid gym or trainer referral code" });
    }
    const gymId = referralRow?.gym_id ?? null;
    const assignedTrainerId = primaryRole === "client" ? referralRow?.trainer_id ?? null : null;

    const { isExistingUser, user } = await upsertProvisionedUser({
      assignedTrainerId,
      currentEmail: firebaseUser.email ?? "",
      firebaseUid: firebaseUser.firebaseUid,
      fullName: input.fullName ?? firebaseUser.name ?? firebaseUser.email ?? "Ascend Member",
      gymId,
      isBootstrapOwner,
      primaryRole,
      referredByGymId: referralRow?.gym_id ?? null,
      referredByTrainerId: referralRow?.trainer_id ?? null,
      timezone: input.timezone ?? null
    });

    if (isBootstrapOwner) {
      await query("delete from user_roles where user_id = $1", [user.id]);
      await query("insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin')", [user.id]);
    } else if (!isExistingUser) {
      await query("insert into user_roles (user_id, role) values ($1, $2) on conflict do nothing", [user.id, input.primaryRole]);
    }

    if (!isBootstrapOwner && primaryRole === "trainer" && gymId) {
      await query(
        `
        insert into trainers (user_id, gym_id, specialties, status)
        values ($1, $2, '{}', 'pending')
        on conflict (user_id) do update
        set gym_id = excluded.gym_id
        `,
        [user.id, gymId]
      );
    }

    res.status(201).json({ user, referralApplied: Boolean(referralRow) });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/bootstrap-owner", authRateLimit, requireFirebaseToken, async (req, res, next) => {
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
