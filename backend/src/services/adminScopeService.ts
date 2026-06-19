import { AuthUser } from "../middleware/auth";
import { query } from "../db/pool";

export interface AdminGymScope {
  gymIds: string[] | null;
  isPlatformOwner: boolean;
}

export async function getAdminGymScope(user: AuthUser): Promise<AdminGymScope> {
  if (user.isPlatformOwner) return { gymIds: null, isPlatformOwner: true };

  const result = await query<{ gym_id: string }>(
    `
    select gym_id from gym_owner_assignments where user_id = $1
    union
    select gym_id from users where id = $1 and gym_id is not null
    `,
    [user.id]
  );
  return { gymIds: result.rows.map((row) => row.gym_id), isPlatformOwner: false };
}

export function scopeAllowsGym(scope: AdminGymScope, gymId: string | null | undefined) {
  return scope.gymIds === null || Boolean(gymId && scope.gymIds.includes(gymId));
}

export async function getUserGymId(userId: string) {
  const result = await query<{ gym_id: string | null }>("select gym_id from users where id = $1", [userId]);
  return result.rows[0]?.gym_id ?? null;
}

export async function getTrainerGymId(trainerId: string) {
  const result = await query<{ gym_id: string }>("select gym_id from trainers where id = $1", [trainerId]);
  return result.rows[0]?.gym_id ?? null;
}
