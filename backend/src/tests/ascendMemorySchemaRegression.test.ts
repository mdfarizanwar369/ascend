import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../db/pool", () => ({ query }));
vi.mock("../config/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("../integrations/openai", () => ({ createAscendMemoryReflection: vi.fn() }));
vi.mock("../services/aiUsageService", () => ({ logAiUsage: vi.fn() }));
vi.mock("../services/bodyCompositionService", () => ({
  bodyCompositionScanFromDb: vi.fn(),
  buildBodyCompositionSummary: vi.fn()
}));

import { getAscendMemoryTimeline } from "../services/ascendMemoryService";

describe("Ascend Memory schema compatibility", () => {
  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalized.includes("from users u")) {
        return {
          rows: [{
            id: "user-1",
            full_name: "Test Member",
            email: "member@verification.invalid",
            goal_type: "fat_loss",
            starting_weight_kg: null,
            target_weight_kg: null,
            gym_id: null,
            athlete_mode_enabled: false,
            current_plan: "free",
            subscription_status: null,
            created_at: "2026-08-01T00:00:00.000Z"
          }]
        };
      }
      return { rows: [] };
    });
  });

  it("builds a timeline without querying the removed progress_photos.image_url column", async () => {
    const result = await getAscendMemoryTimeline("user-1");

    expect(result.timeline[0]).toMatchObject({ type: "started_journey", title: "Started Journey" });
    const progressQuery = query.mock.calls.find(([sql]) => String(sql).includes("from progress_photos"));
    expect(progressQuery).toBeDefined();
    expect(String(progressQuery?.[0]).replace(/\s+/g, " ")).toContain("select logged_at from progress_photos");
    expect(String(progressQuery?.[0])).not.toContain("image_url");
  });
});
