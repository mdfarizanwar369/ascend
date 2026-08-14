import { Router } from "express";
import { env } from "../config/env";
import { getReadiness } from "../services/readinessService";
import { metricsSnapshot } from "../observability/logger";
import { NextFunction, Request, Response } from "express";

export const healthRouter = Router();

export async function requireApplicationReady(_req: Request, res: Response, next: NextFunction) {
  const readiness = await getReadiness();
  if (!readiness.ready) {
    res.status(503).json({ error: "Service is starting. Please try again shortly.", code: "SERVICE_NOT_READY" });
    return;
  }
  next();
}

healthRouter.get("/health", (_req, res) => {
  void getReadiness().then((readiness) => {
    res.status(readiness.ready ? 200 : 503).json({ status: readiness.ready ? "ok" : "unavailable", service: "ascend-api", ...readiness });
  });
});

healthRouter.get("/health/live", (_req, res) => {
  res.json({ status: "ok", service: "ascend-api" });
});

healthRouter.get("/health/ready", async (_req, res) => {
  const readiness = await getReadiness();
  res.status(readiness.ready ? 200 : 503).json({ status: readiness.ready ? "ok" : "unavailable", service: "ascend-api", ...readiness });
});

healthRouter.get("/health/metrics", (req, res) => {
  if (!env.CRON_SECRET || req.header("x-observability-secret") !== env.CRON_SECRET) return res.status(404).json({ error: "Not found" });
  res.json(metricsSnapshot());
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
