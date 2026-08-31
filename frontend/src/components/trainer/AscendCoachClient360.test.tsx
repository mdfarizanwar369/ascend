import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Client360Snapshot, Client360View } from "@ascend/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getAscendCoachClients: vi.fn(),
  getClient360: vi.fn(),
  refreshCoachInsight: vi.fn()
}));
vi.mock("@/lib/ascendCoachApi", () => api);

import { AscendCoachClientList } from "./AscendCoachClientList";
import { Client360Client } from "./Client360Client";

const fullSnapshot: Client360Snapshot = {
  version: "client_360_snapshot_v1",
  clientId: "10000000-0000-4000-8000-000000000001",
  generatedAt: "2026-09-01T00:00:00.000Z",
  access: {
    mode: "relationship", relationshipId: "20000000-0000-4000-8000-000000000001", relationshipStatus: "active", authorizationVersion: 3,
    sections: {
      profile: { state: "granted", requiredScope: "profile" }, training: { state: "granted", requiredScope: "training" },
      nutrition: { state: "granted", requiredScope: "nutrition" }, bodyProgress: { state: "granted", requiredScope: "body" }, activity: { state: "granted", requiredScope: "recovery" }
    }
  },
  profile: { displayName: "A Very Long Client Name That Must Wrap Safely On A Phone", goal: "fat_loss", activityLevel: "moderate" },
  training: {
    completedWorkouts: { last7Days: 3, last30Days: 10, last90Days: 28 }, averageSessionsPerWeek30d: 2.33, activeWeeks8: 7,
    loggingConsistency8w: { value: 0.875, sampleSize: 8, windowDays: 56, sufficientData: true }, lastWorkoutAt: "2026-08-31T00:00:00.000Z",
    averageDurationMinutes30d: { value: 50, sampleSize: 8, windowDays: 30, sufficientData: true },
    frequencyTrend: { direction: "stable", ratePerWeek: 0, sampleSize: 16, windowDays: 56, observedSpanDays: 56, sufficientData: true },
    recentWorkouts: [{ id: "w1", completedAt: "2026-08-31T00:00:00.000Z", title: "Full Body", workoutType: "strength", durationMinutes: 50, exerciseCount: 5, recordedSets: 15, source: "generated", debriefAvailable: true }],
    exerciseProgression: { identityBasis: "progression_v3_exact_key", items: [] }
  },
  nutrition: {
    targets: { calories: 1800, proteinG: 120, source: "ascend_recommendation", calorieRangeRatio: { minimum: 0.9, maximum: 1.1 } },
    last7Days: { daysLogged: 5, loggingCoverage: { value: 0.714, sampleSize: 7, windowDays: 7, sufficientData: true }, averageCaloriesPerLoggedDay: { value: 1820, sampleSize: 5, windowDays: 7, sufficientData: true }, averageProteinGPerLoggedDay: { value: 108, sampleSize: 5, windowDays: 7, sufficientData: true }, calorieWithinTargetDays: { value: 0.8, sampleSize: 5, windowDays: 7, sufficientData: true }, proteinTargetMetDays: { value: 0.4, sampleSize: 5, windowDays: 7, sufficientData: true } },
    last30Days: { daysLogged: 20, loggingCoverage: { value: 0.667, sampleSize: 30, windowDays: 30, sufficientData: true }, averageCaloriesPerLoggedDay: { value: 1810, sampleSize: 20, windowDays: 30, sufficientData: true }, averageProteinGPerLoggedDay: { value: 110, sampleSize: 20, windowDays: 30, sufficientData: true }, calorieWithinTargetDays: { value: 0.75, sampleSize: 20, windowDays: 30, sufficientData: true }, proteinTargetMetDays: { value: 0.45, sampleSize: 20, windowDays: 30, sufficientData: true } },
    targetEvaluationBasis: "logged_days_only"
  },
  bodyProgress: {
    weight: { currentKg: 70, currentRecordedAt: "2026-08-30T00:00:00.000Z", change7dKg: { value: -0.2, sampleSize: 3, windowDays: 7, sufficientData: true, observedSpanDays: 6 }, change30dKg: { value: -1, sampleSize: 8, windowDays: 30, sufficientData: true, observedSpanDays: 28 }, change90dKg: { value: null, sampleSize: 8, windowDays: 90, sufficientData: false, observedSpanDays: 28 }, trend28d: { direction: "decreasing", ratePerWeek: -0.25, sampleSize: 8, windowDays: 28, observedSpanDays: 28, sufficientData: true } },
    bodyComposition: { scanCount: 1, latestScanAt: "2026-08-20T00:00:00.000Z", previousScanAt: null, evidenceStatus: "PROVISIONAL", latest: { weightKg: 70, bodyFatPercent: 28, leanBodyMassKg: 50, skeletalMuscleMassKg: 25 }, establishedChanges: [] }
  },
  activity: { connected: true, lastSyncedAt: "2026-08-31T20:00:00.000Z", todaySteps: 5000, averageSteps7d: { value: 7200, sampleSize: 7, windowDays: 7, sufficientData: true }, exerciseSessions7d: 2, lastExerciseSessionAt: "2026-08-31T00:00:00.000Z" },
  coachingSignals: [
    { code: "PROTEIN_TARGET_FREQUENTLY_MISSED", severity: "attention", sourceSection: "nutrition", evidence: { targetMetRate: 0.4, loggedDays: 5, minimumRate: 0.5 } },
    { code: "TRAINING_LOGGING_CONSISTENT", severity: "positive", sourceSection: "training", evidence: { activeWeeks: 7, windowWeeks: 8, thresholdActiveWeeks: 6 } }
  ],
  freshness: { generatedAt: "2026-09-01T00:00:00.000Z", latestWorkoutAt: "2026-08-31T00:00:00.000Z", latestNutritionLogAt: "2026-08-31", latestWeightAt: "2026-08-30T00:00:00.000Z", latestScanAt: "2026-08-20T00:00:00.000Z", activityLastSyncedAt: "2026-08-31T20:00:00.000Z" }
};

const cachedInsight = {
  status: "available" as const, source: "cache" as const,
  insight: { summary: "Training is being recorded consistently, while protein target frequency is the clearest current area for trainer review. Weight is trending downward across sufficient recent measurements, and activity data is current. Consider discussing repeatable protein choices with the client before making broader changes, while continuing to monitor how training and body-weight evidence develop.", priorities: [{ title: "Review protein consistency", reason: "Protein target was met on 40% of logged days.", signalCodes: ["PROTEIN_TARGET_FREQUENTLY_MISSED" as const] }], dataCaveats: ["Body composition change is provisional."] },
  generatedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-09-08T00:00:00.000Z", promptVersion: "coach-insight-v1" as const, provider: "openai", model: "gpt-test"
};

beforeEach(() => {
  vi.clearAllMocks();
  api.getAscendCoachClients.mockResolvedValue({ clients: [] });
  api.getClient360.mockResolvedValue({ snapshot: fullSnapshot, coachInsight: cachedInsight } satisfies Client360View);
  api.refreshCoachInsight.mockResolvedValue({ coachInsight: { ...cachedInsight, source: "generated" } });
});
afterEach(cleanup);

describe("Ascend Coach client list", () => {
  it("loads one bounded list and links an authorized client to Client 360", async () => {
    api.getAscendCoachClients.mockResolvedValue({ clients: [{ clientId: fullSnapshot.clientId, relationshipId: "relationship", relationshipStatus: "active", authorizationVersion: 3, grantedScopes: ["profile", "training"], displayName: "Client A", goal: "fat_loss", lastWorkoutAt: "2026-08-31T00:00:00.000Z" }] });
    render(<AscendCoachClientList />);
    const link = await screen.findByRole("link", { name: /Client A/i });
    expect(link).toHaveAttribute("href", `/trainer/clients/${fullSnapshot.clientId}/360`);
    expect(api.getAscendCoachClients).toHaveBeenCalledTimes(1);
    expect(api.getClient360).not.toHaveBeenCalled();
  });

  it("shows a useful empty state", async () => {
    render(<AscendCoachClientList />);
    expect(await screen.findByText("No active clients")).toBeInTheDocument();
  });
});

describe("Client 360 UI", () => {
  it("shows the ten-second summary, deterministic signals, sections, and cached insight with zero generation calls", async () => {
    render(<Client360Client clientId={fullSnapshot.clientId} />);
    expect(await screen.findByText(fullSnapshot.profile!.displayName)).toBeInTheDocument();
    expect(screen.getAllByText(/Protein target was met on 40%/i)).toHaveLength(2);
    expect(screen.getByText(/Training is being recorded consistently/i)).toBeInTheDocument();
    expect(screen.getByText("Training logging consistency")).toBeInTheDocument();
    expect(screen.queryByText(/program adherence/i)).not.toBeInTheDocument();
    expect(api.refreshCoachInsight).not.toHaveBeenCalled();
    expect(document.querySelector("table")).toBeNull();
  });

  it("makes one provider-backed request only after explicit refresh", async () => {
    render(<Client360Client clientId={fullSnapshot.clientId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh Zoe insight" }));
    await waitFor(() => expect(api.refreshCoachInsight).toHaveBeenCalledTimes(1));
  });

  it("shows scope states without hidden metrics and respects insufficient data", async () => {
    const sparse: Client360Snapshot = {
      ...fullSnapshot,
      nutrition: undefined, bodyProgress: undefined, activity: undefined,
      access: { ...fullSnapshot.access, sections: { ...fullSnapshot.access.sections, nutrition: { state: "not_granted", requiredScope: "nutrition" }, bodyProgress: { state: "not_granted", requiredScope: "body" }, activity: { state: "not_granted", requiredScope: "recovery" } } },
      training: { ...fullSnapshot.training!, loggingConsistency8w: { value: 0, sampleSize: 8, windowDays: 56, sufficientData: false }, frequencyTrend: { direction: "insufficient", ratePerWeek: null, sampleSize: 1, windowDays: 56, observedSpanDays: 7, sufficientData: false } },
      freshness: { generatedAt: fullSnapshot.generatedAt, latestWorkoutAt: fullSnapshot.training!.lastWorkoutAt }
    };
    api.getClient360.mockResolvedValue({ snapshot: sparse, coachInsight: { status: "not_available", reason: "not_generated" } });
    render(<Client360Client clientId={sparse.clientId} />);
    expect(await screen.findAllByText("Not enough data yet")).not.toHaveLength(0);
    expect(screen.getByText("Nutrition data is not shared with this trainer.")).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("keeps deterministic page handling separate from Zoe refresh failure", async () => {
    api.refreshCoachInsight.mockRejectedValue(new Error("provider timeout"));
    render(<Client360Client clientId={fullSnapshot.clientId} />);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh Zoe insight" }));
    expect(await screen.findByText(/Zoe insight isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByText("Current state")).toBeInTheDocument();
  });

  it.each([320, 375, 768, 1280])("keeps the card layout responsive at %ipx", async (width) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
    render(<Client360Client clientId={fullSnapshot.clientId} />);
    const heading = await screen.findByRole("heading", { name: fullSnapshot.profile!.displayName });
    expect(heading).toHaveClass("break-words");
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("[class*='min-w-[']")).toBeNull();
  });

  it("marks break-glass access and does not offer persistent Zoe generation", async () => {
    const elevated: Client360Snapshot = {
      ...fullSnapshot,
      access: {
        ...fullSnapshot.access,
        mode: "break_glass",
        relationshipId: null,
        relationshipStatus: null,
        authorizationVersion: null,
        sections: Object.fromEntries(Object.entries(fullSnapshot.access.sections).map(([key, value]) => [key, { ...value, state: "break_glass" }])) as never
      }
    };
    api.getClient360.mockResolvedValue({ snapshot: elevated, coachInsight: { status: "not_available", reason: "elevated_access" } });
    render(<Client360Client clientId={elevated.clientId} />);
    expect(await screen.findByText(/Elevated access is active and audited/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zoe insight/i })).not.toBeInTheDocument();
  });
});
