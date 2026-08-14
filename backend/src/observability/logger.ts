import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

type LogLevel = "info" | "warn" | "error";
type Metadata = Record<string, unknown>;

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|credential|private.?key|health|medical|image|photo|prompt|email|phone|full.?name|user.?id/i;
const UUID_IN_PATH = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function sanitize(value: unknown, key = "", depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (depth > 4) return "[TRUNCATED]";
  if (value instanceof Error) {
    const code = "code" in value ? String((value as Error & { code?: unknown }).code).replace(/[^a-zA-Z0-9_/-]/g, "_").slice(0, 80) : undefined;
    return { name: value.name, ...(code ? { code } : {}) };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, key, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([childKey, child]) => [childKey, sanitize(child, childKey, depth + 1)]));
  }
  if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}...[TRUNCATED]`;
  return value;
}

export function structuredLog(level: LogLevel, event: string, metadata: Metadata = {}) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(metadata) as Metadata
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export function requestContext(req: Request) {
  return {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl.split("?", 1)[0].replace(UUID_IN_PATH, ":id"),
    userId: req.user?.id ?? null
  };
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && /^[a-zA-Z0-9_-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    recordApiResult(res.statusCode, durationMs);
    structuredLog(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "api_request_completed", {
      ...requestContext(req),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10
    });
  });
  next();
}

const metrics = {
  requests: 0,
  errors4xx: 0,
  errors5xx: 0,
  totalLatencyMs: 0,
  maxLatencyMs: 0,
  externalFailures: {} as Record<string, number>,
  jobRuns: {} as Record<string, { success: number; failure: number; lastDurationMs: number | null }>
};

function recordApiResult(status: number, durationMs: number) {
  metrics.requests += 1;
  metrics.totalLatencyMs += durationMs;
  metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, durationMs);
  if (status >= 500) metrics.errors5xx += 1;
  else if (status >= 400) metrics.errors4xx += 1;
}

export function recordExternalFailure(provider: string, code: string) {
  const key = `${provider}:${code}`;
  metrics.externalFailures[key] = (metrics.externalFailures[key] ?? 0) + 1;
  structuredLog("warn", "external_provider_failure", { provider, code });
}

export function recordJobResult(job: string, success: boolean, durationMs: number) {
  const current = metrics.jobRuns[job] ?? { success: 0, failure: 0, lastDurationMs: null };
  current[success ? "success" : "failure"] += 1;
  current.lastDurationMs = durationMs;
  metrics.jobRuns[job] = current;
  structuredLog(success ? "info" : "error", "job_completed", { job, success, durationMs });
}

export function metricsSnapshot() {
  return {
    ...metrics,
    averageLatencyMs: metrics.requests ? Math.round((metrics.totalLatencyMs / metrics.requests) * 10) / 10 : 0,
    capturedAt: new Date().toISOString()
  };
}

export function installProcessErrorHandlers() {
  process.on("unhandledRejection", (reason) => {
    structuredLog("error", "process_unhandled_rejection", { reason });
    process.exitCode = 1;
  });
  process.on("uncaughtException", (error) => {
    structuredLog("error", "process_uncaught_exception", { error });
    process.exit(1);
  });
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
