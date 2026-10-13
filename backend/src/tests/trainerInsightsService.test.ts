import { describe, expect, it } from "vitest";
import { buildTrainerClientInsights } from "../services/trainerInsightsService";

describe("trainer client insights", () => {
  it("uses the client's calendar day and keeps unrecorded food and recovery distinct from zero", () => {
    const result = buildTrainerClientInsights({
      windowDays: 7,
      timeZone: "Asia/Kuala_Lumpur",
      now: new Date("2026-10-13T17:00:00Z"),
      food: [
        { day: "2026-10-13", entries: 2, calories: 900, protein_g: 43 },
        { day: "2026-10-14", entries: 1, calories: 310, protein_g: 12 }
      ],
      workouts: [{ day: "2026-10-13", workouts: 1 }],
      recovery: [{ day: "2026-10-14", sleep_quality: "poor" }],
      athlete: []
    });

    expect(result.days.at(-1)).toEqual({
      date: "2026-10-14", foodEntries: 1, loggedCalories: 310, loggedProteinG: 12,
      recordedWorkouts: 0, sleepQuality: "poor", sleepHours: null
    });
    expect(result.days[0].foodEntries).toBe(0);
    expect(result.days[0].loggedCalories).toBeNull();
    expect(result.days[0].sleepQuality).toBeNull();
    expect(result.summary).toEqual({ foodLoggedDays: 2, foodEntries: 3, recordedWorkouts: 1, recoveryCheckinDays: 1, sleepHoursDays: 0 });
  });

  it("counts overlapping sleep quality and Athlete Mode hours as one check-in day", () => {
    const result = buildTrainerClientInsights({
      windowDays: 30,
      timeZone: "Asia/Kuala_Lumpur",
      now: new Date("2026-10-13T08:00:00Z"),
      food: [],
      workouts: [],
      recovery: [{ day: "2026-10-12", sleep_quality: "good" }],
      athlete: [{ day: "2026-10-12", sleep_hours: 7.5 }]
    });

    expect(result.days).toHaveLength(30);
    expect(result.days.find((day) => day.date === "2026-10-12")?.sleepHours).toBe(7.5);
    expect(result.summary.recoveryCheckinDays).toBe(1);
    expect(result.summary.sleepHoursDays).toBe(1);
  });
});
