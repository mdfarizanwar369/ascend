import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

describe("staging isolation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ASCEND_APP_ENV", "staging");
    vi.stubEnv("DATABASE_URL", "postgres://staging:staging@staging-db.internal:5432/ascend_staging");
    vi.stubEnv("ASCEND_PRODUCTION_DATABASE_URL_SHA256", fingerprint("postgres://production-host/ascend"));
    vi.stubEnv("FIREBASE_PROJECT_ID", "ascend-play-staging");
    vi.stubEnv("FRONTEND_URL", "https://ascend-play-staging.example.test");
    vi.stubEnv("CORS_ORIGIN", "https://ascend-play-staging.example.test");
    vi.stubEnv("ANALYTICS_ENVIRONMENT", "staging");
    vi.stubEnv("MONITORING_ENVIRONMENT", "staging");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "capture");
    vi.stubEnv("PUSH_DELIVERY_MODE", "disabled");
    vi.stubEnv("SCHEDULED_JOBS_ENABLED", "false");
    vi.stubEnv("GOOGLE_PLAY_BILLING_ENABLED", "false");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts an explicitly isolated staging environment", async () => {
    const { assertEnvironmentIsolation } = await import("../config/isolation");
    expect(() => assertEnvironmentIsolation()).not.toThrow();
  });

  it("rejects the exact production database even when its hostname is opaque", async () => {
    const databaseUrl = "postgres://staging:staging@staging-db.internal:5432/ascend_staging";
    vi.stubEnv("ASCEND_PRODUCTION_DATABASE_URL_SHA256", fingerprint(databaseUrl));
    vi.resetModules();
    const { assertEnvironmentIsolation } = await import("../config/isolation");
    expect(() => assertEnvironmentIsolation()).toThrow("DATABASE_URL_PRODUCTION_MATCH");
  });

  it("rejects live Stripe credentials in staging", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_never_allowed_in_staging");
    vi.resetModules();
    const { assertEnvironmentIsolation } = await import("../config/isolation");
    expect(() => assertEnvironmentIsolation()).toThrow("STRIPE_SECRET_KEY_LIVE");
  });
});
