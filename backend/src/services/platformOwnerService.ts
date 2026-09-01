import { env } from "../config/env";
import { query } from "../db/pool";

export function isPlatformOwnerEmail(email: string | null | undefined) {
  const configuredEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(configuredEmail && email?.trim().toLowerCase() === configuredEmail);
}

export async function ensurePlatformOwnerCoachAccess(userId: string, gymId: string | null | undefined) {
  await query(
    "insert into user_roles (user_id, role) values ($1, 'owner'), ($1, 'admin') on conflict (user_id, role) do nothing",
    [userId]
  );

  if (!gymId) return null;

  await query(
    "insert into user_roles (user_id, role) values ($1, 'trainer') on conflict (user_id, role) do nothing",
    [userId]
  );
  const trainer = await query<{ id: string }>(
    `
    insert into trainers (user_id, gym_id, specialties, status)
    values ($1, $2, '{}', 'active')
    on conflict (user_id) do update set
      gym_id = excluded.gym_id,
      status = 'active'
    returning id
    `,
    [userId, gymId]
  );
  return trainer.rows[0]?.id ?? null;
}
