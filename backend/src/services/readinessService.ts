import { query } from "../db/pool";

let applicationInitialized = false;
let cachedReadiness: Awaited<ReturnType<typeof checkReadiness>> | null = null;
let cachedAt = 0;

export function markApplicationReady() {
  applicationInitialized = true;
  cachedReadiness = null;
}

export function markApplicationNotReady() {
  applicationInitialized = false;
  cachedReadiness = null;
}

async function checkReadiness() {
  try {
    const result = await query<{
      database_available: boolean;
      users_table: string | null;
      migrations_table: string | null;
      media_uploads_table: string | null;
      latest_migration: string | null;
    }>(
      `
      select
        true as database_available,
        to_regclass('public.users')::text as users_table,
        to_regclass('public.schema_migrations')::text as migrations_table,
        to_regclass('public.media_uploads')::text as media_uploads_table,
        (select max(filename) from schema_migrations) as latest_migration
      `
    );
    const state = result.rows[0];
    const ready = Boolean(state?.users_table && state?.migrations_table && state?.media_uploads_table && state.latest_migration === "026_product_analytics_idempotency.sql");
    return { ready, reason: ready ? null : "schema_not_ready" as const, latestMigration: state?.latest_migration ?? null };
  } catch {
    return { ready: false, reason: "database_unavailable" as const };
  }
}

export async function getReadiness(options: { fresh?: boolean } = {}) {
  if (!applicationInitialized) return { ready: false, reason: "initializing" as const };
  if (!options.fresh && cachedReadiness && Date.now() - cachedAt < 5_000) return cachedReadiness;
  cachedReadiness = await checkReadiness();
  cachedAt = Date.now();
  return cachedReadiness;
}
