import { describe, expect, it, vi } from "vitest";
import { resolveUnifiedNotificationInsightForUser } from "../services/notificationService";
import { DailyCoachingDecision } from "../services/dailyCoachingDecisionService";
import { TodayPriorityFacts } from "../services/todayPriorityService";

const insight = {
  title: "Today's Insight" as const,
  body: "One useful action.",
  href: "/burn-log"
};

function facts(): TodayPriorityFacts {
  return {
    localHour: 17,
    mealsToday: 2,
    proteinTodayG: 90,
    proteinTargetG: 125,
    waterTodayMl: 1_500,
    waterTargetMl: 2_500,
    workoutCompletedToday: false,
    daysSinceWorkout: 3,
    stepsToday: 0,
    activeCaloriesToday: 0,
    sleepQuality: null
  };
}

describe("daily coaching notifications", () => {
  it("reuses a decision already resolved by Home", async () => {
    const loadFacts = vi.fn();
    const resolveDecision = vi.fn();
    const getCached = vi.fn(async () => ({ id: "decision-home", insight }));
    const result = await resolveUnifiedNotificationInsightForUser("user-1", -480, {
      getCached,
      loadFacts,
      resolveDecision
    });

    expect(result).toEqual({ id: "decision-home", insight });
    expect(getCached).toHaveBeenCalledWith("user-1", expect.any(String), -480, "today-priority-referee-v2");
    expect(loadFacts).not.toHaveBeenCalled();
    expect(resolveDecision).not.toHaveBeenCalled();
  });

  it("creates a rules-only unified decision when the member has not opened Home", async () => {
    const currentFacts = facts();
    const loadFacts = vi.fn(async () => ({
      context: {
        localDate: "2026-08-20",
        localHour: 17,
        dayStartUtc: new Date("2026-08-19T16:00:00.000Z"),
        dayEndUtc: new Date("2026-08-20T16:00:00.000Z")
      },
      facts: currentFacts
    }));
    const resolveDecision = vi.fn(async (input: any): Promise<DailyCoachingDecision> => ({
      id: "decision-notification",
      insight,
      priority: {
        key: "Movement",
        title: "Movement is today's best next step",
        reason: "A short session is useful today.",
        href: "/burn-log",
        cta: "Log Movement",
        rank: 90
      },
      decisionSource: "rules",
      responseSource: "rules",
      cacheHit: false,
      aiAttempted: false,
      refinementStatus: "disabled",
      resolutionDurationMs: 2,
      engineVersion: "daily-coaching-v1"
    }));

    const result = await resolveUnifiedNotificationInsightForUser("user-1", -480, {
      getCached: vi.fn(async () => null),
      loadFacts,
      resolveDecision
    });

    expect(result).toEqual({ id: "decision-notification", insight });
    expect(loadFacts).toHaveBeenCalledWith("user-1", -480);
    expect(resolveDecision).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      localDate: "2026-08-20",
      timezoneOffsetMinutes: -480,
      allowAiRefinement: false
    }));
  });
});
