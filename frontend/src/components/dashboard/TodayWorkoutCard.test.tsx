import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

  it("shows completion without offering to generate another plan", () => {
    render(<TodayWorkoutCard dailyWorkout={null} draft={null} completedWorkout={{ title: "Balanced full body", durationMinutes: 28 }} />);
    expect(screen.getByText("Workout completed")).toBeInTheDocument();
    expect(screen.getByText("Done for today")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
