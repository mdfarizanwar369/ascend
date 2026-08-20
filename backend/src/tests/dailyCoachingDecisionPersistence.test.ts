import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));
vi.mock("../db/pool", () => ({ query: queryMock }));

import {
  cleanupExpiredDailyCoachingDecisions,
  getDailyCoachingRolloutMetrics,
  resolveDailyCoachingDecision
} from "../services/dailyCoachingDecisionService";

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

  it("adds legacy isolation, cache observability, and device timezone storage", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/029_daily_coaching_decision_reliability.sql"), "utf8");
    expect(migration).toContain("legacy_refined");
    expect(migration).toContain("cache_hit_count");
    expect(migration).toContain("last_accessed_at");
    expect(migration).toContain("timezone_offset_minutes");
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

  it("returns bounded aggregate rollout metrics without member data", async () => {
    queryMock.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        decisions: 12,
        ai_attempts: 3,
        ai_selections: 2,
        capped: 1,
        cache_hits: 20,
        average_resolution_ms: 18,
        shadow_match_rate: "91.7"
      }]
    });
    await expect(getDailyCoachingRolloutMetrics(500)).resolves.toEqual({
      decisions: 12,
      aiAttempts: 3,
      aiSelections: 2,
      capped: 1,
      cacheHits: 20,
      averageResolutionMs: 18,
      shadowMatchRate: 91.7
    });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("legacy_matches"), [90]);
  });

  it("casts nullable legacy keys so PostgreSQL can resolve the insert parameter type", async () => {
    queryMock
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "decision-1" }] });

    await resolveDailyCoachingDecision({
      userId: "11111111-1111-4111-8111-111111111111",
      localDate: "2026-08-20",
      timezoneOffsetMinutes: -480,
      expiresAt: "2026-08-20T16:00:00.000Z",
      facts: {
        localHour: 14,
        mealsToday: 0,
        proteinTodayG: 0,
        proteinTargetG: 125,
        waterTodayMl: 1_500,
        waterTargetMl: 2_500,
        workoutCompletedToday: false,
        daysSinceWorkout: 1,
        stepsToday: 0,
        activeCaloriesToday: 0,
        sleepQuality: null
      },
      allowAiRefinement: false,
      legacyPriorityKey: null
    });

    const insertSql = String(queryMock.mock.calls.find(([sql]) => String(sql).includes("insert into daily_coaching_decisions"))?.[0]);
    expect(insertSql).toContain("$17::text is null");
    expect(insertSql).toContain("$8::text is not distinct from $17::text");
  });
});
