import { access, readdir, readFile } from "fs/promises";
import path from "path";
import { pool } from "./pool";

async function migrate() {
  const candidates = [path.resolve(__dirname, "../../migrations"), path.resolve(__dirname, "../../../migrations")];
  let migrationsPath = candidates[0];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      migrationsPath = candidate;
      break;
    } catch {
      // Try the source/Railpack location next.
    }
  }
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const existingBase = await pool.query<{ exists: boolean }>("select to_regclass('public.users') is not null as exists");
  if (existingBase.rows[0]?.exists) {
    await pool.query("insert into schema_migrations (filename) values ('001_init.sql') on conflict do nothing");
  }

  const files = (await readdir(migrationsPath)).filter((file) => /^\d+.*\.sql$/.test(file)).sort();
  for (const filename of files) {
    const applied = await pool.query("select 1 from schema_migrations where filename = $1", [filename]);
    if (applied.rowCount) continue;

    const sql = await readFile(path.join(migrationsPath, filename), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.log("Database migration complete");
}

if (require.main === module) {
  migrate().catch(async (error) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
}
