import { query } from "./pool";
import { ensureAiUsageSchema } from "../services/aiUsageService";
import { ensureCoachPresenceSchema } from "../services/coachPresenceService";
import { ensureAscendMemorySchema } from "../services/ascendMemoryService";
import { ensureUserProfileSchema } from "../services/userService";
import { ensureWaitlistSchema } from "../services/waitlistService";
import { ensureSubscriptionSchema } from "../services/subscriptionSchemaService";
import { ensureNotificationSchema } from "../services/notificationService";
import { ensureHealthSyncSchema } from "../services/healthSyncService";
import { ensureClientErrorSchema } from "../services/clientErrorService";

// Run with the migration credential before deployment, never with the HTTP runtime role.
export async function ensureRuntimeSchema() {
  for (const ensure of [ensureAiUsageSchema, ensureUserProfileSchema, ensureWaitlistSchema,
    ensureSubscriptionSchema, ensureNotificationSchema, ensureCoachPresenceSchema,
    ensureAscendMemorySchema, ensureHealthSyncSchema, ensureClientErrorSchema]) await ensure();
}

export async function verifyRuntimeSchema() {
  const result = await query("select filename from schema_migrations where filename=$1", ["041_ai_work_leases.sql"]);
  if (!result.rows.length) throw new Error("Required database migration has not been applied.");
  await query("select token from ai_work_leases limit 0");
  await query("select id from client_error_reports limit 0");
}
