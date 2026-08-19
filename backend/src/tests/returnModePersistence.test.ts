import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect, poolQuery } = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn()
}));

vi.mock("../db/pool", () => ({
  pool: { connect, query: poolQuery }
}));

import { claimReturnMode, recordReturnModeContinued } from "../services/returnModeService";

const eligibleProfile = {
  id: "user-1",
  full_name: "Fariz Anwar",
  status: "active",
  goal_type: "fat_loss",
  starting_weight_kg: "74",
  last_meaningful_activity_at: "2026-08-10T12:00:00.000Z",
  return_mode_last_shown_at: null,
  return_mode_shown_for_activity_at: null
};

describe("Return Mode persistence", () => {
  beforeEach(() => {
    connect.mockReset();
    poolQuery.mockReset();
  });

  it("claims and records the exact current inactivity episode atomically", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [eligibleProfile] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    connect.mockResolvedValue({ query, release });

    await expect(claimReturnMode({
      userId: "user-1",
      primaryRole: "client",
      roles: ["client"],
      now: new Date("2026-08-19T12:00:00.000Z")
    })).resolves.toMatchObject({ claimed: true, fullName: "Fariz Anwar" });

    expect(query.mock.calls[1][0]).toContain("for update");
    expect(query.mock.calls[2][0]).toContain("return_mode_shown_for_activity_at = last_meaningful_activity_at");
    expect(query.mock.calls[3][0]).toContain("return_mode_viewed");
    expect(query.mock.calls[4][0]).toBe("commit");
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not claim an episode already shown on repeated app opens", async () => {
    const shownProfile = {
      ...eligibleProfile,
      return_mode_last_shown_at: "2026-08-16T12:00:00.000Z",
      return_mode_shown_for_activity_at: eligibleProfile.last_meaningful_activity_at
    };
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [shownProfile] })
      .mockResolvedValueOnce({ rows: [] });
    connect.mockResolvedValue({ query, release: vi.fn() });

    await expect(claimReturnMode({
      userId: "user-1",
      primaryRole: "client",
      roles: ["client"],
      now: new Date("2026-08-19T12:00:00.000Z")
    })).resolves.toEqual({ claimed: false });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).toBe("commit");
  });

  it("records a privacy-safe continued event without changing activity state", async () => {
    poolQuery
      .mockResolvedValueOnce({ rows: [{ inactivity_bucket: "5_13_days" }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(recordReturnModeContinued("user-1")).resolves.toEqual({ recorded: true });

    expect(poolQuery.mock.calls[1][0]).toContain("return_mode_continued");
    expect(poolQuery.mock.calls[1][0]).toContain("where not exists");
    expect(poolQuery.mock.calls[1][0]).not.toContain("last_meaningful_activity_at =");
    expect(String(poolQuery.mock.calls[1][1][1])).not.toContain("Fariz");
  });

  it("updates activity only from successful authoritative writes", () => {
    const migration = readFileSync(resolve(process.cwd(), "migrations/026_return_mode_v1.sql"), "utf8");
    for (const table of [
      "food_logs",
      "weight_logs",
      "water_logs",
      "progress_photos",
      "habit_logs",
      "analytics_events",
      "recovery_checkins",
      "athlete_readiness_checkins",
      "athlete_target_progress",
      "body_composition_scans",
      "trainer_missions"
    ]) {
      expect(migration).toContain(` on ${table}`);
    }
    expect(migration).toContain("after insert on food_logs");
    expect(migration).toContain("new_row->>'user_confirmed'");
    expect(migration).toContain("new_row->>'event_name' <> 'burn_log'");
    expect(migration).toContain("set last_meaningful_activity_at = greatest");
    expect(migration).not.toContain("health_sync_records");
  });
});
