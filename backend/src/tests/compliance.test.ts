import { describe, expect, it } from "vitest";
import { calculateComplianceScore, isWeightTrendOffGoal } from "../domain/compliance";

describe("compliance score", () => {
  it("calculates a 0-100 weighted score", () => {
    const score = calculateComplianceScore({
      foodLogsToday: 2,
      weightLogsThisWeek: 2,
      waterMlToday: 1500,
      waterTargetMl: 2500,
      habitsCompletedToday: 1,
      habitsAssignedToday: 2
    });

    expect(score.totalScore).toBe(74);
  });

  it("detects goal-specific weight trend risk", () => {
    expect(isWeightTrendOffGoal("fat_loss", 80, 81)).toBe(true);
    expect(isWeightTrendOffGoal("muscle_gain", 80, 79)).toBe(true);
    expect(isWeightTrendOffGoal("maintenance", 80, 82)).toBe(true);
  });
});

