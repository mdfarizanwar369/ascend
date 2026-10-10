import { beforeEach, describe, expect, it } from "vitest";
import type { DailyWorkout, GeneratedWorkout } from "@/lib/ascendApi";
import {
  clearWorkoutSessionDraft,
  readWorkoutSessionDraft,
  workoutProgressForPlan,
  writeWorkoutSessionDraft
} from "./workoutSessionDraft";

const workout: GeneratedWorkout = {
  title: "Resume me",
  intro: "Keep going.",
  estimatedDurationMinutes: 20,
  focus: "Strength",
  intensity: "moderate",
  warmup: ["Walk"],
  exercises: [
    { name: "Bodyweight Squat", sets: 2, reps: "10" },
    { name: "Dumbbell Row", sets: 2, reps: "10" }
  ],
  cooldown: ["Breathe"],
  coachTip: "Move well.",
  disclaimer: "Stop if you feel pain.",
  experienceVersion: 2
};

function saveDraft(ownerUid: string, expiresAt: string) {
  writeWorkoutSessionDraft(ownerUid, {
    workoutCompletionKey: "plan-one",
    workout,
    answers: { location: "home", timeAvailable: "20", goal: "strength", equipment: "Dumbbells" },
    checkedExerciseIndexes: [0],
    observedExercises: {
      0: { sets: "2", reps: "10", load: "12", loadUnit: "kg", durationMinutes: "", durationSeconds: "" }
    },
    effortRating: "about_right",
    actualWorkoutMinutes: "14",
    showWorkoutDetails: true,
    expiresAt
  });
}

beforeEach(() => window.localStorage.clear());

describe("workout session drafts", () => {
  it("keeps progress private to the signed-in account", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    saveDraft("member-one", expiresAt);

    expect(readWorkoutSessionDraft("member-one")?.checkedExerciseIndexes).toEqual([0]);
    expect(readWorkoutSessionDraft("member-one")?.observedExercises[0]?.load).toBe("12");
    expect(readWorkoutSessionDraft("member-two")).toBeNull();
  });

  it("removes expired and corrupt drafts instead of restoring them", () => {
    const now = Date.now();
    saveDraft("expired-member", new Date(now - 1).toISOString());
    window.localStorage.setItem("ascend:zoe-workout-session:v1:corrupt-member", "not-json");

    expect(readWorkoutSessionDraft("expired-member", now)).toBeNull();
    expect(readWorkoutSessionDraft("corrupt-member", now)).toBeNull();
    expect(window.localStorage.getItem("ascend:zoe-workout-session:v1:expired-member")).toBeNull();
    expect(window.localStorage.getItem("ascend:zoe-workout-session:v1:corrupt-member")).toBeNull();
  });

  it("restores checks only while the server plan still has the same exercise in that position", () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    saveDraft("member-one", expiresAt);
    const draft = readWorkoutSessionDraft("member-one");
    const daily: DailyWorkout = {
      workout: { ...workout, exercises: [{ name: "Incline Push-Up", sets: 2, reps: "10" }, workout.exercises[1]] },
      workoutCompletionKey: "plan-one",
      resetsAt: expiresAt,
      completed: false,
      request: { location: "home", timeAvailable: "20", goal: "strength", equipment: "Dumbbells" }
    };

    expect(workoutProgressForPlan(draft, daily)?.checkedExerciseIndexes).toEqual([]);
    clearWorkoutSessionDraft("member-one");
    expect(readWorkoutSessionDraft("member-one")).toBeNull();
  });
});
