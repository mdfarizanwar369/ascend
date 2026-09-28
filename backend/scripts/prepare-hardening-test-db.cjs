// Test fixtures only. This refuses remote hosts and any other database name.
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const path = require('node:path');
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/ascend_hardening_test') throw new Error('Isolated test database required');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const exists = await client.query("select 1 from pg_roles where rolname='ascend_app_runtime'");
    if (!exists.rowCount) await client.query("create role ascend_app_runtime login password 'local-test-fixture' nosuperuser nocreatedb nocreaterole noreplication nobypassrls");
    await client.query(readFileSync(path.join(__dirname, 'runtime-role-grants.sql'), 'utf8'));
  } finally { await client.end(); }
}
main().catch(() => { console.error('Isolated runtime role preparation failed'); process.exitCode = 1; });
