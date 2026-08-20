import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutCaptureDraft } from "@ascend/shared";

const { analyze, recent, progression, save } = vi.hoisted(() => ({
  analyze: vi.fn(),
  recent: vi.fn(),
  progression: vi.fn(),
  save: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => ({
  analyzeWorkoutCapture: analyze,
  getRecentDetailedWorkouts: recent,
  getWorkoutProgressionHistory: progression,
  saveCapturedWorkout: save
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
      originalText: "Additional chest isolation work",
      sets: null,
      reps: null,
      load: null,
      loadUnit: null,
      durationMinutes: null,
      restSeconds: null,
      note: "Additional chest isolation work",
      movementPattern: "push",
      confidence: 0.62,
      needsConfirmation: true,
      section: "Chest",
      loadBasis: "unknown",
      trainingMethods: [],
      loadSteps: [],
      setDetails: [],
      uncertainFields: ["sets", "reps", "load"]
    }
  ]
};

describe("Detailed Workout receipt", () => {
  beforeEach(() => {
    analyze.mockReset().mockResolvedValue({ enabled: true, draft: receipt, allowance: null });
    recent.mockReset().mockResolvedValue({ enabled: true, workouts: [], allowance: null });
    progression.mockReset().mockResolvedValue({ enabled: true, history: [] });
    save.mockReset();
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
    expect(screen.getByText("No sets, reps, or load were stated.")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByText(/From your note:.*Additional chest isolation work/)).toBeInTheDocument();
    await waitFor(() => expect(analyze).toHaveBeenCalledWith({ text: "Chest workout", sourceMode: "text" }));
  });
});
