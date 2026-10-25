import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DailyWorkout } from "@/lib/ascendApi";
import type { WorkoutSessionDraft } from "@/lib/workoutSessionDraft";
import { TodayWorkoutCard } from "./TodayWorkoutCard";

afterEach(cleanup);

const dailyWorkout: DailyWorkout = {
  workoutCompletionKey: "today-key",
  resetsAt: "2026-10-11T00:00:00.000Z",
  completed: false,
  request: { location: "home", timeAvailable: "30", goal: "general_fitness", equipment: "Dumbbells" },
  workout: {
    title: "Balanced full body",
    intro: "A balanced session.",
    estimatedDurationMinutes: 30,
    focus: "Full body",
    intensity: "moderate",
    warmup: ["March"],
    exercises: [{ name: "Squat" }, { name: "Row" }, { name: "Press" }],
    cooldown: ["Breathe"],
    coachTip: "Move well.",
    disclaimer: "Stop if needed."
  }
};

function draft(checkedExerciseIndexes: number[]): WorkoutSessionDraft {
  return {
    version: 1,
    workoutCompletionKey: dailyWorkout.workoutCompletionKey,
    workout: dailyWorkout.workout,
    answers: dailyWorkout.request,
    checkedExerciseIndexes,
    observedExercises: {},
    effortRating: null,
    actualWorkoutMinutes: "",
    showWorkoutDetails: false,
    savedAt: "2026-10-10T08:00:00.000Z",
    expiresAt: "2026-10-11T00:00:00.000Z"
  };
}

describe("Today workout card", () => {
  it("opens a new workout directly when no plan exists", () => {
    render(<TodayWorkoutCard dailyWorkout={null} draft={null} completedWorkout={null} />);
    expect(screen.getByText("Ready when you are")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Build my workout/ })).toHaveAttribute("href", "/coach?workout=1");
  });

  it("shows a generated plan without starting it", () => {
    render(<TodayWorkoutCard dailyWorkout={dailyWorkout} draft={draft([])} completedWorkout={null} />);
    expect(screen.getByText("Your workout is ready")).toBeInTheDocument();
    expect(screen.getByText("30 min · Full body · Dumbbells")).toBeInTheDocument();
    expect(screen.getByText("Start workout")).toBeInTheDocument();
  });

  it("shows saved progress for an interrupted workout", () => {
    render(<TodayWorkoutCard dailyWorkout={dailyWorkout} draft={draft([0, 1])} completedWorkout={null} />);
    expect(screen.getByText("Continue your workout")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 exercises completed")).toBeInTheDocument();
  });

  it("does not offer a dismissed free workout, even when an old draft has checked progress", () => {
    render(<TodayWorkoutCard dailyWorkout={{ ...dailyWorkout, dismissed: true }} draft={draft([0, 1])} completedWorkout={null} />);
    expect(screen.getByRole("region", { name: "Today’s workout dismissed" })).toBeInTheDocument();
    expect(screen.getByText("Workout dismissed")).toBeInTheDocument();
    expect(screen.getByText("No workout is active. You can return to Zoe anytime.")).toBeInTheDocument();
    expect(screen.getByText("Dismissed for today")).toBeInTheDocument();
    expect(screen.queryByText("Continue your workout")).not.toBeInTheDocument();
    expect(screen.queryByText("Done for today")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not present a dismissed plan as ready without a draft", () => {
    render(<TodayWorkoutCard dailyWorkout={{ ...dailyWorkout, dismissed: true }} draft={null} completedWorkout={null} />);
    expect(screen.getByText("Workout dismissed")).toBeInTheDocument();
    expect(screen.queryByText("Your workout is ready")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a neutral retry and Zoe link when the first workout lookup fails", () => {
    const retry = vi.fn();
    render(<TodayWorkoutCard dailyWorkout={null} draft={draft([0, 1])} completedWorkout={null} errorState="initial" onRetry={retry} />);
    expect(screen.getByRole("region", { name: "Today’s workout unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Your saved workout status is unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByText("Continue your workout")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Coach Zoe" })).toHaveAttribute("href", "/coach?workout=1");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("preserves the last checked workout and offers retry after a refresh failure", () => {
    const retry = vi.fn();
    render(<TodayWorkoutCard dailyWorkout={dailyWorkout} draft={draft([0])} completedWorkout={null} errorState="refresh" onRetry={retry} />);
    expect(screen.getByText("Continue your workout")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 exercises completed")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't refresh. Showing the last checked workout.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows completion without offering to generate another plan", () => {
    render(<TodayWorkoutCard dailyWorkout={null} draft={null} completedWorkout={{ title: "Balanced full body", durationMinutes: 28 }} />);
    expect(screen.getByText("Workout completed")).toBeInTheDocument();
    expect(screen.getByText("Done for today")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
