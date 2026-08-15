import crypto from "node:crypto";
import { PoolClient } from "pg";
import { SubscriptionPlan } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { PaymentProviderError } from "../integrations/payments";
import { withBillingTransaction } from "./entitlementService";
import { decryptProviderToken, encryptProviderToken, hashProviderToken, obfuscatedGooglePlayAccountId } from "./providerTokenCrypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3";

type PlayResponse = {
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  lineItems?: Array<{ productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean }; offerDetails?: { basePlanId?: string; offerId?: string } }>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  testPurchase?: Record<string, unknown>;
};

type ProductConfig = { plan: Exclude<SubscriptionPlan, "free">; productId: string; basePlanId: string; amountCents: number };
export type VerifiedGooglePlayPurchase = {
  purchaseToken: string;
  tokenHash: string;
  packageName: string;
  plan: Exclude<SubscriptionPlan, "free">;
  productId: string;
  basePlanId: string;
  offerId: string | null;
  amountCents: number;
  status: "pending" | "active" | "grace_period" | "on_hold" | "paused" | "canceled" | "expired" | "unknown";
  rawState: string;
  startedAt: string | null;
  expiresAt: string | null;
  orderId: string | null;
  acknowledged: boolean;
  autoRenewEnabled: boolean;
  accountId: string | null;
  testPurchase: boolean;
};

export function configuredGooglePlayPackageName() {
  return env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || "fit.getascend.app";
}

function products(): ProductConfig[] {
  return [
    { plan: "premium", productId: env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID, basePlanId: env.GOOGLE_PLAY_PREMIUM_MONTHLY_BASE_PLAN_ID, amountCents: env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRICE_CENTS },
    { plan: "premium", productId: env.GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID, basePlanId: env.GOOGLE_PLAY_PREMIUM_YEARLY_BASE_PLAN_ID, amountCents: env.GOOGLE_PLAY_PREMIUM_YEARLY_PRICE_CENTS },
  ];
}

function requireEnabled() {
  if (!env.GOOGLE_PLAY_BILLING_ENABLED) throw new PaymentProviderError("Google Play subscriptions are not available in this build.");
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY) throw new PaymentProviderError("Google Play verification is not configured.");
}

function b64(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

async function accessToken() {
  requireEnabled();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify({ iss: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64(signature)}` }) });
  const body = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !body?.access_token) throw new PaymentProviderError(body?.error_description || "Google Play authorization failed.");
  return body.access_token;
}

function status(state?: string): VerifiedGooglePlayPurchase["status"] {
  return ({
    SUBSCRIPTION_STATE_PENDING: "pending",
    SUBSCRIPTION_STATE_ACTIVE: "active",
    SUBSCRIPTION_STATE_IN_GRACE_PERIOD: "grace_period",
    SUBSCRIPTION_STATE_ON_HOLD: "on_hold",
    SUBSCRIPTION_STATE_PAUSED: "paused",
    SUBSCRIPTION_STATE_CANCELED: "canceled",
    SUBSCRIPTION_STATE_EXPIRED: "expired",
    SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: "canceled",
  } as Record<string, VerifiedGooglePlayPurchase["status"]>)[state ?? ""] ?? "unknown";
}

export async function verifyGooglePlaySubscriptionPurchase(input: { purchaseToken: string; productId?: string | null; packageName?: string | null; userId: string }) {
  requireEnabled();
  const token = input.purchaseToken.trim();
  if (!token) throw new PaymentProviderError("Google Play purchase token is missing.");
  const packageName = input.packageName?.trim() || configuredGooglePlayPackageName();
  if (packageName !== configuredGooglePlayPackageName()) throw new PaymentProviderError("Google Play package does not match this Ascend app.");

  const auth = await accessToken();
  const response = await fetch(`${API}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`, { headers: { Authorization: `Bearer ${auth}`, Accept: "application/json" } });
  const body = await response.json().catch(() => null) as (PlayResponse & { error?: { message?: string } }) | null;
  if (!response.ok || !body) throw new PaymentProviderError(body?.error?.message || "Google Play could not verify this purchase.");

  const line = body.lineItems?.find((item) => item.productId === input.productId) ?? body.lineItems?.[0];
  const product = products().find((entry) => entry.productId === line?.productId && (!line?.offerDetails?.basePlanId || entry.basePlanId === line.offerDetails.basePlanId));
  if (!product) throw new PaymentProviderError("This Google Play subscription product is not configured for Ascend.");
  const expectedAccountId = obfuscatedGooglePlayAccountId(input.userId);
  const accountId = body.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;
  if (accountId && accountId !== expectedAccountId) throw new PaymentProviderError("This Google Play purchase belongs to another Ascend account.");

  return {
    purchaseToken: token, tokenHash: hashProviderToken(token), packageName, plan: product.plan,
    productId: product.productId, basePlanId: line?.offerDetails?.basePlanId ?? product.basePlanId,
    offerId: line?.offerDetails?.offerId ?? null, amountCents: product.amountCents,
    status: status(body.subscriptionState), rawState: body.subscriptionState ?? "UNKNOWN",
    startedAt: body.startTime ?? null, expiresAt: line?.expiryTime ?? null, orderId: body.latestOrderId ?? null,
    acknowledged: body.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
    autoRenewEnabled: Boolean(line?.autoRenewingPlan?.autoRenewEnabled), accountId,
    testPurchase: Boolean(body.testPurchase),
  } satisfies VerifiedGooglePlayPurchase;
}

async function acknowledge(purchase: VerifiedGooglePlayPurchase) {
  if (purchase.acknowledged || purchase.status === "pending") return purchase.acknowledged;
  const auth = await accessToken();
  const response = await fetch(`${API}/applications/${encodeURIComponent(purchase.packageName)}/purchases/subscriptions/${encodeURIComponent(purchase.productId)}/tokens/${encodeURIComponent(purchase.purchaseToken)}:acknowledge`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: "{}" });
  if (!response.ok) throw new PaymentProviderError("Google Play purchase was verified but could not be acknowledged.");
  return true;
}

async function recordAcknowledgementResult(entitlementId: string, acknowledged: boolean, retryReason = "acknowledgement_failed") {
  if (acknowledged) {
    await query(`update subscription_entitlements set acknowledged=true,retry_state='none',retry_count=0,
      next_retry_at=null,last_error_code=null,updated_at=now() where id=$1`, [entitlementId]);
    await query(`update google_play_reconciliation_jobs set status='completed',completed_at=now(),updated_at=now()
      where entitlement_id=$1 and status in ('pending','processing')`, [entitlementId]);
    return;
  }

  await withBillingTransaction(async (client) => {
    await client.query(`update subscription_entitlements set retry_state='pending',retry_count=retry_count+1,
      next_retry_at=now()+interval '5 minutes',last_error_code=$2,updated_at=now() where id=$1`, [entitlementId, retryReason]);
    await client.query(`insert into google_play_reconciliation_jobs (entitlement_id,reason,status,next_attempt_at,last_error_code)
      values ($1,$2,'pending',now()+interval '5 minutes',$2)
      on conflict (entitlement_id) where status in ('pending','processing') do update set
        status='pending',reason=excluded.reason,next_attempt_at=excluded.next_attempt_at,
        last_error_code=excluded.last_error_code,updated_at=now()`, [entitlementId, retryReason]);
  });
}

async function upsertPurchase(client: PoolClient, userId: string, purchase: VerifiedGooglePlayPurchase) {
  const encrypted = encryptProviderToken(purchase.purchaseToken);
  const result = await client.query<{ id: string }>(`
    insert into subscription_entitlements (
      user_id, plan, provider, provider_account_ref, provider_subscription_ref, provider_product_id,
      provider_base_plan_id, provider_offer_id, status, purchase_state, started_at, expires_at,
      auto_renew_enabled, acknowledged, last_verified_at, stale_after, provider_event_time,
      management_type, management_url, audit_evidence, idempotency_key
    ) values ($1,$2,'google_play',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now()+($14 || ' hours')::interval,now(),
      'google_play','https://play.google.com/store/account/subscriptions?package=' || $15,
      $16,'google-play-token:' || $4)
    on conflict (provider, provider_subscription_ref) do update set
      user_id=excluded.user_id, plan=excluded.plan, provider_account_ref=excluded.provider_account_ref,
      provider_product_id=excluded.provider_product_id, provider_base_plan_id=excluded.provider_base_plan_id,
      provider_offer_id=excluded.provider_offer_id, status=excluded.status, purchase_state=excluded.purchase_state,
      started_at=excluded.started_at, expires_at=excluded.expires_at, auto_renew_enabled=excluded.auto_renew_enabled,
      acknowledged=excluded.acknowledged, last_verified_at=now(), stale_after=excluded.stale_after,
      provider_event_time=now(), management_url=excluded.management_url, audit_evidence=excluded.audit_evidence,
      updated_at=now()
    returning id`, [
      userId, purchase.plan, purchase.accountId, purchase.tokenHash, purchase.productId, purchase.basePlanId,
      purchase.offerId, purchase.status, purchase.rawState, purchase.startedAt, purchase.expiresAt,
      purchase.autoRenewEnabled, purchase.acknowledged, env.GOOGLE_PLAY_ENTITLEMENT_FRESHNESS_HOURS,
      purchase.packageName, { orderId: purchase.orderId, testPurchase: purchase.testPurchase, packageName: purchase.packageName },
    ]);
  const entitlementId = result.rows[0].id;
  const legacyStatus = purchase.status === "grace_period" ? "active" : purchase.status === "on_hold" || purchase.status === "paused" || purchase.status === "pending" || purchase.status === "unknown" ? "past_due" : purchase.status;
  await client.query(`insert into subscriptions (
      user_id,plan,provider,provider_customer_id,provider_subscription_id,status,amount_cents,currency,
      current_period_start,current_period_end,referred_by_gym_id,referred_by_trainer_id
    ) select $1,$2,'google_play',$3,$4,$5,$6,'MYR',$7,$8,u.referred_by_gym_id,u.referred_by_trainer_id from users u where u.id=$1
    on conflict (provider,provider_subscription_id) do update set user_id=excluded.user_id,plan=excluded.plan,
      provider_customer_id=excluded.provider_customer_id,status=excluded.status,amount_cents=excluded.amount_cents,
      current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,updated_at=now()`,
    [userId, purchase.plan, purchase.orderId, purchase.tokenHash, legacyStatus, purchase.amountCents, purchase.startedAt, purchase.expiresAt]);
  await client.query(`insert into subscription_provider_tokens (entitlement_id,provider,token_hash,token_ciphertext,token_iv,token_auth_tag,key_version)
    values ($1,'google_play',$2,$3,$4,$5,$6) on conflict (token_hash) do update set entitlement_id=excluded.entitlement_id,
    token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,token_auth_tag=excluded.token_auth_tag,key_version=excluded.key_version,updated_at=now()`,
    [entitlementId, encrypted.hash, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyVersion]);
  await client.query(`insert into billing_audit_events (user_id,entitlement_id,provider,event_type,event_id,environment,evidence)
    values ($1,$2,'google_play','purchase_verified',$3,$4,$5) on conflict (event_id) do nothing`,
    [userId, entitlementId, `play-verify:${purchase.tokenHash}:${purchase.rawState}:${purchase.expiresAt ?? "none"}`, env.ASCEND_APP_ENV,
      { productId: purchase.productId, basePlanId: purchase.basePlanId, state: purchase.rawState, testPurchase: purchase.testPurchase }]);
  return entitlementId;
}

export async function applyVerifiedGooglePlaySubscription(userId: string, initial: VerifiedGooglePlayPurchase) {
  const entitlementId = await withBillingTransaction((client) => upsertPurchase(client, userId, initial));
  let acknowledged = initial.acknowledged;
  if (!acknowledged && initial.status !== "pending") {
    try {
      acknowledged = await acknowledge(initial);
    } catch {
      acknowledged = false;
    }
  }
  await recordAcknowledgementResult(entitlementId, acknowledged, initial.status === "pending" ? "purchase_pending" : "acknowledgement_failed");
  return {
    id: entitlementId,
    plan: initial.plan,
    provider: "google_play" as const,
    status: initial.status,
    current_period_end: initial.expiresAt,
    acknowledged,
  };
}

export function getGooglePlayAccountId(userId: string) {
  return obfuscatedGooglePlayAccountId(userId);
}

export async function reconcileGooglePlayTokenHash(tokenHash: string) {
  const result = await query<{
    user_id: string; token_ciphertext: string; token_iv: string; token_auth_tag: string; key_version: number;
  }>(`select e.user_id,t.token_ciphertext,t.token_iv,t.token_auth_tag,t.key_version
      from subscription_provider_tokens t join subscription_entitlements e on e.id=t.entitlement_id
      where t.token_hash=$1 and t.provider='google_play'`, [tokenHash]);
  const row = result.rows[0];
  if (!row) return null;
  const purchaseToken = decryptProviderToken({ ciphertext: row.token_ciphertext, iv: row.token_iv, authTag: row.token_auth_tag, keyVersion: row.key_version });
  const purchase = await verifyGooglePlaySubscriptionPurchase({ purchaseToken, userId: row.user_id });
  return applyVerifiedGooglePlaySubscription(row.user_id, purchase);
}

export async function retryGooglePlayReconciliationJobs(limit = 20) {
  const due = await query<{ id: string; entitlement_id: string; token_hash: string; attempt_count: number }>(`
    select j.id,j.entitlement_id,t.token_hash,j.attempt_count
    from google_play_reconciliation_jobs j
    join subscription_provider_tokens t on t.entitlement_id=j.entitlement_id
    where j.status='pending' and j.next_attempt_at<=now()
    order by j.next_attempt_at
    limit $1`, [limit]);

  for (const job of due.rows) {
    const claimed = await query("update google_play_reconciliation_jobs set status='processing',locked_at=now(),updated_at=now() where id=$1 and status='pending' returning id", [job.id]);
    if (!claimed.rowCount) continue;
    try {
      const result = await reconcileGooglePlayTokenHash(job.token_hash);
      if (!result?.acknowledged) throw new Error("Google Play acknowledgement remains pending.");
      await query("update google_play_reconciliation_jobs set status='completed',completed_at=now(),updated_at=now() where id=$1", [job.id]);
    } catch (error) {
      const attempts = job.attempt_count + 1;
      const dead = attempts >= 8;
      const delayMinutes = Math.min(1440, 5 * (2 ** Math.min(attempts, 8)));
      await query(`update google_play_reconciliation_jobs set status=$2,attempt_count=$3,
        next_attempt_at=now()+($4 || ' minutes')::interval,last_error_code=$5,locked_at=null,updated_at=now() where id=$1`,
      [job.id, dead ? "dead_letter" : "pending", attempts, delayMinutes, error instanceof Error ? error.name : "unknown"]);
    }
  }
  return due.rowCount ?? 0;
}
