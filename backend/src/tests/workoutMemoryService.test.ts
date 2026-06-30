import { describe, expect, it } from "vitest";
import { buildWorkoutMemorySummary } from "../services/workoutMemoryService";

describe("Workout memory service", () => {
  it("builds a same-day recovery recommendation from the latest completed workout", () => {
    const summary = buildWorkoutMemorySummary(
      [
        {
          created_at: "2026-06-30T09:15:00+08:00",
          metadata: {
            workoutTitle: "Outdoor Mobility Flow",
            workoutType: "Mobility",
            durationMinutes: 40,
            estimatedCaloriesBurned: 220,
            workoutDifficultyLabel: "Easy",
            momentumEarned: 8
          }
        }
      ],
      { currentMomentum: 53, now: new Date("2026-06-30T18:00:00+08:00") }
    );

    expect(summary.latestWorkout?.completedToday).toBe(true);
    expect(summary.recommendation).toContain("Recovery");
    expect(summary.coachSummary.lastWorkout).toBe("Outdoor Mobility Flow");
    expect(summary.coachSummary.momentum).toBe(53);
  });

  it("guides upper body after a lower-body session yesterday", () => {
    const summary = buildWorkoutMemorySummary(
      [
        {
          created_at: "2026-06-29T19:00:00+08:00",
          metadata: {
            workoutTitle: "Leg Strength Builder",
            workoutType: "Strength",
            durationMinutes: 45
          }
        }
      ],
      { now: new Date("2026-06-30T10:00:00+08:00") }
    );

    expect(summary.latestWorkout?.completedYesterday).toBe(true);
    expect(summary.recommendation).toContain("Upper body");
    expect(summary.continuityNote).toContain("lower body");
  });
});
