import { describe, expect, it } from "vitest";
import { buildWeeklySummary, calculateReadiness, calculateTargetCompliance, eventCountdown } from "../services/athleteService";

describe("Athlete Mode calculations", () => {
  it("marks a recovered athlete green", () => {
    expect(calculateReadiness({ sleepHours: 8, energy: 8, soreness: 2, stress: 2, hunger: 5, motivation: 9 })).toEqual({
      score: 91,
      band: "green"
    });
  });

  it("marks a depleted athlete red", () => {
    const result = calculateReadiness({ sleepHours: 3, energy: 2, soreness: 9, stress: 9, hunger: 10, motivation: 2 });
    expect(result.score).toBeLessThan(45);
    expect(result.band).toBe("red");
  });

  it("caps completed targets at 100 percent", () => {
    expect(calculateTargetCompliance([
      { targetValue: 3, completedValue: 4 },
      { targetValue: 10000, completedValue: 5000 }
    ])).toBe(75);
  });

  it("calculates an event countdown without local timezone drift", () => {
    expect(eventCountdown("2026-07-18", new Date("2026-06-20T15:00:00Z"))).toEqual({ days: 28, weeks: 4, milestone: "4 weeks out" });
  });

  it("builds a deterministic weekly summary", () => {
    expect(buildWeeklySummary({ readinessAverage: 72, compliancePercent: 82, checkinsCompleted: 6 }))
      .toContain("Training targets were followed consistently");
  });
});
