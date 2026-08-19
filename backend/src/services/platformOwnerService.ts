import { env } from "../config/env";

export function isPlatformOwnerEmail(email: string | null | undefined) {
  const configuredEmail = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(configuredEmail && email?.trim().toLowerCase() === configuredEmail);
}
