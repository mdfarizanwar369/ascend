import { readFileSync } from "node:fs";
import path from "node:path";
import { AppStoreServerAPIClient, Environment, SignedDataVerifier, Status, VerificationException, VerificationStatus, APIException, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { env } from "../config/env";
import { pool, query } from "../db/pool";

export const APPLE_PRODUCTS = {
  "fit.getascend.app.premium.monthly": "premium",
  "fit.getascend.app.trainerpro.monthly": "trainer_pro"
} as const;
export type AppleEnvironment = "Production" | "Sandbox";

function failure(message: string, status = 400): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export function appleBillingConfigured() {
  return Boolean(env.APPLE_IAP_ENABLED && env.APPLE_IAP_KEY_ID && env.APPLE_IAP_ISSUER_ID && env.APPLE_IAP_PRIVATE_KEY);
}

export async function hasOtherPaidSubscription(userId: string) {
  const result = await query(`select 1 from subscriptions where user_id=$1
    and provider not in ('app_store', 'manual') and plan <> 'free'
    and (status in ('active','trialing','past_due') or (status='canceled' and current_period_end > now())) limit 1`, [userId]);
  return Boolean(result.rowCount);
}

export function appleRequestError(error: unknown) {
  if (error instanceof VerificationException) {
    return error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
      ? failure("Apple verification is temporarily unavailable. Try Restore Purchases shortly.", 503)
      : failure("Apple could not verify this purchase. Please use Restore Purchases to try again.", 400);
  }
  if (error instanceof APIException) return failure("Apple could not confirm the subscription yet. Try Restore Purchases shortly.", 503);
  return error;
}

function requireEnabled() {
  if (!appleBillingConfigured()) throw failure("Apple subscriptions are not available yet.", 503);
}

function checkSandbox(userId: string, environment: AppleEnvironment) {
  if (environment === "Sandbox" && !env.APPLE_IAP_SANDBOX_USER_IDS.split(",").map(id => id.trim()).includes(userId)) {
    throw failure("This Ascend account is not enabled for subscription testing.", 403);
  }
}

const verifiers = new Map<AppleEnvironment, SignedDataVerifier>();
function verifier(environment: AppleEnvironment) {
  let value = verifiers.get(environment);
  if (!value) {
    // Public Apple trust anchor, shipped with the application, never supplied by a request.
    const root = readFileSync(path.resolve(__dirname, "../../certificates/AppleRootCA-G3.cer"));
    value = new SignedDataVerifier([root], true, environment as Environment, env.APPLE_IAP_BUNDLE_ID, env.APPLE_IAP_APP_ID);
    verifiers.set(environment, value);
  }
  return value;
}

function api(environment: AppleEnvironment) {
  return new AppStoreServerAPIClient(env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n"), env.APPLE_IAP_KEY_ID!, env.APPLE_IAP_ISSUER_ID!, env.APPLE_IAP_BUNDLE_ID, environment as Environment);
}

export function normalizeAppleSubscription(transaction: JWSTransactionDecodedPayload, renewal: JWSRenewalInfoDecodedPayload, status: number | undefined, userId: string, environment: AppleEnvironment, now = Date.now()) {
  const productId = transaction.productId as keyof typeof APPLE_PRODUCTS;
  if (transaction.bundleId !== env.APPLE_IAP_BUNDLE_ID || transaction.environment !== environment || !APPLE_PRODUCTS[productId] || transaction.type !== "Auto-Renewable Subscription") {
    throw failure("This purchase is not an Ascend subscription.");
  }
  if (transaction.appAccountToken?.toLowerCase() !== userId.toLowerCase()) {
    throw failure("This Apple subscription belongs to a different Ascend account. Sign in to the account used to purchase it.", 409);
  }
  if (!transaction.originalTransactionId || !transaction.transactionId || renewal.originalTransactionId !== transaction.originalTransactionId || renewal.environment !== environment) {
    throw failure("Apple subscription details do not match.");
  }
  if (transaction.inAppOwnershipType !== "PURCHASED") throw failure("Family-shared purchases are not supported for this subscription.");
  const expiry = status === Status.BILLING_GRACE_PERIOD ? renewal.gracePeriodExpiresDate : transaction.expiresDate;
  if (!Number.isFinite(expiry) || !Number.isFinite(transaction.purchaseDate)) throw failure("Apple did not return a valid subscription period.");
  const usable = !transaction.revocationDate && !transaction.isUpgraded && (status === Status.ACTIVE || status === Status.BILLING_GRACE_PERIOD) && expiry! > now;
  const autoRenew = renewal.autoRenewStatus === 1;
  return {
    plan: APPLE_PRODUCTS[productId], productId, originalId: transaction.originalTransactionId,
    transactionId: transaction.transactionId, environment, autoRenew,
    status: usable ? (autoRenew ? "active" : "canceled") : (status === Status.BILLING_RETRY ? "past_due" : "expired"),
    start: new Date(transaction.purchaseDate!).toISOString(),
    end: new Date(transaction.revocationDate ? Math.min(expiry!, transaction.revocationDate) : expiry!).toISOString(),
    // Apple signs prices in milliunits; Ascend stores hundredths of the currency.
    amountCents: Math.round((transaction.price ?? 0) / 10), currency: transaction.currency ?? "MYR"
  };
}

async function currentSnapshot(originalId: string, userId: string, environment: AppleEnvironment) {
  const response = await api(environment).getAllSubscriptionStatuses(originalId);
  const item = response.data?.flatMap(group => group.lastTransactions ?? []).find(entry => entry.originalTransactionId === originalId);
  if (!item?.signedTransactionInfo || !item.signedRenewalInfo) throw failure("Apple has not confirmed this subscription yet. Try Restore Purchases shortly.", 503);
  const [transaction, renewal] = await Promise.all([
    verifier(environment).verifyAndDecodeTransaction(item.signedTransactionInfo),
    verifier(environment).verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
  ]);
  if (transaction.originalTransactionId !== originalId) throw failure("Apple transaction mismatch.");
  return normalizeAppleSubscription(transaction, renewal, item.status, userId, environment);
}

async function syncOriginal(originalId: string, userId: string, environment: AppleEnvironment) {
  requireEnabled();
  checkSandbox(userId, environment);
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Serialize purchase, restore and webhook refreshes; never overwrite a newer state with a slow older response.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`apple:${environment}:${originalId}`]);
    const purchase = await currentSnapshot(originalId, userId, environment);
    const result = await client.query(`
      insert into subscriptions (user_id, plan, provider, provider_subscription_id, status, amount_cents, currency,
        current_period_start, current_period_end, apple_environment, apple_original_transaction_id,
        apple_transaction_id, apple_product_id, apple_auto_renew, apple_checked_at)
      values ($1, $2, 'app_store', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
      on conflict (provider, provider_subscription_id) do update set
        plan=excluded.plan, status=excluded.status, amount_cents=excluded.amount_cents, currency=excluded.currency,
        current_period_start=excluded.current_period_start, current_period_end=excluded.current_period_end,
        apple_transaction_id=excluded.apple_transaction_id, apple_product_id=excluded.apple_product_id,
        apple_auto_renew=excluded.apple_auto_renew, apple_checked_at=now(), updated_at=now()
      where subscriptions.user_id=excluded.user_id
      returning id, plan, provider, status, current_period_end, apple_auto_renew, apple_environment
    `, [userId, purchase.plan, `${environment}:${originalId}`, purchase.status, purchase.amountCents, purchase.currency,
      purchase.start, purchase.end, environment, originalId, purchase.transactionId, purchase.productId, purchase.autoRenew]);
    if (!result.rows[0]) throw failure("This subscription is already linked to another account.", 409);
    // Other payment providers retain their own status: changing a database row cannot cancel a Stripe charge.
    await client.query("commit");
    return result.rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function verifyApplePurchase(userId: string, signedTransaction: string, environment: AppleEnvironment) {
  requireEnabled();
  checkSandbox(userId, environment);
  const transaction = await verifier(environment).verifyAndDecodeTransaction(signedTransaction);
  if (!transaction.originalTransactionId || transaction.appAccountToken?.toLowerCase() !== userId.toLowerCase()) {
    throw failure("This Apple purchase is not linked to your Ascend account.", 409);
  }
  // Consult Apple's current state, not a replayable historical purchase certificate.
  return syncOriginal(transaction.originalTransactionId, userId, environment);
}

export async function refreshAppleAccess(userId: string) {
  if (!appleBillingConfigured()) return;
  const rows = await query<{ apple_original_transaction_id: string; apple_environment: AppleEnvironment }>(`
    select apple_original_transaction_id, apple_environment from subscriptions
    where user_id=$1 and provider='app_store'
      and (apple_checked_at is null or apple_checked_at < now() - interval '5 minutes')
    order by created_at desc limit 5`, [userId]);
  for (const row of rows.rows) await syncOriginal(row.apple_original_transaction_id, userId, row.apple_environment);
}

export async function processAppleNotification(signedPayload: string) {
  requireEnabled();
  let notification;
  let environment: AppleEnvironment = "Production";
  try {
    notification = await verifier(environment).verifyAndDecodeNotification(signedPayload);
  } catch (error) {
    if (!(error instanceof VerificationException) || error.status !== VerificationStatus.INVALID_ENVIRONMENT) throw error;
    environment = "Sandbox";
    notification = await verifier(environment).verifyAndDecodeNotification(signedPayload);
  }
  if (!notification.notificationUUID) throw failure("Missing Apple notification ID.");
  const seen = await query("select 1 from apple_notification_receipts where notification_id=$1", [notification.notificationUUID]);
  if (seen.rowCount) return { received: true, duplicate: true };
  if (notification.notificationType !== "TEST") {
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) throw failure("Missing Apple transaction.");
    const transaction = await verifier(environment).verifyAndDecodeTransaction(signedTransaction);
    if (!transaction.appAccountToken || !transaction.originalTransactionId) throw failure("Missing Ascend account linkage.");
    const user = await query("select id from users where id=$1", [transaction.appAccountToken]);
    // A deleted account must never be recreated or granted access by a renewal notification.
    if (user.rowCount) await syncOriginal(transaction.originalTransactionId, user.rows[0].id, environment);
  }
  await query("insert into apple_notification_receipts (notification_id, notification_type) values ($1,$2) on conflict do nothing", [notification.notificationUUID, notification.notificationType ?? "UNKNOWN"]);
  return { received: true };
}
