import { Pool, QueryResultRow } from "pg";
import { env } from "../config/env";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) {
  const result = await pool.query<T>(sql, values);
  return result;
}
