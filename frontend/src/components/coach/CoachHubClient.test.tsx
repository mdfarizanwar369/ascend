import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyWorkout } from "@/lib/ascendApi";

const mocks = vi.hoisted(() => ({ ios: true, today: vi.fn(), generate: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/appEdition", () => ({ useIosFreeEdition: () => mocks.ios, useIosApp: () => mocks.ios }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/ExperienceVisuals", () => ({ ZoeAvatar: () => null, StaggerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/accountSession", () => ({ loadAccountProfile: async () => ({ isPlatformOwner: false }) }));
vi.mock("@/lib/dataSync", () => ({ rememberDashboardRecord: vi.fn() }));
vi.mock("@/lib/ascendApi", () => ({
  getTodayWorkout: mocks.today, generateTodayWorkout: mocks.generate, saveCompletedWorkout: mocks.save,
  getCoachPresence: async () => ({ latest: null }), getMyStreak: async () => ({ streak: { current: 0 } }),
  getBurnLogs: async () => ({ burnLogs: [] }), getFoodLogs: async () => ({ foodLogs: [] }),
  getHealthSyncStatus: async () => ({ status: {} }), getGoalStatus: async () => ({}), getAscendMemory: async () => ({ timeline: [] })
}));
import { CoachHubClient } from "./CoachHubClient";

const daily: DailyWorkout = {
  workoutCompletionKey: "saved-server-key", completed: false, resetsAt: "2026-09-23T16:00:00Z",
  request: { location: "home", timeAvailable: "20", goal: "mobility", equipment: "Bodyweight" },
  workout: {
    title: "Home mobility", intro: "A gentle session.", estimatedDurationMinutes: 20, intensity: "easy", focus: "Mobility",
    warmup: ["Walk gently"], exercises: [{ name: "Gentle walk", duration: "10 minutes" }],
    cooldown: ["Breathe slowly"], coachTip: "Move comfortably.", disclaimer: "Stop if you experience pain."
  }
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.ios = true;
  mocks.today.mockResolvedValue({ dailyWorkout: null });
  mocks.generate.mockResolvedValue({ workout: daily.workout, dailyWorkout: daily });
});
afterEach(cleanup);

async function chooseWorkout() {
  fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
  fireEvent.click(await screen.findByRole("button", { name: "Home" }));
  fireEvent.click(screen.getByRole("button", { name: "20 minutes" }));
  fireEvent.click(screen.getByRole("button", { name: "Mobility" }));
  fireEvent.click(screen.getByRole("button", { name: "Bodyweight" }));
}
describe("iPhone daily workout builder", () => {
  it("creates one daily workout then reopens it from the server without regenerating", async () => {
    const page = render(<CoachHubClient />);
    await chooseWorkout();
    expect(await screen.findByRole("heading", { name: "Home mobility" })).toBeInTheDocument();
    expect(screen.getByText(/1 free workout per day/)).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledOnce();
    page.unmount();
    mocks.today.mockResolvedValue({ dailyWorkout: daily });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByRole("heading", { name: "Home mobility" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
  it("keeps completed server workouts read-only after reopening", async () => {
    mocks.today.mockResolvedValue({ dailyWorkout: { ...daily, completed: true } });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByText("This workout is already saved in your activity log.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark incomplete: Gentle walk" })).toBeDisabled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("allows retry after a generation failure", async () => {
    mocks.generate.mockRejectedValueOnce(new Error("Zoe is busy. Please retry."));
    render(<CoachHubClient />);
    await chooseWorkout();
    expect(await screen.findByText("Zoe is busy. Please retry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bodyweight" }));
    expect(await screen.findByRole("heading", { name: "Home mobility" })).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  });
  it("does not open a new planner if loading today's workout fails", async () => {
    mocks.today.mockRejectedValueOnce(new Error("Connection unavailable"));
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByText("Connection unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("keeps regeneration available on web and Android", async () => {
    mocks.ios = false;
    render(<CoachHubClient />);
    await chooseWorkout();
    await screen.findByRole("heading", { name: "Home mobility" });
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument());
    expect(mocks.today).not.toHaveBeenCalled();
    expect(screen.queryByText(/1 free workout per day/)).not.toBeInTheDocument();
  });
});
