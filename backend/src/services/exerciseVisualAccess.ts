import type { AuthUser } from "../middleware/auth";
import { env } from "../config/env";

type ExerciseVisualAccessConfig = {
  enabled: boolean;
  userIds: string;
};

export function hasExerciseVisualAccess(
  user: Pick<AuthUser, "id" | "isPlatformOwner">,
  config: ExerciseVisualAccessConfig = {
    enabled: env.EXERCISE_VISUALS_ENABLED,
    userIds: env.EXERCISE_VISUALS_USER_IDS
  }
) {
  if (!config.enabled) return false;
  if (user.isPlatformOwner) return true;
  return config.userIds.split(",").some((id) => id.trim() === user.id);
}
