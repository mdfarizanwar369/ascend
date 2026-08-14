import { Pool, QueryResultRow } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
  statement_timeout: env.DB_STATEMENT_TIMEOUT_MS,
  query_timeout: env.DB_STATEMENT_TIMEOUT_MS
});

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  const startedAt = Date.now();
  const result = await pool.query<T>(sql, values);
  if (env.NODE_ENV !== "production" && process.env.PERF_DB_QUERY_LOGS === "1") {
    const durationMs = Date.now() - startedAt;
    console.info("[db-query]", {
      durationMs,
      rows: result.rowCount,
      sql: sql.replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }
  return result;
}
