import { createHash } from "crypto";
import { query } from "../db/pool";

function redact(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .slice(0, 4_000);
}

export async function ensureClientErrorSchema() {
  await query(`
    create table if not exists client_error_reports (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid references users(id) on delete set null,
      route text not null,
      source text not null,
      error_name text not null,
      message text not null,
      stack text,
      fingerprint text not null,
      user_agent text,
      app_version text,
      created_at timestamptz not null default now()
    );
    create index if not exists client_error_reports_created_idx on client_error_reports(created_at desc);
    create index if not exists client_error_reports_fingerprint_idx on client_error_reports(fingerprint, created_at desc);
  `);
}

export async function saveClientError(input: {
  userId: string;
  route: string;
  source: string;
  errorName: string;
  message: string;
  stack?: string | null;
  userAgent?: string | null;
  appVersion?: string | null;
}) {
  const route = redact(input.route || "/unknown").slice(0, 300);
  const source = redact(input.source || "unknown").slice(0, 80);
  const errorName = redact(input.errorName || "Error").slice(0, 120);
  const message = redact(input.message || "Unknown client error");
  const stack = input.stack ? redact(input.stack) : null;
  const fingerprint = createHash("sha256").update(`${route}|${source}|${errorName}|${message}`).digest("hex");
  await query(
    `insert into client_error_reports (user_id, route, source, error_name, message, stack, fingerprint, user_agent, app_version)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [input.userId, route, source, errorName, message, stack, fingerprint, redact(input.userAgent ?? "").slice(0, 500) || null, redact(input.appVersion ?? "").slice(0, 80) || null]
  );
}
