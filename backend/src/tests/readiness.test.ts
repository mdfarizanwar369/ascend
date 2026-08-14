import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbQuery } = vi.hoisted(() => ({ dbQuery: vi.fn() }));
vi.mock("../db/pool", () => ({ query: dbQuery }));

import { getReadiness, markApplicationNotReady, markApplicationReady } from "../services/readinessService";

describe("application readiness", () => {
  beforeEach(() => {
    dbQuery.mockReset();
    markApplicationNotReady();
  });

  it("stays unhealthy before initialization", async () => {
    await expect(getReadiness({ fresh: true })).resolves.toEqual({ ready: false, reason: "initializing" });
    expect(dbQuery).not.toHaveBeenCalled();
  });

  it("requires the latest schema before becoming ready", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ users_table: "users", migrations_table: "schema_migrations", media_uploads_table: null, latest_migration: "024.sql" }] });
    markApplicationReady();
    await expect(getReadiness({ fresh: true })).resolves.toMatchObject({ ready: false, reason: "schema_not_ready" });
  });

  it("reports ready only when database and required migration are present", async () => {
    dbQuery.mockResolvedValueOnce({ rows: [{ users_table: "users", migrations_table: "schema_migrations", media_uploads_table: "media_uploads", latest_migration: "025_production_remediation_sprint_1.sql" }] });
    markApplicationReady();
    await expect(getReadiness({ fresh: true })).resolves.toMatchObject({ ready: true, reason: null });
  });
});
