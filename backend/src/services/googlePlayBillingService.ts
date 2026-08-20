import crypto from "crypto";
import { SubscriptionPlan, SubscriptionStatus } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { PaymentProviderError } from "../integrations/payments";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const GOOGLE_ANDROID_PUBLISHER_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";

type GooglePlayProductConfig = {
  plan: Exclude<SubscriptionPlan, "free">;
  productId: string;
  amountCents: number;
};

type GooglePlaySubscriptionsV2Response = {
  kind?: string;
  startTime?: string;
  subscriptionState?: string;
  latestOrderId?: string;
  acknowledgementState?: string;
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
    };
    offerDetails?: {
      basePlanId?: string;
      offerId?: string;
    };
  }>;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  testPurchase?: Record<string, unknown>;
};

export type GooglePlayDeveloperNotification = {
  version?: string;
  packageName: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
  };
  testNotification?: { version?: string };
};

export function parseGooglePlayRtdnData(encodedData: string): GooglePlayDeveloperNotification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedData, "base64").toString("utf8"));
  } catch {
    throw new PaymentProviderError("Google Play RTDN payload is malformed.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PaymentProviderError("Google Play RTDN payload is empty.");
  }
  const notification = parsed as Record<string, unknown>;
  if (typeof notification.packageName !== "string" || !notification.packageName.trim()) {
    throw new PaymentProviderError("Google Play RTDN package name is missing.");
  }
  const rawSubscription = notification.subscriptionNotification;
  const subscriptionNotification = rawSubscription && typeof rawSubscription === "object"
    ? rawSubscription as Record<string, unknown>
    : null;
  if (subscriptionNotification && (
    typeof subscriptionNotification.purchaseToken !== "string" ||
    !subscriptionNotification.purchaseToken.trim() ||
    typeof subscriptionNotification.notificationType !== "number"
  )) {
    throw new PaymentProviderError("Google Play RTDN subscription data is invalid.");
  }
  return {
    version: typeof notification.version === "string" ? notification.version : undefined,
    packageName: notification.packageName,
    eventTimeMillis: typeof notification.eventTimeMillis === "string" ? notification.eventTimeMillis : undefined,
    subscriptionNotification: subscriptionNotification ? {
      version: typeof subscriptionNotification.version === "string" ? subscriptionNotification.version : undefined,
      notificationType: subscriptionNotification.notificationType as number,
      purchaseToken: String(subscriptionNotification.purchaseToken)
    } : undefined,
    testNotification: notification.testNotification && typeof notification.testNotification === "object"
      ? notification.testNotification as { version?: string }
      : undefined
  };
}

export type VerifiedGooglePlayPurchase = {
  purchaseToken: string;
  packageName: string;
  plan: Exclude<SubscriptionPlan, "free">;
  productId: string;
  amountCents: number;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  latestOrderId: string | null;
  acknowledgementState: "pending" | "acknowledged";
  autoRenewEnabled: boolean;
  basePlanId: string | null;
  offerId: string | null;
  rawState: string;
  rawResponse: GooglePlaySubscriptionsV2Response;
};

function configuredGooglePlayPackageName() {
  return env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || "fit.getascend.app";
}

function configuredGooglePlayProducts() {
  const products: GooglePlayProductConfig[] = [];
  if (env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID) {
    products.push({
      plan: "premium",
      productId: env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID,
      amountCents: env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRICE_CENTS,
    });
  }
  if (env.GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID) {
    products.push({
      plan: "premium",
      productId: env.GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID,
      amountCents: env.GOOGLE_PLAY_PREMIUM_YEARLY_PRICE_CENTS,
    });
  }
  return products;
}

function getGooglePlayProduct(productId?: string | null) {
  const products = configuredGooglePlayProducts();
  const matched = products.find((product) => product.productId === productId);
  if (!matched) {
    throw new PaymentProviderError(
      productId
        ? `Google Play product ${productId} is not configured in Ascend yet.`
        : "Google Play did not return a subscription product for this purchase."
    );
  }
  return matched;
}

function requireGooglePlayCredentials() {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new PaymentProviderError(
      "Google Play Billing verification is not configured yet. Add the service account email and private key in Railway."
    );
  }
}

function toBase64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createGoogleAccessToken() {
  requireGooglePlayCredentials();

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL!,
    scope: GOOGLE_ANDROID_PUBLISHER_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsignedToken = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(claims))}`;
  const privateKey = env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const signature = crypto.createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
  const assertion = `${unsignedToken}.${toBase64Url(signature)}`;

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const body = (await response.json().catch(() => null)) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !body?.access_token) {
    throw new PaymentProviderError(body?.error_description || body?.error || "Google Play access token could not be created.");
  }

  return body.access_token;
}

function mapGooglePlayStateToSubscriptionStatus(state: string | undefined) {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "active" as const;
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
    case "SUBSCRIPTION_STATE_PENDING":
      return "past_due" as const;
    case "SUBSCRIPTION_STATE_CANCELED":
      return "canceled" as const;
    case "SUBSCRIPTION_STATE_EXPIRED":
      return "expired" as const;
    case "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED":
      return "canceled" as const;
    default:
      return "past_due" as const;
  }
}

function mapAcknowledgementState(value: string | undefined) {
  return value === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" ? "acknowledged" as const : "pending" as const;
}

function normalizeGooglePlayPurchase(
  purchaseToken: string,
  packageName: string,
  response: GooglePlaySubscriptionsV2Response,
  requestedProductId?: string | null
): VerifiedGooglePlayPurchase {
  const lineItem =
    response.lineItems?.find((item) => item.productId === requestedProductId) ??
    response.lineItems?.find((item) => item.productId) ??
    null;
  const product = getGooglePlayProduct(lineItem?.productId ?? requestedProductId ?? null);

  return {
    purchaseToken,
    packageName,
    plan: product.plan,
    productId: product.productId,
    amountCents: product.amountCents,
    status: mapGooglePlayStateToSubscriptionStatus(response.subscriptionState),
    currentPeriodStart: response.startTime ?? null,
    currentPeriodEnd: lineItem?.expiryTime ?? null,
    latestOrderId: response.latestOrderId ?? null,
    acknowledgementState: mapAcknowledgementState(response.acknowledgementState),
    autoRenewEnabled: Boolean(lineItem?.autoRenewingPlan?.autoRenewEnabled),
    basePlanId: lineItem?.offerDetails?.basePlanId ?? null,
    offerId: lineItem?.offerDetails?.offerId ?? null,
    rawState: response.subscriptionState ?? "UNKNOWN",
    rawResponse: response,
  };
}

export async function verifyGooglePlaySubscriptionPurchase(input: {
  purchaseToken: string;
  productId?: string | null;
  packageName?: string | null;
}) {
  const packageName = input.packageName?.trim() || configuredGooglePlayPackageName();
  const token = input.purchaseToken.trim();
  if (!token) {
    throw new PaymentProviderError("Google Play purchase token is missing.");
  }

  const accessToken = await createGoogleAccessToken();
  const response = await fetch(
    `${GOOGLE_ANDROID_PUBLISHER_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const body = (await response.json().catch(() => null)) as (GooglePlaySubscriptionsV2Response & {
    error?: { message?: string; status?: string };
  }) | null;

  if (!response.ok || !body) {
    const statusCode = response.status;
    const detail = body?.error?.message ?? "Google Play could not verify this purchase token.";
    const error = new PaymentProviderError(detail);
    if (statusCode === 404 || statusCode === 400) {
      (error as Error & { status?: number }).status = 400;
    }
    throw error;
  }

  return normalizeGooglePlayPurchase(token, packageName, body, input.productId);
}

async function loadSubscriptionContext(userId: string) {
  const userResult = await query<{
    referred_by_gym_id: string | null;
    referred_by_trainer_id: string | null;
  }>(
    "select referred_by_gym_id, referred_by_trainer_id from users where id = $1",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    const error = new PaymentProviderError("User profile was not found. Please sign in again.");
    (error as Error & { status?: number }).status = 404;
    throw error;
  }
  return user;
}

export async function applyVerifiedGooglePlaySubscription(userId: string, purchase: VerifiedGooglePlayPurchase) {
  const user = await loadSubscriptionContext(userId);

  const result = await query<{
    id: string;
    plan: SubscriptionPlan;
    provider: string;
    status: SubscriptionStatus;
    current_period_end: string | null;
  }>(
    `
    insert into subscriptions (
      user_id, plan, provider, provider_customer_id, provider_subscription_id, status, amount_cents, currency,
      current_period_start, current_period_end, referred_by_gym_id, referred_by_trainer_id
    )
    values ($1, $2, 'google_play', $3, $4, $5, $6, 'MYR', $7::timestamptz, $8::timestamptz, $9, $10)
    on conflict (provider, provider_subscription_id) do update set
      user_id = excluded.user_id,
      plan = excluded.plan,
      provider_customer_id = excluded.provider_customer_id,
      status = excluded.status,
      amount_cents = excluded.amount_cents,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      referred_by_gym_id = excluded.referred_by_gym_id,
      referred_by_trainer_id = excluded.referred_by_trainer_id,
      updated_at = now()
    returning id, plan, provider, status, current_period_end
    `,
    [
      userId,
      purchase.plan,
      purchase.latestOrderId,
      purchase.purchaseToken,
      purchase.status,
      purchase.amountCents,
      purchase.currentPeriodStart,
      purchase.currentPeriodEnd,
      user.referred_by_gym_id,
      user.referred_by_trainer_id,
    ]
  );

  const subscription = result.rows[0];
  if (subscription && (purchase.status === "active" || purchase.status === "trialing" || purchase.status === "canceled")) {
    await query(
      `
      update subscriptions
      set status = 'canceled', updated_at = now()
      where user_id = $1
        and id <> $2
        and status in ('active', 'trialing')
      `,
      [userId, subscription.id]
    );
  }

  await query(
    `
    insert into payment_events (provider, provider_reference, event_type, payload)
    values ('google_play', $1, $2, $3)
    `,
    [
      purchase.purchaseToken,
      `google_play_${purchase.status}`,
      {
        productId: purchase.productId,
        latestOrderId: purchase.latestOrderId,
        status: purchase.status,
        acknowledgementState: purchase.acknowledgementState,
        currentPeriodEnd: purchase.currentPeriodEnd,
        packageName: purchase.packageName,
        rawState: purchase.rawState,
      },
    ]
  );

  return subscription;
}

export function shouldRefreshGooglePlaySubscription(
  updatedAt: string | null,
  currentPeriodEnd: string | null,
  now = new Date()
) {
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAtMs)) return true;

  const periodEndMs = currentPeriodEnd ? Date.parse(currentPeriodEnd) : Number.NaN;
  const nearPeriodEnd = Number.isFinite(periodEndMs) && periodEndMs <= now.getTime() + 24 * 60 * 60 * 1000;
  const refreshIntervalMs = nearPeriodEnd ? 5 * 60 * 1000 : 6 * 60 * 60 * 1000;
  return now.getTime() - updatedAtMs >= refreshIntervalMs;
}

export async function syncGooglePlaySubscriptionForUser(userId: string) {
  const existing = await query<{
    id: string;
    provider_subscription_id: string | null;
    provider_customer_id: string | null;
    current_period_end: string | null;
    updated_at: string | null;
  }>(
    `
    select id, provider_subscription_id, provider_customer_id, current_period_end, updated_at
    from subscriptions
    where user_id = $1 and provider = 'google_play'
    order by created_at desc
    limit 1
    `,
    [userId]
  );
  const subscription = existing.rows[0];
  if (!subscription?.provider_subscription_id) return null;
  if (!shouldRefreshGooglePlaySubscription(subscription.updated_at, subscription.current_period_end)) return null;

  const purchase = await verifyGooglePlaySubscriptionPurchase({
    purchaseToken: subscription.provider_subscription_id,
    packageName: configuredGooglePlayPackageName(),
  });

  await applyVerifiedGooglePlaySubscription(userId, purchase);
  return purchase;
}

export async function processGooglePlayRtdn(messageId: string, notification: GooglePlayDeveloperNotification) {
  if (notification.packageName !== configuredGooglePlayPackageName()) {
    const error = new PaymentProviderError("Google Play RTDN package name does not match Ascend.");
    (error as Error & { status?: number }).status = 400;
    throw error;
  }

  const duplicate = await query<{ id: string }>(
    "select id from payment_events where provider = 'google_play' and provider_reference = $1 and event_type = 'google_play_rtdn' limit 1",
    [messageId]
  );
  if (duplicate.rows[0]) return { received: true, duplicate: true, matchedSubscription: true };

  async function recordNotification(payload: Record<string, unknown>) {
    return query<{ id: string }>(
      `
      insert into payment_events (provider, provider_reference, event_type, payload)
      values ('google_play', $1, 'google_play_rtdn', $2)
      on conflict (provider_reference, event_type)
        where provider = 'google_play' and event_type = 'google_play_rtdn'
      do nothing
      returning id
      `,
      [messageId, payload]
    );
  }

  if (notification.testNotification) {
    const recorded = await recordNotification({ kind: "test", packageName: notification.packageName });
    if (!recorded.rows[0]) return { received: true, duplicate: true, matchedSubscription: false, test: true };
    return { received: true, duplicate: false, matchedSubscription: false, test: true };
  }

  const subscriptionNotice = notification.subscriptionNotification;
  if (!subscriptionNotice) {
    return { received: true, duplicate: false, matchedSubscription: false, ignored: true };
  }

  const existing = await query<{ user_id: string }>(
    `
    select user_id
    from subscriptions
    where provider = 'google_play' and provider_subscription_id = $1
    order by created_at desc
    limit 1
    `,
    [subscriptionNotice.purchaseToken]
  );
  const userId = existing.rows[0]?.user_id;
  if (!userId) {
    const recorded = await recordNotification({ kind: "subscription", notificationType: subscriptionNotice.notificationType, matched: false, packageName: notification.packageName });
    if (!recorded.rows[0]) return { received: true, duplicate: true, matchedSubscription: false };
    return { received: true, duplicate: false, matchedSubscription: false };
  }

  const purchase = await verifyGooglePlaySubscriptionPurchase({
    purchaseToken: subscriptionNotice.purchaseToken,
    packageName: notification.packageName
  });
  await applyVerifiedGooglePlaySubscription(userId, purchase);
  const recorded = await recordNotification({
    kind: "subscription",
    notificationType: subscriptionNotice.notificationType,
    matched: true,
    packageName: notification.packageName,
    status: purchase.status,
    currentPeriodEnd: purchase.currentPeriodEnd
  });
  if (!recorded.rows[0]) return { received: true, duplicate: true, matchedSubscription: true, status: purchase.status };
  return { received: true, duplicate: false, matchedSubscription: true, status: purchase.status };
}
