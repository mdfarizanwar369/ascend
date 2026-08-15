import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { structuredLog } from "../observability/logger";

const empty = z.object({}).strict();

export const productEventSchemas = {
  "product.registration_started.v1": empty,
  "product.registration_completed.v1": z.object({ role: z.enum(["client", "trainer", "owner"]), referralApplied: z.boolean() }).strict(),
  "product.onboarding_started.v1": empty,
  "product.onboarding_completed.v1": z.object({ goalType: z.enum(["fat_loss", "muscle_gain", "maintenance"]) }).strict(),
  "product.first_meal_logged.v1": z.object({ method: z.enum(["manual", "photo"]) }).strict(),
  "product.meal_logged_manually.v1": z.object({ method: z.enum(["text", "manual_form"]) }).strict(),
  "product.meal_photo_submitted.v1": empty,
  "product.meal_ai_succeeded.v1": z.object({ mode: z.enum(["photo", "text"]) }).strict(),
  "product.meal_ai_failed.v1": z.object({ mode: z.enum(["photo", "text"]), failureCode: z.string().regex(/^[A-Z0-9_/-]{1,80}$/) }).strict(),
  "product.progress_entry_created.v1": z.object({ type: z.enum(["weight", "photo"]) }).strict(),
  "product.trainer_invitation_sent.v1": empty,
  "product.trainer_connection_completed.v1": empty,
  "product.subscription_started.v1": z.object({ provider: z.enum(["stripe", "google_play", "lemonsqueezy", "toyyibpay", "manual"]), plan: z.enum(["premium", "trainer_pro"]) }).strict(),
  "product.subscription_renewed.v1": z.object({ provider: z.enum(["stripe", "google_play", "lemonsqueezy", "toyyibpay", "manual"]), plan: z.enum(["premium", "trainer_pro"]) }).strict(),
  "product.subscription_failed.v1": z.object({ provider: z.enum(["stripe", "google_play", "lemonsqueezy", "toyyibpay"]), failureCode: z.string().regex(/^[A-Z0-9_/-]{1,80}$/) }).strict(),
  "product.notification_opened.v1": z.object({ channel: z.enum(["push", "in_app", "email"]) }).strict(),
  "product.account_deletion_requested.v1": z.object({ mode: z.enum(["immediate", "manual_review"]) }).strict()
} as const;

export type ProductEventName = keyof typeof productEventSchemas;
export type ProductEventProperties<Name extends ProductEventName> = z.infer<(typeof productEventSchemas)[Name]>;

export interface ProductEventInput<Name extends ProductEventName> {
  name: Name;
  eventId: string;
  userId?: string | null;
  gymId?: string | null;
  properties: ProductEventProperties<Name>;
  analyticsAllowed?: boolean;
  isTestAccount?: boolean;
}

export async function recordProductEvent<Name extends ProductEventName>(input: ProductEventInput<Name>) {
  if (input.analyticsAllowed === false) return { recorded: false, reason: "opted_out" as const };
  if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(input.eventId)) throw new Error("Analytics event ID is invalid.");
  const properties = productEventSchemas[input.name].parse(input.properties);
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [`product-event:${input.eventId}`]);
    const existing = await db.query(
      "select id from analytics_events where event_name = $1 and metadata->>'eventId' = $2 limit 1",
      [input.name, input.eventId]
    );
    if (existing.rows[0]) {
      await db.query("commit");
      return { recorded: false, reason: "duplicate" as const };
    }
    const inserted = await db.query<{ id: string }>(
      `insert into analytics_events (user_id, gym_id, event_name, metadata)
       values ($1,$2,$3,$4::jsonb) returning id`,
      [input.userId ?? null, input.gymId ?? null, input.name, JSON.stringify({
        eventId: input.eventId,
        version: 1,
        environment: env.NODE_ENV,
        testAccount: input.isTestAccount === true,
        properties
      })]
    );
    await db.query("commit");
    return { recorded: true, id: inserted.rows[0].id };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

export async function recordProductEventSafely<Name extends ProductEventName>(input: ProductEventInput<Name>) {
  try {
    return await recordProductEvent(input);
  } catch (error) {
    structuredLog("warn", "product_analytics_event_failed", { eventName: input.name, error });
    return { recorded: false, reason: "failed" as const };
  }
}
