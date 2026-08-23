import { describe, expect, it } from "vitest";
import { workoutDebriefAccessFor, workoutDebriefTierFor } from "../services/workoutDebriefAccessService";

describe("workout debrief public access", () => {
  it("maps Free, Premium, Athlete, and internal roles without trusting the client", () => {
    const base = { primaryRole: "client" as const, roles: ["client" as const], isPlatformOwner: false };
    expect(workoutDebriefTierFor({ ...base, activePlan: "free", athleteEnabled: false })).toBe("free");
    expect(workoutDebriefTierFor({ ...base, activePlan: "premium", athleteEnabled: false })).toBe("premium");
    expect(workoutDebriefTierFor({ ...base, activePlan: "premium", athleteEnabled: true })).toBe("athlete");
    expect(workoutDebriefTierFor({ ...base, activePlan: "free", athleteEnabled: false, isPlatformOwner: true })).toBe("athlete");
    expect(workoutDebriefTierFor({ activePlan: "free", athleteEnabled: false, primaryRole: "trainer", roles: ["trainer"], isPlatformOwner: false })).toBe("premium");
  });

  it("gives Free one deliberately selected review per rolling week", () => {
    expect(workoutDebriefAccessFor({ tier: "free", dailyUsed: 0, weeklyUsed: 0, oldestWeeklyGeneration: null })).toMatchObject({
      mode: "select_one",
      canGenerate: true,
      weeklyLimit: 1,
      weeklyRemaining: 1
    });
    expect(workoutDebriefAccessFor({ tier: "free", dailyUsed: 1, weeklyUsed: 1, oldestWeeklyGeneration: "2026-08-20T00:00:00.000Z" })).toMatchObject({
      canGenerate: false,
      weeklyRemaining: 0,
      nextWeeklyReviewAt: "2026-08-27T00:00:00.000Z"
    });
  });

  it("enforces Premium at two per day or ten per week", () => {
    expect(workoutDebriefAccessFor({ tier: "premium", dailyUsed: 1, weeklyUsed: 9, oldestWeeklyGeneration: null }).canGenerate).toBe(true);
    expect(workoutDebriefAccessFor({ tier: "premium", dailyUsed: 2, weeklyUsed: 2, oldestWeeklyGeneration: null }).canGenerate).toBe(false);
    expect(workoutDebriefAccessFor({ tier: "premium", dailyUsed: 0, weeklyUsed: 10, oldestWeeklyGeneration: null }).canGenerate).toBe(false);
  });

  it("enforces Athlete at three per day or twenty per week", () => {
    expect(workoutDebriefAccessFor({ tier: "athlete", dailyUsed: 2, weeklyUsed: 19, oldestWeeklyGeneration: null }).canGenerate).toBe(true);
    expect(workoutDebriefAccessFor({ tier: "athlete", dailyUsed: 3, weeklyUsed: 3, oldestWeeklyGeneration: null }).canGenerate).toBe(false);
    expect(workoutDebriefAccessFor({ tier: "athlete", dailyUsed: 0, weeklyUsed: 20, oldestWeeklyGeneration: null }).canGenerate).toBe(false);
  });
});
