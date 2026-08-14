import { createHash } from "crypto";
import { access, readdir, readFile } from "fs/promises";
import path from "path";
import { Pool, PoolClient } from "pg";
import { pool } from "./pool";
import { structuredLog } from "../observability/logger";

export const MIGRATION_ADVISORY_LOCK_ID = "728953219102025";

async function findMigrationsPath() {
  const candidates = [path.resolve(__dirname, "../../migrations"), path.resolve(__dirname, "../../../migrations")];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the source/Railpack location next.
    }
  }
  throw new Error("Database migrations directory was not found.");
}
export async function runMigrationsWithLock(client: Pick<PoolClient, "query">, migrationsPath: string) {
  await client.query("select pg_advisory_lock($1::bigint)", [MIGRATION_ADVISORY_LOCK_ID]);
  structuredLog("info", "migration_lock_acquired");
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now(),
        checksum text
      )
    `);
    await client.query("alter table schema_migrations add column if not exists checksum text");

    const existingBase = await client.query<{ exists: boolean }>("select to_regclass('public.users') is not null as exists");
    if (existingBase.rows[0]?.exists) {
      await client.query("insert into schema_migrations (filename) values ('001_init.sql') on conflict do nothing");
    }

    const files = (await readdir(migrationsPath)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
    for (const filename of files) {
      const sql = await readFile(path.join(migrationsPath, filename), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query<{ checksum: string | null }>("select checksum from schema_migrations where filename = $1", [filename]);
      if (applied.rowCount) {
        const recordedChecksum = applied.rows[0]?.checksum;
        if (recordedChecksum && recordedChecksum !== checksum) throw new Error(`Applied migration checksum changed: ${filename}`);
        if (!recordedChecksum) await client.query("update schema_migrations set checksum = $2 where filename = $1", [filename, checksum]);
        continue;
      }

      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into schema_migrations (filename, checksum) values ($1, $2)", [filename, checksum]);
        await client.query("commit");
        structuredLog("info", "migration_applied", { filename });
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1::bigint)", [MIGRATION_ADVISORY_LOCK_ID]).catch(() => undefined);
    structuredLog("info", "migration_lock_released");
  }
}

export async function migrateDatabase(databasePool: Pick<Pool, "connect"> = pool) {
  const migrationsPath = await findMigrationsPath();
  const client = await databasePool.connect();
  try {
    await runMigrationsWithLock(client, migrationsPath);
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrateDatabase()
    .then(async () => {
      structuredLog("info", "database_migration_complete");
      await pool.end();
    })
    .catch(async (error) => {
      structuredLog("error", "database_migration_failed", { error });
      await pool.end();
      process.exit(1);
    });
}
