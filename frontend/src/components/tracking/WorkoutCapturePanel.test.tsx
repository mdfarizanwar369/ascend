import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutCaptureDraft } from "@ascend/shared";

const { analyze, recent, progression, save, debrief, getDebrief, generateDebrief } = vi.hoisted(() => ({
  analyze: vi.fn(),
  recent: vi.fn(),
  progression: vi.fn(),
  save: vi.fn(),
  debrief: vi.fn(),
  getDebrief: vi.fn(),
  generateDebrief: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => ({
  analyzeWorkoutCapture: analyze,
  getRecentDetailedWorkouts: recent,
  getWorkoutProgressionHistory: progression,
  saveCapturedWorkout: save,
  waitForWorkoutDebrief: debrief,
  getWorkoutDebrief: getDebrief,
  generateWorkoutDebrief: generateDebrief
}));

vi.mock("@/lib/workoutProgressionFlag", () => ({ workoutProgressionEnabled: () => false }));
vi.mock("@/lib/workoutProgressionV3Flag", () => ({ workoutProgressionV3Enabled: () => false }));

import { WorkoutCapturePanel } from "./WorkoutCapturePanel";

const receipt: WorkoutCaptureDraft = {
  version: "workout_capture_v1",
  sourceMode: "text",
  originalInput: "Chest workout",
  title: "Chest and Back",
  workoutType: "Strength",
  difficulty: "challenging",
  durationMinutes: 55,
  confidence: 0.88,
  uncertainties: ["Please confirm the details for Cable Flyes."],
  requiresReview: true,
  exercises: [
    {
      name: "Incline Smith Machine Press",
      originalText: "Worked up to 25 kg per side, then reduced to 20 kg per side for 8 reps",
      sets: 4,
      reps: "8",
      load: 20,
      loadUnit: "kg",
      durationMinutes: null,
      restSeconds: 90,
      note: null,
      movementPattern: "push",
      confidence: 0.98,
      needsConfirmation: false,
      section: "Chest",
      loadBasis: "per_side",
      topLoad: 25,
      backoffLoad: 20,
      trainingMethods: ["back_off"],
      loadSteps: [
        { value: 25, unit: "kg", basis: "per_side", role: "top", reps: "6", approximate: false, note: null, confidence: 0.98 },
        { value: 20, unit: "kg", basis: "per_side", role: "backoff", reps: "8", approximate: false, note: null, confidence: 0.98 }
      ],
      setDetails: [],
      uncertainFields: []
    },
    {
      name: "Pec Deck",
      originalText: "7 sets, around 10-12 reps, short-rest FST-7 style",
      sets: 7,
      reps: "10-12",
      load: null,
      loadUnit: null,
      durationMinutes: null,
      restSeconds: null,
      note: null,
      movementPattern: "push",
      confidence: 0.95,
      needsConfirmation: false,
      section: "Chest",
      repRangeMin: 10,
      repRangeMax: 12,
      approximateReps: true,
      loadBasis: "unknown",
      trainingMethods: ["fst_7", "short_rest"],
      loadSteps: [],
      setDetails: [],
      uncertainFields: []
    },
    {
      name: "Cable Flyes",
      originalText: "Cable flyes 10 x 3",
      sets: 10,
      reps: "3",
      load: null,
      loadUnit: null,
      durationMinutes: null,
      restSeconds: null,
      note: null,
      movementPattern: "push",
      confidence: 0.62,
      needsConfirmation: true,
      section: "Chest",
      loadBasis: "unknown",
      trainingMethods: [],
      loadSteps: [],
      setDetails: [],
      uncertainFields: ["sets", "reps"],
      fieldConfidence: { name: 0.98, sets: 0.52, reps: 0.55 }
    }
  ]
};

describe("Detailed Workout receipt", () => {
  beforeEach(() => {
    analyze.mockReset().mockResolvedValue({ enabled: true, draft: receipt, allowance: null });
    recent.mockReset().mockResolvedValue({ enabled: true, workouts: [], allowance: null });
    progression.mockReset().mockResolvedValue({ enabled: true, history: [] });
    save.mockReset();
    debrief.mockReset();
    getDebrief.mockReset();
    generateDebrief.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "capture-key" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders rich, evidence-backed details and visible uncertainty before saving", async () => {
    render(<WorkoutCapturePanel onSaved={() => undefined} />);

    fireEvent.change(screen.getByLabelText("What did you do?"), { target: { value: "Chest workout" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Workout Receipt" }));

    expect(await screen.findByRole("heading", { name: "Review before saving" })).toBeInTheDocument();
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Incline Smith Machine Press" })).toBeInTheDocument();
    expect(screen.getByText("Top load: 25 kg per side")).toBeInTheDocument();
    expect(screen.getByText("Back-off: 20 kg per side x 8")).toBeInTheDocument();
    expect(screen.getByText("FST-7")).toBeInTheDocument();
    expect(screen.getByText("Short rest")).toBeInTheDocument();
    expect(screen.getAllByText("Check sets and reps").length).toBeGreaterThan(0);
    expect(screen.getByText(/From your note:.*Cable flyes 10 x 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm & Save Workout" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Sets for Cable Flyes"), { target: { value: "3" } });
    expect(screen.getAllByText("Check reps").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Confirm & Save Workout" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use the values shown" }));
    expect(screen.getByRole("button", { name: "Confirm & Save Workout" })).toBeEnabled();
    await waitFor(() => expect(analyze).toHaveBeenCalledWith({ text: "Chest workout", sourceMode: "text" }));
  });

  it("shows timed-set duration in the workout receipt", async () => {
    const timedReceipt: WorkoutCaptureDraft = {
      ...receipt,
      originalInput: "plank 3 x 45 sec",
      title: "Core",
      confidence: 0.97,
      uncertainties: [],
      requiresReview: true,
      exercises: [{
        name: "Plank",
        originalText: "plank 3 x 45 sec",
        sets: 3,
        reps: null,
        load: null,
        loadUnit: null,
        durationMinutes: null,
        restSeconds: null,
        note: null,
        movementPattern: "core",
        confidence: 0.97,
        needsConfirmation: false,
        loadBasis: "unknown",
        trainingMethods: [],
        loadSteps: [],
        setDetails: [1, 2, 3].map((order) => ({
          order,
          reps: null,
          repRangeMin: null,
          repRangeMax: null,
          load: null,
          loadUnit: null,
          loadBasis: "unknown" as const,
          durationValue: 45,
          durationUnit: "seconds" as const,
          setType: "working" as const,
          rpe: null,
          rir: null,
          approximate: false,
          note: null
        })),
        uncertainFields: []
      }]
    };
    analyze.mockResolvedValueOnce({ enabled: true, draft: timedReceipt, allowance: null });

    render(<WorkoutCapturePanel onSaved={() => undefined} />);

    fireEvent.change(screen.getByLabelText("What did you do?"), { target: { value: "plank 3 x 45 sec" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Workout Receipt" }));

    expect(await screen.findByRole("heading", { name: "Plank" })).toBeInTheDocument();
    expect(screen.getByText("45 sec each set")).toBeInTheDocument();
    expect(screen.getByText("Set 1: 45 sec")).toBeInTheDocument();
    expect(screen.queryByText("Details not stated")).not.toBeInTheDocument();
  });

  it("reopens a terminal saved debrief through GET and reuses it without another request", async () => {
    recent.mockResolvedValue({
      enabled: true,
      allowance: null,
      workouts: [{
        id: "11111111-1111-4111-8111-111111111111",
        metadata: { workoutTitle: "Upper Body Strength", workoutType: "Strength", exercises: [{ name: "Bench Press" }] },
        created_at: new Date().toISOString(),
        debrief_status: "generated"
      }]
    });
    getDebrief.mockResolvedValue({
      debrief: {
        enabled: true,
        workoutEventId: "11111111-1111-4111-8111-111111111111",
        status: "generated",
        text: "Your upper body push and pull work created a useful baseline for the next comparable session.",
        fallbackText: "Workout saved.",
        source: "ai",
        cached: true
      }
    });

    render(<WorkoutCapturePanel onSaved={() => undefined} />);

    const open = await screen.findByRole("button", { name: "View Zoe review" });
    fireEvent.click(open);
    const region = await screen.findByRole("region", { name: "Coach Zoe workout debrief" });
    expect(region).toHaveAttribute("aria-busy", "false");
    expect(region).toHaveTextContent("useful baseline");
    expect(getDebrief).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Hide Zoe review" }));
    fireEvent.click(screen.getByRole("button", { name: "View Zoe review" }));
    expect(await screen.findByRole("region", { name: "Coach Zoe workout debrief" })).toHaveAttribute("aria-busy", "false");
    expect(getDebrief).toHaveBeenCalledTimes(1);
  });

  it("lets a Free member choose one recent detailed workout for Zoe review", async () => {
    const access = {
      tier: "free" as const,
      mode: "select_one" as const,
      canGenerate: true,
      dailyLimit: null,
      weeklyLimit: 1,
      dailyUsed: 0,
      weeklyUsed: 0,
      dailyRemaining: null,
      weeklyRemaining: 1,
      nextWeeklyReviewAt: null
    };
    recent.mockResolvedValue({
      enabled: true,
      allowance: null,
      debriefAccess: access,
      workouts: [{
        id: "11111111-1111-4111-8111-111111111111",
        metadata: { workoutTitle: "Upper Body Strength", exercises: [{ name: "Bench Press" }] },
        created_at: new Date().toISOString(),
        debrief_status: "available"
      }]
    });
    generateDebrief.mockResolvedValue({
      debrief: {
        enabled: true,
        workoutEventId: "11111111-1111-4111-8111-111111111111",
        status: "generated",
        text: "Your pushing work created a useful strength reference without overstating how the session felt.",
        fallbackText: "Workout saved.",
        source: "ai",
        cached: false,
        access: { ...access, canGenerate: false, weeklyUsed: 1, weeklyRemaining: 0 }
      }
    });

    render(<WorkoutCapturePanel onSaved={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask Zoe to review this workout" }));

    expect(await screen.findByText(/created a useful strength reference/i)).toBeInTheDocument();
    expect(generateDebrief).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });
});
