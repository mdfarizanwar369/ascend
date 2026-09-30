import { randomBytes } from "node:crypto";
import { query } from "../db/pool";

export type TrainerOnboardingMode = "independent" | "gym";

type OnboardingIntentInput = {
  mode: TrainerOnboardingMode;
  workspaceName?: string;
  country?: string;
  timezone?: string;
  invitationCode?: string;
};

type TrainerInvitation = {
  id: string;
  gym_id: string;
  gym_name: string;
  intended_email: string | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

function cleanWorkspaceName(value: string | undefined, fallback: string) {
  const cleaned = value?.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || `${fallback.trim().slice(0, 60) || "Independent"} Coaching`;
}

function slugPart(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "coach";
}

function referralPart(value: string) {
  return value.toUpperCase().normalize("NFKD").replace(/[^A-Z0-9]+/g, "").slice(0, 12) || "COACH";
}

export async function findTrainerInvitation(code: string, email?: string, lock = false) {
  const result = await query<TrainerInvitation>(`
    select ti.id, ti.gym_id, g.name as gym_name, ti.intended_email, ti.expires_at, ti.consumed_at, ti.revoked_at
    from trainer_invitations ti
    join gyms g on g.id = ti.gym_id
    where ti.code = $1
      and ti.revoked_at is null
      and ti.consumed_at is null
      and ti.expires_at > now()
      and (ti.intended_email is null or lower(ti.intended_email) = lower($2))
    ${lock ? "for update of ti" : ""}
  `, [code.trim().toUpperCase(), email ?? ""]);
  return result.rows[0] ?? null;
}

export async function saveTrainerOnboardingIntent(userId: string, email: string, input: OnboardingIntentInput) {
  let invitation: TrainerInvitation | null = null;
  if (input.mode === "gym") {
    if (!input.invitationCode?.trim()) throw Object.assign(new Error("Enter the trainer invitation supplied by your gym."), { status: 400 });
    invitation = await findTrainerInvitation(input.invitationCode, email);
    if (!invitation) throw Object.assign(new Error("That trainer invitation is invalid, expired, already used, or belongs to another email."), { status: 400 });
  }

  const userResult = await query<{ full_name: string }>("select full_name from users where id=$1", [userId]);
  const fullName = userResult.rows[0]?.full_name ?? "Independent";
  const result = await query(`
    insert into trainer_onboarding_intents
      (user_id, mode, workspace_name, country, timezone, trainer_invitation_id, status, activated_at, updated_at)
    values ($1,$2,$3,$4,$5,$6,'pending',null,now())
    on conflict (user_id) do update set
      mode=excluded.mode,
      workspace_name=excluded.workspace_name,
      country=excluded.country,
      timezone=excluded.timezone,
      trainer_invitation_id=excluded.trainer_invitation_id,
      status='pending',
      activated_at=null,
      updated_at=now()
    returning user_id, mode, workspace_name, country, timezone, status, updated_at
  `, [
    userId,
    input.mode,
    input.mode === "independent" ? cleanWorkspaceName(input.workspaceName, fullName) : invitation?.gym_name ?? null,
    input.country?.trim().slice(0, 80) || "Malaysia",
    input.timezone?.trim().slice(0, 80) || "Asia/Kuala_Lumpur",
    invitation?.id ?? null
  ]);
  return { ...result.rows[0], gymName: invitation?.gym_name ?? null };
}

export async function getTrainerOnboardingStatus(userId: string) {
  const result = await query(`
    select toi.mode, toi.workspace_name, toi.country, toi.timezone, toi.status, toi.activated_at,
      g.name as gym_name, t.id as trainer_id, t.status as trainer_status,
      rc.code as referral_code
    from users u
    left join trainer_onboarding_intents toi on toi.user_id = u.id
    left join trainers t on t.user_id = u.id
    left join gyms g on g.id = t.gym_id
    left join lateral (
      select code from referral_codes where trainer_id=t.id and active=true order by created_at asc limit 1
    ) rc on true
    where u.id=$1
  `, [userId]);
  return result.rows[0] ?? null;
}

export async function createTrainerReferralCode(userId: string, requestedCode?: string) {
  const trainerResult = await query<{ trainer_id: string; full_name: string }>(`
    select t.id as trainer_id, u.full_name
    from trainers t join users u on u.id=t.user_id
    where t.user_id=$1 and t.status='active'
  `, [userId]);
  const trainer = trainerResult.rows[0];
  if (!trainer) throw Object.assign(new Error("An active trainer workspace is required."), { status: 403 });

  const existing = await query<{ code: string }>(
    "select code from referral_codes where trainer_id=$1 and active=true order by created_at asc limit 1",
    [trainer.trainer_id]
  );
  if (existing.rows[0] && !requestedCode) return existing.rows[0];

  const normalizedRequested = requestedCode?.trim().toUpperCase();
  if (normalizedRequested && !/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(normalizedRequested)) {
    throw Object.assign(new Error("Use 4 to 20 letters, numbers, or hyphens for the referral code."), { status: 400 });
  }
  const reserved = new Set(["ADMIN", "ASCEND", "SUPPORT", "PREMIUM", "TRAINERPRO", "APPLE"]);
  if (normalizedRequested && reserved.has(normalizedRequested.replace(/-/g, ""))) {
    throw Object.assign(new Error("Choose a different referral code."), { status: 400 });
  }
  const code = normalizedRequested ?? `${referralPart(trainer.full_name)}-${randomBytes(3).toString("hex").toUpperCase()}`;

  if (existing.rows[0]) {
    const updated = await query<{ code: string }>(`
      update referral_codes set code=$2
      where trainer_id=$1 and active=true
      returning code
    `, [trainer.trainer_id, code]);
    return updated.rows[0];
  }
  const inserted = await query<{ code: string }>(`
    insert into referral_codes (code, type, trainer_id, created_by_user_id)
    values ($1,'trainer',$2,$3)
    returning code
  `, [code, trainer.trainer_id, userId]);
  return inserted.rows[0];
}

async function activateExistingTrainer(userId: string, trainerId: string) {
  await query("update trainers set status='active' where id=$1", [trainerId]);
  await query("insert into user_roles (user_id, role) values ($1,'trainer') on conflict do nothing", [userId]);
  await query("update users set primary_role=case when primary_role='client' then 'trainer' else primary_role end, updated_at=now() where id=$1", [userId]);
  await query("update trainer_onboarding_intents set status='activated', activated_at=coalesce(activated_at,now()), updated_at=now() where user_id=$1", [userId]);
  const referral = await createTrainerReferralCode(userId);
  return { trainerId, referralCode: referral.code };
}

export async function activateTrainerWorkspaceForEntitlement(userId: string) {
  const userResult = await query<{ email: string; full_name: string; primary_role: string }>(
    "select email, full_name, primary_role from users where id=$1 for update",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw Object.assign(new Error("Ascend account not found."), { status: 404 });

  const existingTrainer = await query<{ id: string }>("select id from trainers where user_id=$1 for update", [userId]);
  if (existingTrainer.rows[0]) return activateExistingTrainer(userId, existingTrainer.rows[0].id);

  const intentResult = await query<{
    mode: TrainerOnboardingMode;
    workspace_name: string | null;
    country: string | null;
    timezone: string | null;
    trainer_invitation_id: string | null;
  }>("select mode, workspace_name, country, timezone, trainer_invitation_id from trainer_onboarding_intents where user_id=$1 for update", [userId]);
  const intent = intentResult.rows[0];

  let gymId: string | null = null;
  if (intent?.mode === "gym" && intent.trainer_invitation_id) {
    const invitationResult = await query<TrainerInvitation>(`
      select ti.id, ti.gym_id, g.name as gym_name, ti.intended_email, ti.expires_at, ti.consumed_at, ti.revoked_at
      from trainer_invitations ti join gyms g on g.id=ti.gym_id
      where ti.id=$1 for update of ti
    `, [intent.trainer_invitation_id]);
    const invitation = invitationResult.rows[0];
    if (invitation && !invitation.revoked_at && !invitation.consumed_at && new Date(invitation.expires_at).getTime() > Date.now()
      && (!invitation.intended_email || invitation.intended_email.toLowerCase() === user.email.toLowerCase())) {
      gymId = invitation.gym_id;
      await query("update trainer_invitations set consumed_at=now(), consumed_by_user_id=$2 where id=$1", [invitation.id, userId]);
    }
  }

  if (!gymId) {
    const workspaceName = cleanWorkspaceName(intent?.workspace_name ?? undefined, user.full_name);
    const created = await query<{ id: string }>(`
      insert into gyms (name, slug, location, country, timezone, workspace_type, created_for_trainer_user_id)
      values ($1,$2,'Independent',$3,$4,'independent',$5)
      on conflict (created_for_trainer_user_id) where created_for_trainer_user_id is not null
      do update set name=excluded.name, country=excluded.country, timezone=excluded.timezone
      returning id
    `, [workspaceName, `${slugPart(workspaceName)}-${userId.replace(/-/g, "").slice(0, 8)}`, intent?.country ?? "Malaysia", intent?.timezone ?? "Asia/Kuala_Lumpur", userId]);
    gymId = created.rows[0].id;
  }

  await query("update users set gym_id=$2, primary_role=case when primary_role='client' then 'trainer' else primary_role end, updated_at=now() where id=$1", [userId, gymId]);
  await query("insert into user_roles (user_id, role) values ($1,'trainer') on conflict do nothing", [userId]);
  const trainerResult = await query<{ id: string }>(`
    insert into trainers (user_id, gym_id, specialties, status)
    values ($1,$2,'{}','active')
    on conflict (user_id) do update set gym_id=excluded.gym_id, status='active'
    returning id
  `, [userId, gymId]);
  await query(`
    insert into trainer_onboarding_intents (user_id, mode, workspace_name, country, timezone, status, activated_at, updated_at)
    values ($1,'independent',$2,$3,$4,'activated',now(),now())
    on conflict (user_id) do update set status='activated', activated_at=coalesce(trainer_onboarding_intents.activated_at,now()), updated_at=now()
  `, [userId, cleanWorkspaceName(intent?.workspace_name ?? undefined, user.full_name), intent?.country ?? "Malaysia", intent?.timezone ?? "Asia/Kuala_Lumpur"]);
  const referral = await createTrainerReferralCode(userId);
  return { trainerId: trainerResult.rows[0].id, referralCode: referral.code };
}

