import { query } from "../db/pool";
import { AuthUser } from "../middleware/auth";
import { getAdminGymScope, scopeAllowsGym } from "./adminScopeService";

export async function canManageClient(user: AuthUser, clientId: string) {
  const result = await query<{ assigned_trainer_id: string | null; gym_id: string | null; primary_role: string; status: string }>(
    "select assigned_trainer_id, gym_id, primary_role, status from users where id = $1",
    [clientId]
  );
  const client = result.rows[0];
  if (!client || client.primary_role !== "client" || client.status !== "active") return false;
  if (user.isPlatformOwner) return true;
  if (user.roles.includes("admin") || user.roles.includes("owner")) {
    return scopeAllowsGym(await getAdminGymScope(user), client.gym_id);
  }
  return Boolean(user.trainerId && client.assigned_trainer_id === user.trainerId);
}
