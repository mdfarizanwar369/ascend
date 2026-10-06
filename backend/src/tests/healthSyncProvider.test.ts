import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../db/pool", () => ({ query: db.query, pool: { connect: vi.fn() } }));

import { disconnectHealthSync, getHealthSyncSummary, getHealthSyncStatus } from "../services/healthSyncService";

beforeEach(() => db.query.mockReset());

it("uses the connected provider for every Health summary category", async () => {
  db.query
    .mockResolvedValueOnce({ rows: [{ provider: "apple_health", status: "connected", device_timezone: "Asia/Singapore", last_synced_at: null }] })
    .mockResolvedValueOnce({ rows: [{ local_today: "2026-10-06" }] })
    .mockResolvedValueOnce({ rows: [{ today_steps: "4500", average_steps_7d: "3500", today_active_calories: "240", workouts_this_week: "2", workout_completed_today: true, latest_workout_at: null }] });
  const summary = await getHealthSyncSummary("member-id");
  expect(summary?.todaySteps).toBe(4500);
  expect(summary?.workoutsThisWeek).toBe(2);
  const [sql, parameters] = db.query.mock.calls[2];
  expect(parameters).toEqual(["member-id", "2026-10-06", "apple_health"]);
  expect((sql.match(/hsr\.provider = \$3/g) ?? [])).toHaveLength(4);
});

it("reports the actual provider even after disconnect", async () => {
  db.query.mockResolvedValueOnce({ rows: [{ provider: "apple_health", status: "disconnected", last_synced_at: null }] });
  const status = await getHealthSyncStatus("member-id");
  expect(status.provider).toBe("apple_health");
  expect(status.connected).toBe(false);
});

it("keeps the existing provider when disconnecting", async () => {
  db.query.mockResolvedValueOnce({ rows: [] });
  await disconnectHealthSync("member-id");
  expect(db.query.mock.calls[0][0]).toContain("select provider from health_sync_connections");
});
