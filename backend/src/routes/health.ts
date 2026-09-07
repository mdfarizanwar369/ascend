import { Router } from "express";
import { env } from "../config/env";
import { query } from "../db/pool";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ascend-api" });
});

export async function databaseReadiness(check: () => Promise<unknown> = () => query("select 1")) {
  try {
    await check();
    return { ready: true as const, status: 200 as const };
  } catch {
    return { ready: false as const, status: 503 as const };
  }
}

healthRouter.get("/ready", async (_req, res) => {
  const readiness = await databaseReadiness();
  res.status(readiness.status).json({
    status: readiness.ready ? "ready" : "not_ready",
    service: "ascend-api",
    database: readiness.ready ? "ready" : "unavailable"
  });
});

function storageHealth() {
  const storageConfigured = Boolean(env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
  if (env.NODE_ENV === "production") {
    return { status: "ok", storageConfigured };
  }

  return {
    status: "ok",
    storageConfigured,
    hasBucket: Boolean(env.AWS_S3_BUCKET),
    hasAccessKey: Boolean(env.AWS_ACCESS_KEY_ID),
    hasSecretKey: Boolean(env.AWS_SECRET_ACCESS_KEY),
    hasEndpoint: Boolean(env.AWS_S3_ENDPOINT),
    region: env.AWS_REGION,
    bucketNamePreview: env.AWS_S3_BUCKET ? `${env.AWS_S3_BUCKET.slice(0, 3)}...${env.AWS_S3_BUCKET.slice(-3)}` : null,
    endpointPreview: env.AWS_S3_ENDPOINT ? env.AWS_S3_ENDPOINT.replace(/^https?:\/\//, "").split(".").slice(-3).join(".") : null
  };
}

healthRouter.get("/health/storage", (_req, res) => {
  res.json(storageHealth());
});

healthRouter.get("/storage/health", (_req, res) => {
  res.json({
    ...storageHealth(),
    preferredPath: "/api/v1/health/storage"
  });
});
