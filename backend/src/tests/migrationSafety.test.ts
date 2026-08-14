import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATION_ADVISORY_LOCK_ID, runMigrationsWithLock } from "../db/migrate";

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});
describe("migration coordination", () => {
  it("holds one database advisory lock around migration discovery and application", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ascend-migrations-"));
    createdDirectories.push(directory);
    await writeFile(path.join(directory, "001_test.sql"), "create table test_table(id integer);");
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      async query(sql: string, values?: unknown[]) {
        calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
        if (/to_regclass/.test(sql)) return { rows: [{ exists: false }], rowCount: 1 };
        if (/select checksum/.test(sql)) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 0 };
      }
    };

    await runMigrationsWithLock(client as never, directory);

    expect(calls[0]).toEqual({ sql: "select pg_advisory_lock($1::bigint)", values: [MIGRATION_ADVISORY_LOCK_ID] });
    expect(calls.at(-1)).toEqual({ sql: "select pg_advisory_unlock($1::bigint)", values: [MIGRATION_ADVISORY_LOCK_ID] });
    expect(calls.findIndex((call) => call.sql === "begin")).toBeGreaterThan(0);
    expect(calls.some((call) => call.sql === "create table test_table(id integer);")).toBe(true);
    expect(calls.some((call) => call.sql === "commit")).toBe(true);
  });

  it("releases the advisory lock when a migration fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ascend-migrations-"));
    createdDirectories.push(directory);
    await writeFile(path.join(directory, "001_test.sql"), "broken migration;");
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(normalized);
        if (/to_regclass/.test(sql)) return { rows: [{ exists: false }], rowCount: 1 };
        if (/select checksum/.test(sql)) return { rows: [], rowCount: 0 };
        if (normalized === "broken migration;") throw new Error("injected migration failure");
        return { rows: [], rowCount: 0 };
      }
    };

    await expect(runMigrationsWithLock(client as never, directory)).rejects.toThrow("injected migration failure");
    expect(calls).toContain("rollback");
    expect(calls.at(-1)).toBe("select pg_advisory_unlock($1::bigint)");
  });
});
