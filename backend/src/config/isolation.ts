import crypto from "node:crypto";
import { env } from "./env";

const PRODUCTION_MARKERS = ["ascend-b2850", "getascend.fit"];

function containsProductionMarker(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  return PRODUCTION_MARKERS.some((marker) => normalized.includes(marker));
}

export function assertEnvironmentIsolation() {
  if (env.ASCEND_APP_ENV !== "staging") return;

  const violations: string[] = [];
  const databaseFingerprint = crypto.createHash("sha256").update(env.DATABASE_URL).digest("hex");
  if (!env.ASCEND_PRODUCTION_DATABASE_URL_SHA256) violations.push("ASCEND_PRODUCTION_DATABASE_URL_SHA256");
  if (env.ASCEND_PRODUCTION_DATABASE_URL_SHA256 === databaseFingerprint) violations.push("DATABASE_URL_PRODUCTION_MATCH");
  if (containsProductionMarker(env.DATABASE_URL)) violations.push("DATABASE_URL");
  if (!env.FIREBASE_PROJECT_ID) violations.push("FIREBASE_PROJECT_ID_MISSING");
  if (containsProductionMarker(env.FIREBASE_PROJECT_ID)) violations.push("FIREBASE_PROJECT_ID");
  if (env.AWS_S3_BUCKET && !env.ASCEND_PRODUCTION_R2_BUCKET) violations.push("ASCEND_PRODUCTION_R2_BUCKET");
  if (env.AWS_S3_BUCKET && env.AWS_S3_BUCKET === env.ASCEND_PRODUCTION_R2_BUCKET) violations.push("AWS_S3_BUCKET_PRODUCTION_MATCH");
  if (containsProductionMarker(env.AWS_S3_BUCKET)) violations.push("AWS_S3_BUCKET");
  if (containsProductionMarker(env.FRONTEND_URL)) violations.push("FRONTEND_URL");
  if (containsProductionMarker(env.CORS_ORIGIN)) violations.push("CORS_ORIGIN");
  if (env.ANALYTICS_ENVIRONMENT !== "staging") violations.push("ANALYTICS_ENVIRONMENT");
  if (env.MONITORING_ENVIRONMENT !== "staging") violations.push("MONITORING_ENVIRONMENT");
  if (env.EMAIL_DELIVERY_MODE === "live") violations.push("EMAIL_DELIVERY_MODE");
  if (env.PUSH_DELIVERY_MODE === "live") violations.push("PUSH_DELIVERY_MODE");
  if (env.SCHEDULED_JOBS_ENABLED) violations.push("SCHEDULED_JOBS_ENABLED");
  if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) violations.push("STRIPE_SECRET_KEY_LIVE");

  if (env.GOOGLE_PLAY_BILLING_ENABLED) {
    if (env.ASCEND_BILLING_CHANNEL !== "google_play") violations.push("ASCEND_BILLING_CHANNEL");
    if ((env.GOOGLE_PLAY_PACKAGE_NAME ?? "fit.getascend.app") !== "fit.getascend.app") violations.push("GOOGLE_PLAY_PACKAGE_NAME");
    if (env.GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID !== "ascend_premium_monthly") violations.push("GOOGLE_PLAY_PREMIUM_MONTHLY_PRODUCT_ID");
    if (env.GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID !== "ascend_premium_yearly") violations.push("GOOGLE_PLAY_PREMIUM_YEARLY_PRODUCT_ID");
    if (!env.GOOGLE_PLAY_TOKEN_ENCRYPTION_KEY) violations.push("GOOGLE_PLAY_TOKEN_ENCRYPTION_KEY");
    if (!env.GOOGLE_PLAY_ACCOUNT_OBFUSCATION_SECRET) violations.push("GOOGLE_PLAY_ACCOUNT_OBFUSCATION_SECRET");
  }

  if (violations.length) {
    throw new Error(`Staging isolation check failed for: ${violations.join(", ")}`);
  }
}
