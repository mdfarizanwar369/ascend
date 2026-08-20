import { describe, expect, it, vi } from "vitest";
import {
  buildDailyCoachingInsight,
  dailyCoachingFingerprint,
  dailyCoachingNotificationSource,
  dailyCoachingRolloutMode,
  DailyCoachingDecisionStore,
  resolveDailyCoachingDecision
} from "../services/dailyCoachingDecisionService";
import { deterministicTodayPriority, localCalendarDaysSince, TodayPriorityCandidate, TodayPriorityFacts } from "../services/todayPriorityService";

function facts(overrides: Partial<TodayPriorityFacts> = {}): TodayPriorityFacts {
  return {
    localHour: 16,
    mealsToday: 2,
    proteinTodayG: 70,
    proteinTargetG: 125,
    waterTodayMl: 1_500,
    waterTargetMl: 2_500,
    workoutCompletedToday: false,
    daysSinceWorkout: 3,
    stepsToday: 0,
    activeCaloriesToday: 0,
    sleepQuality: null,
    ...overrides
  };
}

function memoryStore(): DailyCoachingDecisionStore & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    async findCached(input) {
      const row = rows.find((candidate) =>
        candidate.userId === input.userId
        && candidate.localDate === input.localDate
        && candidate.fingerprint === input.fingerprint
        && candidate.engineVersion === input.engineVersion
        && candidate.resolutionMode === input.resolutionMode
      );
      if (!row) return null;
      return {
        id: String(row.id),
        priority: row.priority as Awaited<ReturnType<typeof resolveDailyCoachingDecision>>["priority"],
        insight: row.insight as Awaited<ReturnType<typeof resolveDailyCoachingDecision>>["insight"],
        decision_source: row.decisionSource as "rules" | "ai",
        ai_attempted: Boolean(row.aiAttempted),
        refinement_status: (row.refinementStatus as "disabled" | "not_needed" | "not_available" | "capped" | "selected" | "no_result" | "not_recorded") ?? "not_recorded"
      };
    },
    async countAiAttempts(input) {
      return rows.filter((candidate) =>
        candidate.userId === input.userId
        && candidate.localDate === input.localDate
        && candidate.engineVersion === input.engineVersion
        && candidate.resolutionMode === input.resolutionMode
        && candidate.aiAttempted === true
      ).length;
    },
    async recordCacheHit(input) {
      const row = rows.find((candidate) => candidate.id === input.id);
      if (row) {
        row.priority = input.priority;
        row.insight = input.insight;
        row.cacheHitCount = Number(row.cacheHitCount ?? 0) + 1;
      }
    },
    async save(input) {
      const id = `decision-${rows.length + 1}`;
      rows.push({ id, ...input });
      return id;
    }
  };
}

function resolveInput(overrides: Partial<Parameters<typeof resolveDailyCoachingDecision>[0]> = {}) {
  const currentFacts = overrides.facts ?? facts();
  return {
    userId: "user-1",
    localDate: "2026-08-19",
    timezoneOffsetMinutes: -480,
    expiresAt: "2026-08-19T16:00:00.000Z",
    facts: currentFacts,
    allowAiRefinement: true,
    legacyPriorityKey: deterministicTodayPriority(currentFacts).key,
    ...overrides
  };
}

describe("daily coaching decision", () => {
  it("activates only for the platform owner during the owner pilot", () => {
    expect(dailyCoachingRolloutMode({ enabledForAll: false, shadowEnabled: true, ownerPilotEnabled: true, isPlatformOwner: true })).toBe("active");
    expect(dailyCoachingRolloutMode({ enabledForAll: false, shadowEnabled: true, ownerPilotEnabled: true, isPlatformOwner: false })).toBe("shadow");
    expect(dailyCoachingRolloutMode({ enabledForAll: false, shadowEnabled: false, ownerPilotEnabled: false, isPlatformOwner: true })).toBe("legacy");
  });

  it("never falls back to a competing coaching notification while the unified layer is active", () => {
    expect(dailyCoachingNotificationSource("active", true)).toBe("unified");
    expect(dailyCoachingNotificationSource("active", false)).toBe("none");
    expect(dailyCoachingNotificationSource("shadow", false)).toBe("legacy");
    expect(dailyCoachingNotificationSource("legacy", false)).toBe("legacy");
  });

  it("keeps a fingerprint stable for insignificant changes and changes it at a decision threshold", () => {
    const baseline = dailyCoachingFingerprint("2026-08-19", facts({ waterTodayMl: 1_500, localHour: 17 }));
    const sameBucket = dailyCoachingFingerprint("2026-08-19", facts({ waterTodayMl: 1_600, localHour: 18 }));
    const changed = dailyCoachingFingerprint("2026-08-19", facts({ waterTodayMl: 2_000, localHour: 19 }));

    expect(sameBucket).toBe(baseline);
    expect(changed).not.toBe(baseline);
  });

  it("invalidates a cached decision when its prompt version changes", () => {
    const currentFacts = facts({ waterTodayMl: 800 });
    expect(dailyCoachingFingerprint("2026-08-19", currentFacts, "prompt-v1"))
      .not.toBe(dailyCoachingFingerprint("2026-08-19", currentFacts, "prompt-v2"));
  });

  it("treats a workout on the previous local calendar day as yesterday even within 24 hours", () => {
    const now = new Date("2026-08-20T00:00:00.000Z").getTime();
    const previousEvening = new Date("2026-08-19T12:00:00.000Z").getTime();
    expect(localCalendarDaysSince(previousEvening, -480, now)).toBe(1);
    expect(localCalendarDaysSince(new Date("2026-08-20T00:30:00.000Z").getTime(), -480, now)).toBe(0);
  });

  it("uses AI only as a referee for close candidates and caches the result", async () => {
    const store = memoryStore();
    const refine = vi.fn(async ({ candidates }: { candidates: TodayPriorityCandidate[] }) => candidates.find((candidate) => candidate.key === "Water") ?? null);
    const input = resolveInput({ facts: facts({ waterTodayMl: 800 }) });

    const first = await resolveDailyCoachingDecision(input, { store, refine });
    const second = await resolveDailyCoachingDecision(input, { store, refine });

    expect(first.priority.key).toBe("Water");
    expect(first.decisionSource).toBe("ai");
    expect(first.cacheHit).toBe(false);
    expect(second.priority.key).toBe("Water");
    expect(second.responseSource).toBe("cache");
    expect(refine).toHaveBeenCalledTimes(1);
  });

  it("refreshes exact supporting copy from live facts without repeating the AI decision", async () => {
    const store = memoryStore();
    const refine = vi.fn(async ({ candidates }: { candidates: TodayPriorityCandidate[] }) => candidates.find((candidate) => candidate.key === "Water") ?? null);
    const firstFacts = facts({ waterTodayMl: 800 });
    const updatedFacts = facts({ waterTodayMl: 1_000 });

    const first = await resolveDailyCoachingDecision(resolveInput({ facts: firstFacts }), { store, refine });
    const second = await resolveDailyCoachingDecision(resolveInput({ facts: updatedFacts }), { store, refine });

    expect(dailyCoachingFingerprint("2026-08-19", firstFacts)).toBe(dailyCoachingFingerprint("2026-08-19", updatedFacts));
    expect(first.priority.key).toBe("Water");
    expect(first.priority.reason).toContain("1.7L remains");
    expect(second.priority.key).toBe("Water");
    expect(second.priority.reason).toContain("1.5L remains");
    expect(second.insight.body).toContain("1.5L remains");
    expect(second.cacheHit).toBe(true);
    expect(refine).toHaveBeenCalledTimes(1);
  });

  it("preserves legacy AI wording while caching it independently from the unified referee", async () => {
    const store = memoryStore();
    const refine = vi.fn(async ({ candidates }: { candidates: TodayPriorityCandidate[] }) => ({
      ...(candidates.find((candidate) => candidate.key === "Water") ?? candidates[0]),
      title: "Legacy personalized title",
      reason: "Legacy personalized reason."
    }));
    const input = resolveInput({ facts: facts({ waterTodayMl: 800 }) });

    const first = await resolveDailyCoachingDecision(input, {
      store,
      refine,
      promptVersion: "legacy-v1",
      preserveRefinedPresentation: true
    });
    const second = await resolveDailyCoachingDecision(input, {
      store,
      refine,
      promptVersion: "legacy-v1",
      preserveRefinedPresentation: true
    });

    expect(first.priority.title).toBe("Legacy personalized title");
    expect(second.priority.reason).toBe("Legacy personalized reason.");
    expect(store.rows[0]?.resolutionMode).toBe("legacy_refined");
    expect(refine).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent identical decisions into one AI refinement", async () => {
    const store = memoryStore();
    const refine = vi.fn(async ({ candidates }: { candidates: TodayPriorityCandidate[] }) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return candidates.find((candidate) => candidate.key === "Water") ?? null;
    });
    const input = resolveInput({ userId: "concurrent-user", facts: facts({ waterTodayMl: 800 }) });

    const [first, second] = await Promise.all([
      resolveDailyCoachingDecision(input, { store, refine }),
      resolveDailyCoachingDecision(input, { store, refine })
    ]);

    expect(first.id).toBe(second.id);
    expect(refine).toHaveBeenCalledTimes(1);
    expect(store.rows).toHaveLength(1);
  });

  it("does not call AI when deterministic rules have a clear winner", async () => {
    const store = memoryStore();
    const refine = vi.fn(async () => null);
    const currentFacts = facts({ localHour: 14, mealsToday: 0, proteinTodayG: 0, waterTodayMl: 1_500, daysSinceWorkout: 1 });
    const decision = await resolveDailyCoachingDecision(resolveInput({ facts: currentFacts }), { store, refine });

    expect(decision.priority.key).toBe("Meal");
    expect(decision.decisionSource).toBe("rules");
    expect(refine).not.toHaveBeenCalled();
  });

  it("falls back safely when AI refinement fails", async () => {
    const store = memoryStore();
    const currentFacts = facts({ waterTodayMl: 800 });
    const decision = await resolveDailyCoachingDecision(resolveInput({ facts: currentFacts }), {
      store,
      refine: vi.fn(async () => { throw new Error("provider unavailable"); })
    });

    expect(decision.priority.key).toBe(deterministicTodayPriority(currentFacts).key);
    expect(decision.decisionSource).toBe("rules");
    expect(decision.aiAttempted).toBe(true);
    expect(decision.refinementStatus).toBe("no_result");
  });

  it("does not let shadow mode make an AI call", async () => {
    const store = memoryStore();
    const refine = vi.fn(async () => null);
    await resolveDailyCoachingDecision(resolveInput({ facts: facts({ waterTodayMl: 800 }), allowAiRefinement: false }), { store, refine });
    expect(refine).not.toHaveBeenCalled();
  });

  it("caps daily AI refinements and keeps the deterministic fallback", async () => {
    const store = memoryStore();
    const refine = vi.fn(async () => null);
    const currentFacts = facts({ waterTodayMl: 800 });
    const decision = await resolveDailyCoachingDecision(resolveInput({ facts: currentFacts }), {
      store,
      refine,
      maxAiRefinementsPerDay: 0
    });

    expect(decision.priority.key).toBe(deterministicTodayPriority(currentFacts).key);
    expect(decision.aiAttempted).toBe(false);
    expect(decision.refinementStatus).toBe("capped");
    expect(refine).not.toHaveBeenCalled();
  });

  it("keeps the supporting insight aligned with the selected action", () => {
    const movementFacts = facts({ sleepQuality: "poor", daysSinceWorkout: 1 });
    const movement = deterministicTodayPriority(movementFacts);
    const movementInsight = buildDailyCoachingInsight(movement, movementFacts);
    expect(movement.key).toBe("Movement");
    expect(movementInsight.body).toContain("Gentle movement");
    expect(movementInsight.href).toBe("/burn-log");

    const mealFacts = facts({ workoutCompletedToday: true, proteinTodayG: 40 });
    const meal = deterministicTodayPriority(mealFacts);
    const mealInsight = buildDailyCoachingInsight(meal, mealFacts);
    expect(meal.key).toBe("Meal");
    expect(mealInsight.body).toContain("support recovery");
    expect(mealInsight.href).toBe("/food-log");
  });
});
