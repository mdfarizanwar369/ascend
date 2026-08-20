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

  it("classifies a post-midnight Singapore workout as today", () => {
    const summary = buildWorkoutMemorySummary([
      {
        created_at: "2026-08-20T16:15:00.000Z",
        metadata: { workoutTitle: "Evening Walk", workoutType: "Cardio" }
      }
    ], {
      now: new Date("2026-08-20T17:00:00.000Z"),
      timezoneOffsetMinutes: -480
    });

    expect(summary.latestWorkout?.completionDate).toBe("2026-08-21");
    expect(summary.latestWorkout?.completedToday).toBe(true);
  });

  it("exposes compact verified progression to Coach Zoe memory", () => {
    const summary = buildWorkoutMemorySummary([
      {
        created_at: "2026-06-30T09:15:00+08:00",
        metadata: {
          workoutTitle: "Upper Body Strength",
          workoutType: "Strength",
          progression: {
            version: "workout_progression_v1",
            evidenceType: "observed_performance",
            overallStatus: "progressed",
            headline: "1 verified progression from your earlier workouts.",
            highlights: ["Bench Press moved from 50kg to 55kg with comparable completed reps."],
            changesToReview: [],
            comparisons: [],
            confidence: 0.95
          }
        }
      }
    ], { now: new Date("2026-06-30T18:00:00+08:00") });

    expect(summary.latestVerifiedProgression).toMatchObject({
      workoutName: "Upper Body Strength",
      status: "progressed"
    });
    expect(summary.coachSummary.latestProgression).toContain("50kg to 55kg");
  });

  it("ignores malformed or unverified progression metadata", () => {
    const summary = buildWorkoutMemorySummary([
      {
        created_at: "2026-06-30T09:15:00+08:00",
        metadata: {
          workoutTitle: "Simple Walk",
          progression: { version: "unknown", headline: "Invented progress", highlights: [] }
        }
      }
    ], { now: new Date("2026-06-30T18:00:00+08:00") });

    expect(summary.latestVerifiedProgression).toBeNull();
    expect(summary.coachSummary.latestProgression).toBeNull();
  });

  it("prefers compact V3 progression facts for Coach Zoe", () => {
    const summary = buildWorkoutMemorySummary([{
      created_at: "2026-06-30T09:15:00+08:00",
      metadata: {
        workoutTitle: "Upper Body Strength",
        progressionV3: {
          version: "workout_progression_v3",
          evidenceType: "observed_performance",
          overallStatus: "personal_best",
          headline: "1 verified personal best.",
          achievements: ["Bench Press: new verified load best at 60kg."],
          reviewNotes: [],
          nextSessionFocus: "Start with 60kg again.",
          exerciseInsights: [],
          confidence: 0.95
        }
      }
    }], { now: new Date("2026-06-30T18:00:00+08:00") });
    expect(summary.latestProgressionIntelligence?.status).toBe("personal_best");
    expect(summary.coachSummary.latestProgression).toContain("60kg");
  });
});
