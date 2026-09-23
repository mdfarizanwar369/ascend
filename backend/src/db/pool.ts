import { Pool, PoolClient, QueryResultRow } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

const queryClients = new AsyncLocalStorage<PoolClient>();

// Reuse an explicitly scoped transaction for nested service queries.
export function withQueryClient<T>(client: PoolClient, work: () => Promise<T>) {
  return queryClients.run(client, work);
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  const startedAt = Date.now();
  const result = await (queryClients.getStore() ?? pool).query<T>(sql, values);
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
