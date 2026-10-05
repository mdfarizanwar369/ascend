import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyWorkout } from "@/lib/ascendApi";

const mocks = vi.hoisted(() => ({ ios: true, visuals: false, workoutV2: false, today: vi.fn(), generate: vi.fn(), save: vi.fn(), swap: vi.fn() }));
vi.mock("@/lib/appEdition", () => ({ useIosFreeEdition: () => mocks.ios, useIosApp: () => mocks.ios }));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/ExperienceVisuals", () => ({ ZoeAvatar: () => null, StaggerItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/accountSession", () => ({
  loadAccountProfile: async () => ({ isPlatformOwner: false, roles: [], exerciseVisualsEnabled: false })
}));
vi.mock("@/lib/dataSync", () => ({ rememberDashboardRecord: vi.fn() }));
vi.mock("@/lib/ascendApi", () => ({
  getTodayWorkout: mocks.today, generateTodayWorkout: mocks.generate, saveCompletedWorkout: mocks.save, swapTodayWorkoutExercise: mocks.swap,
  getWorkoutVisualAccess: async () => ({ enabled: mocks.visuals, workoutEngineV2Enabled: mocks.workoutV2 }),
  recordWorkoutVisualEvent: vi.fn().mockResolvedValue(undefined),
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
  vi.clearAllMocks(); mocks.ios = true; mocks.visuals = false; mocks.workoutV2 = false;
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
  it("shows precise equipment choices only when the V2 planner is enabled for this account", async () => {
    const page = render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hotel" }));
    fireEvent.click(screen.getByRole("button", { name: "20 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: "Mobility" }));
    expect(screen.getByRole("button", { name: "Resistance Bands" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Long Resistance Band" })).not.toBeInTheDocument();
    page.unmount();

    mocks.workoutV2 = true;
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Hotel Room" }));
    fireEvent.click(screen.getByRole("button", { name: "20 minutes" }));
    fireEvent.click(screen.getByRole("button", { name: "Mobility" }));
    expect(screen.getByRole("button", { name: "Long Resistance Band" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resistance Bands" })).not.toBeInTheDocument();
  });
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
  it("opens a historical mixed workout with one visual and unchanged text-only exercise", async () => {
    mocks.visuals = true;
    mocks.today.mockResolvedValue({ dailyWorkout: {
      ...daily, workout: { ...daily.workout, exercises: [
        { name: "Glute Bridge", sets: 3, reps: "12", note: "Original saved note" },
        { name: "Goblet Squat", sets: 2, reps: "10", note: "Use a dumbbell" }
      ] }
    } });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByText("Original Ascend exercise visual")).toBeInTheDocument();
    expect(screen.getByText("Original saved note")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Goblet Squat/ }).find(button => button.hasAttribute("aria-expanded"))!);
    expect(screen.getByText("Use a dumbbell")).toBeInTheDocument();
    expect(screen.queryByText("Original Ascend exercise visual")).not.toBeInTheDocument();
  });
  it("keeps exercise visuals hidden for accounts outside the pilot", async () => {
    mocks.today.mockResolvedValue({ dailyWorkout: {
      ...daily, workout: { ...daily.workout, exercises: [{ name: "Glute Bridge", sets: 3, reps: "12" }] }
    } });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByRole("heading", { name: "Home mobility" })).toBeInTheDocument();
    expect(screen.queryByText("Original Ascend exercise visual")).not.toBeInTheDocument();
  });
  it("shows pictures and full instructions for an older saved V2 workout even without the visual pilot", async () => {
    mocks.visuals = false;
    mocks.today.mockResolvedValue({ dailyWorkout: {
      ...daily, workout: { ...daily.workout, experienceVersion: 2, exercises: [
        { name: "Leg Press", sets: 2, reps: "10-12", note: "Do not lock your knees." },
        { name: "Dumbbell Row", sets: 2, reps: "8-12 each side" }
      ] }
    } });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByText("Illustrated variation: 45-Degree Leg Press")).toBeInTheDocument();
    expect(screen.getByText(/Sit in the sled with feet on the platform/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Dumbbell Row/ }).find(button => button.hasAttribute("aria-expanded"))!);
    expect(screen.getByText("Illustrated variation: Single-Arm Dumbbell Row")).toBeInTheDocument();
    expect(screen.getByText(/Pull one dumbbell toward your hip/)).toBeInTheDocument();
  });
  it("shows the V2 roadmap and saves an iPhone swap without generating again", async () => {
    const v2Daily: DailyWorkout = { ...daily, workout: {
      ...daily.workout, experienceVersion: 2, whyToday: "Your last session was lower body.",
      sessionRoadmap: [{ step: "Today", focus: "Upper body" }, { step: "Next", focus: "Lower body" }, { step: "Then", focus: "Recovery" }],
      exercises: [{ name: "Wall Push-Up", sets: 2, reps: "10", alternatives: [{ name: "Incline Push-Up", sets: 2, reps: "8" }] }]
    } };
    mocks.today.mockResolvedValue({ dailyWorkout: v2Daily });
    mocks.swap.mockResolvedValue({ dailyWorkout: { ...v2Daily, workout: { ...v2Daily.workout, exercises: [{ name: "Incline Push-Up", sets: 2, reps: "8", alternatives: [{ name: "Wall Push-Up", sets: 2, reps: "10" }] }] } } });
    render(<CoachHubClient />);
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    expect(await screen.findByText("Your last session was lower body.")).toBeInTheDocument();
    expect(screen.getByLabelText("Training roadmap")).toHaveTextContent("Upper body");
    fireEvent.click(screen.getByRole("button", { name: "Swap exercise" }));
    expect(await screen.findByText("Incline Push-Up")).toBeInTheDocument();
    expect(mocks.swap).toHaveBeenCalledWith("saved-server-key", 0);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("refreshes V2 exercises locally on web without another Gemini request", async () => {
    mocks.ios = false;
    mocks.generate.mockResolvedValue({ workout: { ...daily.workout, experienceVersion: 2, exercises: [{
      name: "Wall Push-Up", sets: 2, reps: "10", alternatives: [{ name: "Incline Push-Up", sets: 2, reps: "8" }]
    }] } });
    render(<CoachHubClient />);
    await chooseWorkout();
    expect(await screen.findByText("Wall Push-Up")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate Today's Workout" }));
    fireEvent.click(await screen.findByRole("button", { name: "Refresh exercises" }));
    expect(await screen.findByText("Incline Push-Up")).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledOnce();
  });
});
