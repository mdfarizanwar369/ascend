import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { query } from "../db/pool";
import { hashProviderToken } from "./providerTokenCrypto";
import { reconcileGooglePlayTokenHash } from "./googlePlayBillingService";

type PubSubEnvelope = { message?: { messageId?: string; publishTime?: string; data?: string } };
type RtdnPayload = { version?: string; packageName?: string; eventTimeMillis?: string; subscriptionNotification?: { version?: string; notificationType?: number; purchaseToken?: string; subscriptionId?: string }; testNotification?: { version?: string } };

const oidc = new OAuth2Client();

export async function verifyGooglePlayRtdnAuthorization(header: string | undefined) {
  if (!env.GOOGLE_PLAY_RTDN_ENABLED || !env.GOOGLE_PLAY_RTDN_AUDIENCE || !env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL) return false;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return false;
  const ticket = await oidc.verifyIdToken({ idToken: token, audience: env.GOOGLE_PLAY_RTDN_AUDIENCE });
  return ticket.getPayload()?.email === env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL && ticket.getPayload()?.email_verified === true;
}

export async function processGooglePlayRtdn(envelope: PubSubEnvelope) {
  const messageId = envelope.message?.messageId;
  if (!messageId || !envelope.message?.data) throw new Error("Malformed Google Play RTDN message.");
  const payload = JSON.parse(Buffer.from(envelope.message.data, "base64").toString("utf8")) as RtdnPayload;
  if (payload.packageName !== (env.GOOGLE_PLAY_PACKAGE_NAME || "fit.getascend.app")) throw new Error("Unexpected Google Play package.");
  const notification = payload.subscriptionNotification;
  const tokenHash = notification?.purchaseToken ? hashProviderToken(notification.purchaseToken) : null;
  const inserted = await query<{ id: string }>(`
    insert into google_play_rtdn_events (message_id,package_name,event_time,notification_type,subscription_id,token_hash,status,safe_payload)
    values ($1,$2,to_timestamp($3::double precision/1000),$4,$5,$6,'received',$7)
    on conflict (message_id) do nothing returning id`, [messageId, payload.packageName, payload.eventTimeMillis ?? Date.now().toString(), notification?.notificationType ?? null, notification?.subscriptionId ?? null, tokenHash, { version: payload.version, test: Boolean(payload.testNotification) }]);
  if (!inserted.rowCount) return { duplicate: true };
  if (!tokenHash) {
    await query("update google_play_rtdn_events set status='processed',processed_at=now(),updated_at=now() where message_id=$1", [messageId]);
    return { test: true };
  }
  try {
    const reconciled = await reconcileGooglePlayTokenHash(tokenHash);
    await query("update google_play_rtdn_events set status=$2,processed_at=now(),attempt_count=1,updated_at=now() where message_id=$1", [messageId, reconciled ? "processed" : "unmatched"]);
    return { reconciled: Boolean(reconciled) };
  } catch (error) {
    await query("update google_play_rtdn_events set status='retry_required',attempt_count=1,next_retry_at=now()+interval '5 minutes',last_error_code=$2,updated_at=now() where message_id=$1", [messageId, error instanceof Error ? error.name : "unknown"]);
    throw error;
  }
}

export async function retryGooglePlayRtdn(limit = 20) {
  const due = await query<{ message_id: string; token_hash: string; attempt_count: number }>(`select message_id,token_hash,attempt_count from google_play_rtdn_events
    where status='retry_required' and next_retry_at<=now() and token_hash is not null order by next_retry_at limit $1`, [limit]);
  for (const row of due.rows) {
    try {
      const reconciled = await reconcileGooglePlayTokenHash(row.token_hash);
      await query("update google_play_rtdn_events set status=$2,processed_at=now(),attempt_count=attempt_count+1,updated_at=now() where message_id=$1", [row.message_id, reconciled ? "processed" : "unmatched"]);
    } catch (error) {
      const attempts = row.attempt_count + 1;
      const dead = attempts >= 8;
      const delayMinutes = Math.min(1440, 5 * (2 ** Math.min(attempts, 8)));
      await query("update google_play_rtdn_events set status=$2,attempt_count=$3,next_retry_at=now()+($4 || ' minutes')::interval,last_error_code=$5,updated_at=now() where message_id=$1", [row.message_id, dead ? "dead_letter" : "retry_required", attempts, delayMinutes, error instanceof Error ? error.name : "unknown"]);
    }
  }
  return due.rowCount ?? 0;
}
