import { Router } from "express";
import { env } from "../config/env";
import { query } from "../db/pool";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ascend-api" });
});

healthRouter.get("/health/ready", async (_req, res) => {
  try {
    await query("select 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
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
