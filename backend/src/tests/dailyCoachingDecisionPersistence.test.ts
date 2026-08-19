import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("../db/pool", () => ({ query: queryMock }));

import { cleanupExpiredDailyCoachingDecisions } from "../services/dailyCoachingDecisionService";

describe("daily coaching decision persistence", () => {
  beforeEach(() => queryMock.mockReset());

  it("records refinement provenance and shadow comparison metadata", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/028_daily_coaching_decision_hardening.sql"), "utf8");
    expect(migration).toContain("refinement_status");
    expect(migration).toContain("ai_provider");
    expect(migration).toContain("ai_model");
    expect(migration).toContain("prompt_version");
    expect(migration).toContain("resolution_duration_ms");
    expect(migration).toContain("legacy_matches");
  });

  it("removes expired snapshots after the bounded retention window", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 7, rows: [] });
    await expect(cleanupExpiredDailyCoachingDecisions()).resolves.toBe(7);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("delete from daily_coaching_decisions"), [90]);
  });

  it("bounds a caller-provided retention period", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await cleanupExpiredDailyCoachingDecisions(10_000);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [365]);
  });
});
