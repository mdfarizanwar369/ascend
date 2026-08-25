import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMyStreak: vi.fn(),
  getComplianceToday: vi.fn(),
  getFoodLogs: vi.fn(),
  getWaterLogs: vi.fn(),
  getWeightLogs: vi.fn(),
  getBurnLogs: vi.fn(),
  getProgressPhotos: vi.fn(),
  getAscendMemory: vi.fn(),
  getGoalStatus: vi.fn(),
  getMyProgressComparison: vi.fn(),
  getCoachPresence: vi.fn(),
  getLatestRecognition: vi.fn(),
  getMySubscription: vi.fn(),
  getCurrentWeeklyReport: vi.fn(),
  getMessages: vi.fn(),
  getBodyCompositionSummary: vi.fn(),
  getAllFoodLogs: vi.fn(),
  getAllWaterLogs: vi.fn(),
  getAllWeightLogs: vi.fn(),
  getAllBurnLogs: vi.fn(),
  getAllProgressPhotos: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/ascendApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ascendApi")>();
  return { ...original, ...mocks };
});

vi.mock("@/components/memory/AscendMemoryCard", () => ({
  AscendMemoryCard: () => <div>Ascend Memory detail</div>
}));

vi.mock("@/components/ProgressComparisonCard", () => ({
  ProgressComparisonCard: () => <div>Progress comparison detail</div>
}));

vi.mock("@/components/reports/WeeklyReportSummary", () => ({
  WeeklyReportSummary: () => <div>Weekly report detail</div>
}));

import { JourneyClient } from "./JourneyClient";

describe("JourneyClient compact landing experience", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMe.mockResolvedValue({
      user: {
        id: "member-1",
        name: "Alex",
        assigned_trainer_id: null,
        assigned_trainer_name: null,
        athlete_mode_enabled: false,
        body_scan_introductory_enabled: false
      }
    });
    mocks.getMyStreak.mockResolvedValue({ streak: { current: 12, best: 12, activeDaysThisWeek: 4, checkedInToday: true } });
    mocks.getComplianceToday.mockResolvedValue({ compliance: { score: 72 } });
    mocks.getFoodLogs.mockResolvedValue({
      foodLogs: [{ id: "meal-1", logged_at: "2026-08-24T09:00:00.000Z", estimated_food_name: "Chicken rice" }],
      nextOffset: 100
    });
    mocks.getWaterLogs.mockResolvedValue({
      waterLogs: [{ id: "water-1", logged_at: "2026-08-24T10:00:00.000Z", amount_ml: 750 }],
      nextOffset: 100
    });
    mocks.getWeightLogs.mockResolvedValue({
      weightLogs: [
        { id: "weight-1", logged_at: "2026-08-20T08:00:00.000Z", weight_kg: 75 },
        { id: "weight-2", logged_at: "2026-08-24T08:00:00.000Z", weight_kg: 74 }
      ],
      nextOffset: null
    });
    mocks.getBurnLogs.mockResolvedValue({
      burnLogs: [{ id: "burn-1", created_at: "2026-08-23T18:00:00.000Z", metadata: { workoutTitle: "Upper Body Strength", activityType: "Strength" } }],
      nextOffset: null
    });
    mocks.getProgressPhotos.mockResolvedValue({ progressPhotos: [], nextOffset: null });
    mocks.getAscendMemory.mockResolvedValue({
      access: "free",
      timeline: [{ milestoneKey: "streak-12", type: "streak", title: "12-day streak", subtitle: "Your longest rhythm so far.", occurredAt: "2026-08-24T12:00:00.000Z", priority: 10 }],
      stats: { aiReflectionsThisMonth: 0, monthlyLimit: 0, cacheHits: 0 }
    });
    mocks.getGoalStatus.mockResolvedValue({ goalStatus: null });
    mocks.getMyProgressComparison.mockResolvedValue({
      comparison: {
        periodDays: 30,
        daysTracked: 5,
        hasComparison: false,
        current: { weightKg: 74, momentum: 40, checkinDays: 5 },
        baseline: { weightKg: 75, momentum: 30, checkinDays: 2 },
        highlights: []
      }
    });
    mocks.getCoachPresence.mockResolvedValue({ latest: null, history: [], settings: { style: "balanced", paused: false, pauseUntil: null } });
    mocks.getLatestRecognition.mockResolvedValue({ recognition: null });
    mocks.getMySubscription.mockResolvedValue({ subscription: { plan: "free", status: "active", current_period_end: null } });
    mocks.getCurrentWeeklyReport.mockResolvedValue({ report: null });
    mocks.getMessages.mockResolvedValue({ messages: [] });
    mocks.getBodyCompositionSummary.mockResolvedValue({ summary: null });
    mocks.getAllFoodLogs.mockResolvedValue({ foodLogs: [], nextOffset: null });
    mocks.getAllWaterLogs.mockResolvedValue({ waterLogs: [], nextOffset: null });
    mocks.getAllWeightLogs.mockResolvedValue({ weightLogs: [], nextOffset: null });
    mocks.getAllBurnLogs.mockResolvedValue({ burnLogs: [], nextOffset: null });
    mocks.getAllProgressPhotos.mockResolvedValue({ progressPhotos: [], nextOffset: null });
  });

  it("keeps the summary focused and reveals historical detail only on request", async () => {
    render(<JourneyClient />);

    expect(await screen.findByText("Every small decision has brought you here.")).toBeInTheDocument();
    expect(screen.getAllByText("Biggest achievement")).toHaveLength(1);
    expect(screen.getByText("Recent Story")).toBeInTheDocument();

    const progress = screen.getByRole("button", { name: /^Progress/i });
    const memories = screen.getByRole("button", { name: /^Memories & Coaching/i });
    const fullTimeline = screen.getByRole("button", { name: /Show full timeline/i });

    expect(progress).toHaveAttribute("aria-expanded", "false");
    expect(memories).toHaveAttribute("aria-expanded", "false");
    expect(fullTimeline).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("journey-progress-details")).toHaveClass("invisible");
    expect(document.getElementById("journey-memory-details")).toHaveClass("invisible");

    fireEvent.click(progress);
    expect(progress).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("journey-progress-details")).toHaveClass("visible");

    fireEvent.click(fullTimeline);
    await waitFor(() => expect(mocks.getAllFoodLogs).toHaveBeenCalledOnce());
    expect(fullTimeline).toHaveAttribute("aria-expanded", "true");
  });
});
