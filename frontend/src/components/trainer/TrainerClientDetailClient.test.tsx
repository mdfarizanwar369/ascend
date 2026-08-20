import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getTrainerClient: vi.fn(),
  getTrainerClientFoodLogs: vi.fn(),
  getTrainerClientMessages: vi.fn(),
  getTrainerClientWeightLogs: vi.fn(),
  getTrainerClientWaterLogs: vi.fn(),
  getTrainerClientBurnLogs: vi.fn(),
  getTrainerClientMissions: vi.fn(),
  getTrainerClientCoachPresence: vi.fn(),
  getTrainerClientProgressPhotos: vi.fn(),
  getTrainerClientProgressComparison: vi.fn(),
  getTrainerClientMemory: vi.fn(),
  getTrainerClientWeeklyReport: vi.fn(),
  getTrainerClientNutritionPlan: vi.fn(),
  createTrainerClientMission: vi.fn(),
  createWeeklyCheckin: vi.fn(),
  saveTrainerClientNutritionPlan: vi.fn(),
  sendTrainerClientPraise: vi.fn(),
  sendTrainerClientMessage: vi.fn(),
  pauseTrainerClientCoachPresence: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));
vi.mock("@/components/ProfileAvatar", () => ({ ProfileAvatar: () => <span>Avatar</span> }));
vi.mock("@/components/ProgressComparisonCard", () => ({ ProgressComparisonCard: () => <div>Progress comparison loaded</div> }));
vi.mock("@/components/athlete/AthleteCoachPanel", () => ({ AthleteCoachPanel: () => <div>Athlete panel loaded</div> }));
vi.mock("@/components/reports/WeeklyReportSummary", () => ({ WeeklyReportSummary: () => <div>Weekly summary</div> }));
vi.mock("@/components/trainer/TrainerCoachingTimeline", () => ({
  buildCoachingTimelineGroups: () => [],
  CoachingTimelineGroups: () => <div>Timeline</div>
}));
vi.mock("@/components/trainer/TrainerHomeworkPanel", () => ({ TrainerHomeworkPanel: () => <div>Homework editor loaded</div> }));
vi.mock("@/lib/trainerSessionFlag", () => ({ trainerSessionCaptureEnabled: () => true }));

import { TrainerClientDetailClient } from "./TrainerClientDetailClient";

describe("TrainerClientDetailClient progressive workflow", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    api.getTrainerClient.mockResolvedValue({
      client: {
        id: "client-1",
        full_name: "Test Client",
        email: "client@example.com",
        goal_type: "fat_loss",
        gym_name: "Test Gym",
        athlete_mode_enabled: false,
        compliance_score: 62,
        nutrition_targets: { calories: 1900, proteinG: 120, carbsG: 210, fatG: 60, waterMl: 2800 }
      }
    });
    api.getTrainerClientFoodLogs.mockResolvedValue({ foodLogs: [] });
    api.getTrainerClientMessages.mockResolvedValue({
      messages: [{
        id: "message-1",
        sender_user_id: "client-1",
        receiver_user_id: "trainer-1",
        body: "Can we change tomorrow's session?",
        created_at: "2026-08-21T01:00:00.000Z",
        read_at: null
      }]
    });
    api.getTrainerClientWeightLogs.mockResolvedValue({ weightLogs: [] });
    api.getTrainerClientWaterLogs.mockResolvedValue({ waterLogs: [] });
    api.getTrainerClientBurnLogs.mockResolvedValue({ burnLogs: [] });
    api.getTrainerClientMissions.mockResolvedValue({ missions: [] });
    api.getTrainerClientCoachPresence.mockResolvedValue({
      latest: null,
      history: [],
      settings: { style: "balanced", paused: false, pauseUntil: null }
    });
    api.getTrainerClientProgressPhotos.mockResolvedValue({ progressPhotos: [] });
    api.getTrainerClientProgressComparison.mockResolvedValue({ comparison: { current: {}, previous: {}, deltas: {} } });
    api.getTrainerClientMemory.mockResolvedValue({ timeline: [] });
    api.getTrainerClientWeeklyReport.mockResolvedValue({ report: null });
    api.getTrainerClientNutritionPlan.mockResolvedValue({ coachPlan: null });
  });

  afterEach(cleanup);

  it("keeps secondary tools lazy and marks messages read only when Messages opens", async () => {
    render(<TrainerClientDetailClient clientId="client-1" />);

    expect(await screen.findByText("Test Client")).toBeInTheDocument();
    await waitFor(() => expect(api.getTrainerClientMessages).toHaveBeenCalledWith("client-1", { markRead: false }));

    expect(api.getTrainerClientProgressPhotos).not.toHaveBeenCalled();
    expect(screen.queryByText("Homework editor loaded")).not.toBeInTheDocument();
    expect(screen.queryByText("Athlete panel loaded")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Messages/i }));
    await waitFor(() => expect(api.getTrainerClientMessages).toHaveBeenCalledWith("client-1", { markRead: true }));

    fireEvent.click(screen.getByRole("button", { name: /Progress Photos/i }));
    await waitFor(() => {
      expect(api.getTrainerClientProgressPhotos).toHaveBeenCalledTimes(1);
      expect(api.getTrainerClientProgressComparison).toHaveBeenCalledTimes(1);
    });
  });
});
