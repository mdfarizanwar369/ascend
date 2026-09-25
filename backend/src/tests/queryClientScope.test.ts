import { beforeEach, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";

const { pooled } = vi.hoisted(() => ({ pooled: vi.fn(async () => ({ rows: ["pool"] })) }));
vi.mock("pg", () => ({ Pool: class { query = pooled; } }));
import { query, withQueryClient } from "../db/pool";

beforeEach(() => vi.clearAllMocks());

it("isolates simultaneous transactions and keeps nested reads on their existing connections", async () => {
  const a = { query: vi.fn(async () => ({ rows: ["a"] })) } as unknown as PoolClient;
  const b = { query: vi.fn(async () => ({ rows: ["b"] })) } as unknown as PoolClient;
  const result = await Promise.all([a, b].map(client => withQueryClient(client, async () => {
    await Promise.resolve();
    return Promise.all([query("select 1"), query("select 2")]);
  })));
  expect(result.map(rows => rows.map(row => row.rows))).toEqual([[["a"], ["a"]], [["b"], ["b"]]]);
  expect(pooled).not.toHaveBeenCalled();
  expect((await query("select 3")).rows).toEqual(["pool"]);
});

it("restores normal pool queries after a scoped operation fails", async () => {
  const client = { query: vi.fn().mockRejectedValue(new Error("query failed")) } as unknown as PoolClient;
  await expect(withQueryClient(client, () => query("select 1"))).rejects.toThrow("query failed");
  expect((await query("select 2")).rows).toEqual(["pool"]);
});
