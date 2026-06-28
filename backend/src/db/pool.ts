import { Pool, QueryResultRow } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  const startedAt = Date.now();
  const result = await pool.query<T>(sql, values);
  if (process.env.PERF_DB_QUERY_LOGS === "1") {
    const durationMs = Date.now() - startedAt;
    console.info("[db-query]", {
      durationMs,
      rows: result.rowCount,
      sql: sql.replace(/\s+/g, " ").trim().slice(0, 200)
    });
  }
  return result;
}
