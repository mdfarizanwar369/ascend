import { readFile } from "fs/promises";
import path from "path";
import { pool } from "./pool";

async function migrate() {
  const migrationPath =
    __dirname.includes(`${path.sep}dist${path.sep}`)
      ? path.resolve(__dirname, "../../migrations/001_init.sql")
      : path.resolve(__dirname, "../../migrations/001_init.sql");
  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
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
