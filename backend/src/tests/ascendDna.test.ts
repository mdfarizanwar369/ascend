import { describe, expect, it } from "vitest";
import { AscendDNAService, AscendDnaEvent } from "@ascend/shared";

const NOW = "2026-06-24T10:00:00+08:00";

describe("AscendDNAService", () => {
  it("builds a safe default DNA profile for a new user with no events", () => {
    const dna = AscendDNAService.buildProfile({ now: NOW, events: [] });

    expect(dna.preferredLoggingTime).toBe("morning");
    expect(dna.foodConsistency).toBe(0);
    expect(dna.averageWeeklyConsistency).toBe(0);
    expect(dna.momentumTrend).toBe("stable");
    expect(dna.weeklyMemory.recommendedFocus).toBe("activity");
  });

  it("chooses one deterministic first food action for a new day", () => {
    const dna = AscendDNAService.buildProfile({ now: NOW, events: [] });
    const move = AscendDNAService.getNextBestMove({
      now: NOW,
      dna,
      todaysFoodCount: 0,
      caloriesLeft: 1500,
      calorieOver: 0,
      proteinLeft: 90,
      waterLeftMl: 2500,
      completedHabits: 0,
      totalHabits: 2,
      todaysBurnCalories: 0,
      latestWeightLoggedToday: false,
      progressPhotoDue: true
    });

    expect(move).toEqual({
      title: "Log your first meal.",
      detail: "One meal is enough to restart today's momentum. It usually takes under a minute.",
      href: "/food-log",
      cta: "Log Food"
    });
  });

  it("reduces morning food prompts for users who usually log food in the evening", () => {
    const events: AscendDnaEvent[] = [
      { type: "food", occurredAt: "2026-06-23T19:15:00+08:00" },
      { type: "food", occurredAt: "2026-06-22T20:15:00+08:00" },
      { type: "food", occurredAt: "2026-06-21T18:15:00+08:00" },
      { type: "water", occurredAt: "2026-06-24T08:15:00+08:00" }
    ];
    const dna = AscendDNAService.buildProfile({ now: NOW, events });
    const move = AscendDNAService.getNextBestMove({
      now: NOW,
      dna,
      todaysFoodCount: 0,
      caloriesLeft: 1500,
      calorieOver: 0,
      proteinLeft: 90,
      waterLeftMl: 400,
      completedHabits: 0,
      totalHabits: 1,
      todaysBurnCalories: 0,
      latestWeightLoggedToday: false,
      progressPhotoDue: false
    });

    expect(dna.preferredLoggingTime).toBe("evening");
    expect(move.href).toBe("/water-log");
  });

  it("does not nag high-consistency water users for a small remaining amount", () => {
    const events: AscendDnaEvent[] = Array.from({ length: 7 }, (_, index) => ({
      type: "water" as const,
      occurredAt: `2026-06-${String(18 + index).padStart(2, "0")}T09:00:00+08:00`
    }));
    const dna = AscendDNAService.buildProfile({ now: NOW, events });
    const move = AscendDNAService.getNextBestMove({
      now: NOW,
      dna,
      todaysFoodCount: 1,
      caloriesLeft: 100,
      calorieOver: 0,
      proteinLeft: 5,
      waterLeftMl: 500,
      completedHabits: 0,
      totalHabits: 1,
      todaysBurnCalories: 0,
      latestWeightLoggedToday: true,
      progressPhotoDue: false
    });

    expect(dna.waterConsistency).toBe(100);
    expect(move.href).toBe("/habits");
  });

  it("returns deterministic greetings and celebrations", () => {
    const dna = AscendDNAService.buildProfile({
      now: NOW,
      events: [{ type: "habit", habitName: "Steps", occurredAt: NOW }],
      currentStreak: 6,
      bestStreak: 6,
      momentumScores: [
        { score: 50, occurredAt: "2026-06-17T08:00:00+08:00" },
        { score: 76, occurredAt: NOW }
      ]
    });

    expect(AscendDNAService.getGreeting(dna, NOW)).toBe(AscendDNAService.getGreeting(dna, NOW));
    expect(AscendDNAService.getCelebration("habit").title).toBe("Habit completed.");
    expect(AscendDNAService.getMotivation(dna, NOW)).toBe(AscendDNAService.getMotivation(dna, NOW));
  });
});
