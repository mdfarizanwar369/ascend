import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { env } from "../config/env";
import {
  buildWorkoutSignalV1,
  deterministicWorkoutAcknowledgement,
  generateWorkoutDebrief,
  GenerationContext,
  getWorkoutDebrief,
  initializeWorkoutDebrief,
  WORKOUT_DEBRIEF_PROMPT_VERSION,
  validateWorkoutDebriefOutput,
  WorkoutDebriefDependencies,
  WorkoutDebriefRecord,
  WorkoutDebriefStore,
  workoutDebriefRolloutMode
} from "../services/workoutDebriefService";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID = "33333333-3333-4333-8333-333333333333";

const generatedOutput = {
  accomplishment: "You completed an upper body strength session.",
  observation: "Both pushing and pulling work were recorded.",
  recoveryGuidance: "Prioritise hydration, protein, and sleep as you recover.",
  nextConsideration: "Use the stored progression guidance or choose a different focus next time.",
  debrief: "Your upper body strength session is complete, with both pushing and pulling work recorded. The balanced pattern gives Ascend a useful training reference without assuming how each exercise felt. Prioritise hydration, protein, and sleep as you recover. Next time, follow the stored progression guidance or choose a different focus if that better suits your day."
};

function generatedReply(output = generatedOutput) {
  return {
    text: JSON.stringify(output),
    provider: "gemini" as const,
    model: "gemini-test"
  };
}

function createMemoryStore(options: { context?: GenerationContext | null } = {}) {
  const rows = new Map<string, WorkoutDebriefRecord>();
  const key = (eventId: string, userId: string) => `${eventId}:${userId}`;
  const now = new Date().toISOString();
  const context = options.context === undefined ? {
    current: {
      id: EVENT_ID,
      userId: USER_ID,
      gymId: null,
      metadata: {
        source: "ai_workout_capture",
        workoutTitle: "Upper Body Strength",
        workoutType: "Strength",
        durationMinutes: 45,
        exercises: [
          { name: "Dumbbell Press", movementPattern: "push", sets: 3, reps: "8-10" },
          { name: "Cable Row", movementPattern: "pull", sets: 3, reps: "10" }
        ]
      },
      createdAt: now
    },
    goal: "muscle_gain",
    recent: []
  } satisfies GenerationContext : options.context;

  const store: WorkoutDebriefStore = {
    async initialize(input) {
      const rowKey = key(input.workoutEventId, input.userId);
      const existing = rows.get(rowKey);
      if (existing) return existing;
      const row: WorkoutDebriefRecord = {
        id: "44444444-4444-4444-8444-444444444444",
        workoutEventId: input.workoutEventId,
        userId: input.userId,
        status: input.status,
        workoutSignal: input.workoutSignal,
        debriefOutput: null,
        fallbackText: input.fallbackText,
        provider: null,
        model: null,
        promptVersion: WORKOUT_DEBRIEF_PROMPT_VERSION,
        failureReason: null,
        generationStartedAt: null,
        generatedAt: null,
        createdAt: now,
        updatedAt: now
      };
      rows.set(rowKey, row);
      return row;
    },
    async findForUser(eventId, userId) {
      return rows.get(key(eventId, userId)) ?? null;
    },
    async claimPending(eventId, userId) {
      const row = rows.get(key(eventId, userId));
      if (!row || row.status !== "pending") return null;
      const claimed = { ...row, status: "generating" as const, generationStartedAt: new Date().toISOString() };
      rows.set(key(eventId, userId), claimed);
      return claimed;
    },
    async markGenerated(input) {
      const row = rows.get(key(input.workoutEventId, input.userId));
      if (!row || row.status !== "generating") return null;
      const generated = {
        ...row,
        status: "generated" as const,
        debriefOutput: input.output,
        provider: input.provider,
        model: input.model,
        generatedAt: new Date().toISOString()
      };
      rows.set(key(input.workoutEventId, input.userId), generated);
      return generated;
    },
    async markFallback(input) {
      const row = rows.get(key(input.workoutEventId, input.userId));
      if (!row || (row.status !== "pending" && row.status !== "generating")) return null;
      const fallback = {
        ...row,
        status: "fallback" as const,
        failureReason: input.failureReason,
        provider: input.provider ?? row.provider,
        model: input.model ?? row.model,
        generatedAt: new Date().toISOString()
      };
      rows.set(key(input.workoutEventId, input.userId), fallback);
      return fallback;
    },
    async markStalePendingFallback(eventId, userId) {
      const row = rows.get(key(eventId, userId));
      if (!row || row.status !== "pending" || Date.now() - new Date(row.createdAt).getTime() < 120_000) return null;
      const fallback = {
        ...row,
        status: "fallback" as const,
        failureReason: "generation_not_started",
        generatedAt: new Date().toISOString()
      };
      rows.set(key(eventId, userId), fallback);
      return fallback;
    },
    async markStaleGeneratingFallback(eventId, userId) {
      const row = rows.get(key(eventId, userId));
      if (!row || row.status !== "generating" || !row.generationStartedAt || Date.now() - new Date(row.generationStartedAt).getTime() < 120_000) return null;
      const fallback = {
        ...row,
        status: "fallback" as const,
        failureReason: "generation_interrupted",
        generatedAt: new Date().toISOString()
      };
      rows.set(key(eventId, userId), fallback);
      return fallback;
    },
    async loadGenerationContext(eventId, userId) {
      return eventId === EVENT_ID && userId === USER_ID ? context ?? null : null;
    }
  };
  return { store, rows };
}

function dependencies(
  store: WorkoutDebriefStore,
  generate: WorkoutDebriefDependencies["generate"] = vi.fn(async () => generatedReply())
) {
  return {
    store,
    generate,
    logUsage: vi.fn(async () => undefined)
  };
}

describe("Coach Zoe Workout Debrief V1", () => {
  const originalGlobalFlag = env.COACH_ZOE_WORKOUT_DEBRIEF_V1;
  const originalOwnerFlag = env.COACH_ZOE_WORKOUT_DEBRIEF_OWNER_PILOT;

  beforeEach(() => {
    env.COACH_ZOE_WORKOUT_DEBRIEF_V1 = true;
    env.COACH_ZOE_WORKOUT_DEBRIEF_OWNER_PILOT = false;
  });

  afterEach(() => {
    env.COACH_ZOE_WORKOUT_DEBRIEF_V1 = originalGlobalFlag;
    env.COACH_ZOE_WORKOUT_DEBRIEF_OWNER_PILOT = originalOwnerFlag;
    vi.restoreAllMocks();
  });

  it("builds a bounded signal without inventing volume, recovery, or exercise execution", () => {
    const signal = buildWorkoutSignalV1({
      source: "coach_zoe_workout_planner",
      metadata: {
        workoutTitle: "Upper Body",
        workoutType: "Strength",
        exercises: [
          { name: "Press", movementPattern: "push" },
          { name: "Row", movementPattern: "pull" }
        ]
      }
    });

    expect(signal.sessionType).toBe("strength");
    expect(signal.movementPatterns).toEqual(["push", "pull"]);
    expect(signal.completionRatio).toBe(1);
    expect(signal.prescribedComparison).toBe("completion_only");
    expect(signal.volumeBand).toBe("unknown");
    expect(signal.recoveryLoad).toBe("unknown");
    expect(signal.limitations).toContain("exercise_level_execution_not_recorded");
  });

  it("keeps unsupported custom-workout evidence explicitly unknown", () => {
    const signal = buildWorkoutSignalV1({
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Evening session", workoutType: "Strength", exercises: [] }
    });

    expect(signal.completionRatio).toBeNull();
    expect(signal.prescribedComparison).toBe("not_available");
    expect(signal.movementPatterns).toEqual([]);
    expect(signal.limitations).toContain("movement_patterns_limited");
  });

  it("translates existing progression intelligence without recalculating it", () => {
    const signal = buildWorkoutSignalV1({
      source: "ai_workout_capture",
      metadata: {
        workoutTitle: "Strength Session",
        workoutType: "Strength",
        exercises: [{ name: "Dumbbell Press", movementPattern: "push", sets: 3, reps: "8", load: 18, loadUnit: "kg" }],
        progressionV3: {
          version: "workout_progression_v3",
          evidenceType: "observed_performance",
          overallStatus: "personal_best",
          headline: "A verified improvement was recorded.",
          achievements: ["Progression verified."],
          reviewNotes: [],
          nextSessionFocus: "Keep the current load and confirm another clean observation.",
          exerciseInsights: [],
          confidence: 0.91
        }
      }
    });

    expect(signal.notableSignals).toEqual(expect.arrayContaining(["progression_verified", "personal_best"]));
    expect(signal.nextSessionBias).toEqual(["Keep the current load and confirm another clean observation."]);
    expect(signal.evidenceConfidence).toBe(0.91);
    expect(signal.volumeBand).toBe("unknown");
  });

  it("does not present sparse low-confidence capture as verified progression", async () => {
    const sparseProgression = {
      version: "workout_progression_v3" as const,
      evidenceType: "observed_performance" as const,
      overallStatus: "baseline" as const,
      headline: "Your detailed performance baseline is saved.",
      achievements: [],
      reviewNotes: [],
      nextSessionFocus: "Repeat this performance once before making a larger change.",
      exerciseInsights: [],
      confidence: 0.48
    };
    const metadata = {
      workoutTitle: "Evening Training",
      workoutType: "General Fitness",
      captureConfidence: 0.48,
      exercises: [{ name: "Some machine work", confidence: 0.48, needsConfirmation: true }],
      progressionV3: sparseProgression
    };
    const signal = buildWorkoutSignalV1({ source: "ai_workout_capture", metadata });

    expect(signal.notableSignals).not.toContain("progression_verified");
    expect(signal.notableSignals).not.toContain("baseline_saved");
    expect(signal.nextSessionBias).toEqual([]);
    expect(signal.limitations).toContain("progression_evidence_insufficient");

    const context: GenerationContext = {
      current: { id: EVENT_ID, userId: USER_ID, gymId: null, metadata, createdAt: new Date().toISOString() },
      goal: "general_fitness",
      recent: []
    };
    const { store } = createMemoryStore({ context });
    const generate = vi.fn(async (_systemPrompt: string, _userPrompt: string) => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata
    }, deps);
    await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    const userPrompt = generate.mock.calls[0]?.[1] ?? "";
    const systemPrompt = generate.mock.calls[0]?.[0] ?? "";
    expect(userPrompt).toContain('"progression":null');
    expect(userPrompt).toContain('"progression_evidence_insufficient"');
    expect(userPrompt).toContain("This record is too sparse for progression or focus analysis");
    expect(systemPrompt).toContain("When recoveryLoad is unknown");
    expect(systemPrompt).toContain("details are too limited to assess focus or progression");
    expect(systemPrompt).toContain("the Coach Zoe workout completion flow does not collect");
  });

  it("places the completion-only boundary beside the workout evidence", async () => {
    const context: GenerationContext = {
      current: {
        id: EVENT_ID,
        userId: USER_ID,
        gymId: null,
        metadata: {
          source: "coach_zoe_workout_planner",
          workoutTitle: "Upper Body Foundation",
          workoutType: "Strength",
          exercises: [
            { name: "Dumbbell Press", movementPattern: "push" },
            { name: "Cable Row", movementPattern: "pull" }
          ]
        },
        createdAt: new Date().toISOString()
      },
      goal: "muscle_gain",
      recent: []
    };
    const { store } = createMemoryStore({ context });
    const generate = vi.fn(async (_systemPrompt: string, _userPrompt: string) => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "coach_zoe_workout_planner",
      metadata: context.current.metadata
    }, deps);
    await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    const systemPrompt = generate.mock.calls[0]?.[0] ?? "";
    const userPrompt = generate.mock.calls[0]?.[1] ?? "";
    expect(WORKOUT_DEBRIEF_PROMPT_VERSION).toBe("coach-zoe-workout-debrief-v1.1");
    expect(systemPrompt).toContain("Choose the strongest grounded observation first");
    expect(systemPrompt).toContain("Do not routinely repeat the workout title or begin with 'You completed'");
    expect(systemPrompt).toContain("hard maximum of 80 words");
    expect(systemPrompt).toContain("25 to 50 words with sparse evidence");
    expect(systemPrompt).toContain("Do not force a next-session recommendation");
    expect(systemPrompt).toContain("avoid database-like phrases");
    expect(systemPrompt).toContain("must omit generic sleep, hydration, protein, rest, soreness, and fatigue advice");
    expect(systemPrompt).toContain("Never assess form or technique");
    expect(userPrompt).toContain("This is completion-only evidence");
    expect(userPrompt).toContain("lead with the strongest supported focus or movement-pattern interpretation");
    expect(userPrompt).toContain("Do not ask for loads, sets, reps, ratings, notes, or any additional tracking");
  });

  it("removes impossible tracking requests from completion-only provider output without another AI call", async () => {
    const context: GenerationContext = {
      current: {
        id: EVENT_ID,
        userId: USER_ID,
        gymId: null,
        metadata: {
          source: "coach_zoe_workout_planner",
          workoutTitle: "Upper Body Foundation",
          workoutType: "Strength",
          exercises: [
            { name: "Dumbbell Press", movementPattern: "push" },
            { name: "Cable Row", movementPattern: "pull" }
          ]
        },
        createdAt: new Date().toISOString()
      },
      goal: "muscle_gain",
      recent: []
    };
    const { store } = createMemoryStore({ context });
    const generate = vi.fn(async () => ({
      ...generatedReply(),
      text: JSON.stringify({
        accomplishment: "You completed your upper body workout with pushing and pulling movements.",
        observation: "The session included both movement patterns.",
        recoveryGuidance: "No specific recovery conclusion is supported by the record.",
        nextConsideration: "Next time, consider recording the duration of your workout.",
        debrief: "The session included both pushing and pulling movements, giving the planned upper-body work a balanced structure. It's great to see you completed the workout. Next time, consider recording the duration of your workout. Keep up the consistent effort."
      })
    }));
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "coach_zoe_workout_planner",
      metadata: context.current.metadata
    }, deps);

    const result = await generateWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false
    }, deps);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe("generated");
    expect(result?.text).toBe("The session included both pushing and pulling movements, giving the planned upper-body work a balanced structure. Completing the planned session gives your recent training a clear reference point without overstating how each exercise went.");
    expect(result?.text).not.toMatch(/consider recording|record(?:ing)? (?:the )?(?:duration|loads|sets|reps)|keep up|good to see/i);
  });

  it("uses safe deterministic language for quick activity", () => {
    expect(deterministicWorkoutAcknowledgement({
      source: "quick_activity",
      metadata: { activityType: "Walking", durationMinutes: 20 }
    })).toContain("useful low-intensity movement");
    expect(deterministicWorkoutAcknowledgement({
      source: "quick_activity",
      metadata: { activityType: "Running", durationMinutes: 30 }
    })).toBe("Your 30-minute running has been recorded and added to today's activity.");
  });

  it("supports global and platform-owner pilot rollout without a frontend flag", () => {
    expect(workoutDebriefRolloutMode({ isPlatformOwner: false, enabledForAll: false, ownerPilotEnabled: false })).toBe("disabled");
    expect(workoutDebriefRolloutMode({ isPlatformOwner: true, enabledForAll: false, ownerPilotEnabled: true })).toBe("active");
    expect(workoutDebriefRolloutMode({ isPlatformOwner: false, enabledForAll: true, ownerPilotEnabled: false })).toBe("active");
  });

  it("rejects malformed, unsupported numeric, and unsafe output", () => {
    expect(() => validateWorkoutDebriefOutput("not json")).toThrow();
    expect(() => validateWorkoutDebriefOutput(JSON.stringify({
      ...generatedOutput,
      accomplishment: "You completed 4 exercises."
    }))).toThrow("numeric claims");
    expect(() => validateWorkoutDebriefOutput(JSON.stringify({
      ...generatedOutput,
      observation: "Your technique looked perfect."
    }))).toThrow("safety language");
  });

  it("generates once, persists the result, and serves cached responses thereafter", async () => {
    const { store } = createMemoryStore();
    const generate = vi.fn(async () => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Upper Body Strength", workoutType: "Strength" }
    }, deps);

    const [first, concurrent] = await Promise.all([
      generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps),
      generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps)
    ]);
    const cached = await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(generate).toHaveBeenCalledTimes(1);
    expect([first?.status, concurrent?.status]).toContain("generated");
    expect(cached).toMatchObject({ status: "generated", source: "ai", cached: true });
    expect(deps.logUsage).toHaveBeenCalledTimes(1);
  });

  it("uses one terminal fallback after a provider or output failure and never retries", async () => {
    const { store } = createMemoryStore();
    const generate = vi.fn(async () => ({ text: "partial response", provider: "gemini" as const, model: "gemini-test" }));
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Strength Session", workoutType: "Strength" }
    }, deps);

    const first = await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);
    const second = await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(first).toMatchObject({ status: "fallback", source: "deterministic", cached: false });
    expect(second).toMatchObject({ status: "fallback", source: "deterministic", cached: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("never calls AI for Quick Activity", async () => {
    const { store } = createMemoryStore();
    const generate = vi.fn(async () => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "quick_activity",
      metadata: { activityType: "Walking", durationMinutes: 20 }
    }, deps);

    const result = await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(result).toMatchObject({ status: "not_required", source: "deterministic", cached: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it("enforces ownership on read and does not generate during GET", async () => {
    const { store } = createMemoryStore();
    const generate = vi.fn(async () => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Strength Session", workoutType: "Strength" }
    }, deps);

    const ownerRead = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);
    const otherRead = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: OTHER_USER_ID, isPlatformOwner: false }, deps);

    expect(ownerRead?.status).toBe("pending");
    expect(otherRead).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps a fresh pending row pending but resolves an abandoned stale row without AI", async () => {
    const { store, rows } = createMemoryStore();
    const generate = vi.fn(async () => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Strength Session", workoutType: "Strength" }
    }, deps);

    const fresh = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);
    const rowKey = `${EVENT_ID}:${USER_ID}`;
    rows.set(rowKey, { ...rows.get(rowKey)!, createdAt: new Date(Date.now() - 121_000).toISOString() });
    const stale = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(fresh?.status).toBe("pending");
    expect(stale).toMatchObject({ status: "fallback", source: "deterministic", cached: true });
    expect(rows.get(rowKey)?.failureReason).toBe("generation_not_started");
    expect(generate).not.toHaveBeenCalled();
  });

  it("resolves an interrupted stale generating row to fallback without a second provider attempt", async () => {
    const { store, rows } = createMemoryStore();
    const generate = vi.fn(async () => generatedReply());
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Strength Session", workoutType: "Strength" }
    }, deps);
    const rowKey = `${EVENT_ID}:${USER_ID}`;
    rows.set(rowKey, {
      ...rows.get(rowKey)!,
      status: "generating",
      generationStartedAt: new Date(Date.now() - 121_000).toISOString()
    });

    const recovered = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(recovered).toMatchObject({ status: "fallback", source: "deterministic", cached: true });
    expect(rows.get(rowKey)?.failureReason).toBe("generation_interrupted");
    expect(generate).not.toHaveBeenCalled();
  });

  it("turns a provider timeout into terminal fallback", async () => {
    const { store } = createMemoryStore();
    const generate = vi.fn(async () => {
      const error = new Error("request timed out");
      error.name = "AbortError";
      throw error;
    });
    const deps = dependencies(store, generate);
    await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: { workoutTitle: "Strength Session", workoutType: "Strength" }
    }, deps);

    const timedOut = await generateWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);
    const reopened = await getWorkoutDebrief({ workoutEventId: EVENT_ID, userId: USER_ID, isPlatformOwner: false }, deps);

    expect(timedOut).toMatchObject({ status: "fallback", source: "deterministic" });
    expect(reopened).toMatchObject({ status: "fallback", source: "deterministic", cached: true });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("is inert when both server feature flags are disabled", async () => {
    env.COACH_ZOE_WORKOUT_DEBRIEF_V1 = false;
    env.COACH_ZOE_WORKOUT_DEBRIEF_OWNER_PILOT = false;
    const store = createMemoryStore().store;
    const initialize = vi.spyOn(store, "initialize");

    const result = await initializeWorkoutDebrief({
      workoutEventId: EVENT_ID,
      userId: USER_ID,
      isPlatformOwner: false,
      source: "ai_workout_capture",
      metadata: {}
    }, { store });

    expect(result.enabled).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
  });

  it("enforces one related record and cascades deletion from the canonical workout", () => {
    const migration = readFileSync("migrations/033_workout_debriefs.sql", "utf8");
    expect(migration).toMatch(/workout_event_id uuid not null references analytics_events\(id\) on delete cascade/i);
    expect(migration).toMatch(/unique \(workout_event_id\)/i);
  });
});
