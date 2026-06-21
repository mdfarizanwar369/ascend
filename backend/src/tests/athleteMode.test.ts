import { describe, expect, it } from "vitest";
import { buildWeeklySummary, calculateReadiness, calculateTargetCompliance, eventCountdown, localDateKey, readinessPatterns } from "../services/athleteService";

describe("Athlete Mode calculations", () => {
  it("marks a recovered athlete green", () => {
    expect(calculateReadiness({ sleepHours: 8, energy: 8, soreness: 2, stress: 2, hunger: 5, motivation: 9 })).toEqual({
      score: 91,
      band: "green",
      warningReasons: []
    });
  });

  it("overrides a high average when severe soreness is reported", () => {
    const result = calculateReadiness({ sleepHours: 8, energy: 8, soreness: 10, stress: 1, hunger: 5, motivation: 8 });
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.band).toBe("red");
    expect(result.warningReasons).toContain("Severe soreness reported");
  });

  it("finds historical warning patterns and trend direction", () => {
    expect(readinessPatterns({
      today: "2026-06-21",
      checkins: [
        { checkinDate: "2026-06-18", sleepHours: 4, score: 62 },
        { checkinDate: "2026-06-17", sleepHours: 4.5, score: 70 }
      ]
    })).toEqual({ reasons: ["Low sleep for 2 nights", "No readiness check-in for 3 days"], direction: "declining" });
  });

  it("flags rapid weight movement across a real multi-day window", () => {
    expect(readinessPatterns({
      today: "2026-06-21",
      checkins: [{ checkinDate: "2026-06-21", sleepHours: 8, score: 75 }],
      weights: [
        { loggedAt: "2026-06-14T08:00:00Z", weightKg: 80 },
        { loggedAt: "2026-06-21T08:00:00Z", weightKg: 78.5 }
      ]
    }).reasons).toContain("Rapid weight change detected");
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
    expect(localDateKey(new Date("2026-06-20T16:30:00Z"), "Asia/Singapore")).toBe("2026-06-21");
  });

  it("builds a deterministic weekly summary", () => {
    expect(buildWeeklySummary({ readinessAverage: 72, compliancePercent: 82, checkinsCompleted: 6 }))
      .toContain("Training targets were followed consistently");
  });

  it("does not judge compliance when a coach assigned no targets", () => {
    expect(buildWeeklySummary({ readinessAverage: null, compliancePercent: 0, checkinsCompleted: 0, targetCount: 0 }))
      .toContain("No training targets were assigned");
  });
});
