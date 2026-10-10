import { describe, expect, it, vi } from "vitest";

vi.mock("../services/todayPriorityContextService", () => ({ loadTodayPriorityFacts: vi.fn() }));
vi.mock("../services/voiceTodayService", () => ({ getVoiceTodayData: vi.fn() }));
import { buildWidgetTodaySnapshot } from "../services/widgetTodayService";

describe("Ascend Today widget snapshot", () => {
  it("returns bounded daily metrics and preserves the current priority", () => {
    expect(buildWidgetTodaySnapshot({
      localDate: "2026-10-10",
      generatedAt: "2026-10-10T08:00:00.000Z",
      totals: { calories: 1229.6, waterMl: 1400.4 },
      targets: { calories: 1870, waterMl: 2500 },
      movement: { steps: 4321.4, workoutCompleted: false },
      recovery: { sleepQuality: "good" },
      priority: { key: "Water", title: "Keep sipping through the day", href: "/water-log", cta: "Log Water" }
    })).toEqual({
      schemaVersion: 1,
      localDate: "2026-10-10",
      generatedAt: "2026-10-10T08:00:00.000Z",
      calories: { logged: 1230, target: 1870, remaining: 640 },
      water: { loggedMl: 1400, targetMl: 2500, remainingMl: 1100 },
      movement: { steps: 4321, workoutCompleted: false },
      recovery: { sleepQuality: "good" },
      priority: { key: "Water", title: "Keep sipping through the day", href: "/water-log", cta: "Log Water" }
    });
  });

  it("never presents negative remaining or logged values", () => {
    const snapshot = buildWidgetTodaySnapshot({
      localDate: "2026-10-10",
      generatedAt: "2026-10-10T08:00:00.000Z",
      totals: { calories: 2200, waterMl: -50 },
      targets: { calories: 1800, waterMl: 2000 },
      movement: { steps: -20, workoutCompleted: true },
      recovery: { sleepQuality: null },
      priority: { key: null, title: "Protect your progress", href: "/progress", cta: "View Progress" }
    });
    expect(snapshot.calories.remaining).toBe(0);
    expect(snapshot.water.loggedMl).toBe(0);
    expect(snapshot.movement.steps).toBe(0);
  });
});
