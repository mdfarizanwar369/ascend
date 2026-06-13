import { Router } from "express";
import { env } from "../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ascend-api" });
});

function storageHealth() {
  return {
    status: "ok",
    storageConfigured: Boolean(env.AWS_S3_BUCKET && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
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
