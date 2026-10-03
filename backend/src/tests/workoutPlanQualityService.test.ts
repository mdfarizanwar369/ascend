import { describe, expect, it } from "vitest";
import { applyWorkoutBlueprint, buildWorkoutBlueprint, rotateWorkoutExercise, summarizeWorkoutExerciseHistory, workoutEngineV2Enabled } from "../services/workoutPlanQualityService";
import type { CoachWorkoutPlan } from "../integrations/openai";

const base = { goal: "strength", location: "home", equipment: "Bodyweight", timeAvailable: "30", today: "2026-10-03" };
const plan: CoachWorkoutPlan = {
  title: "A session", intro: "Let's move.", estimatedDurationMinutes: 30, focus: "Full body", intensity: "moderate",
  warmup: ["Easy walk"], exercises: [{ name: "AI choice", sets: 3, reps: "10" }], cooldown: ["Breathe"],
  coachTip: "Move well.", disclaimer: "Stop if you feel pain."
};

describe("Zoe workout engine V2", () => {
  it("stays off for everyone by default and only runs on Gemini", () => {
    expect(workoutEngineV2Enabled({ globallyEnabled: false, ownerPilotEnabled: false, isPlatformOwner: true, provider: "gemini" })).toBe(false);
    expect(workoutEngineV2Enabled({ globallyEnabled: false, ownerPilotEnabled: true, isPlatformOwner: false, provider: "gemini" })).toBe(false);
    expect(workoutEngineV2Enabled({ globallyEnabled: false, ownerPilotEnabled: true, isPlatformOwner: true, provider: "gemini" })).toBe(true);
    expect(workoutEngineV2Enabled({ globallyEnabled: true, ownerPilotEnabled: true, isPlatformOwner: true, provider: "openai" })).toBe(false);
  });

  it("reads saved exercise names, keeps evidence honest, and rotates away from yesterday's lower-body session", () => {
    const recentWorkouts = [{
      metadata: { exercises: [{ name: "Goblet Squat" }, { name: "Dumbbell Romanian Deadlift" }, { name: "Reverse Lunge" }], evidenceType: "completed_plan" },
      created_at: "2026-10-02T08:00:00.000Z"
    }];
    const history = summarizeWorkoutExerciseHistory(recentWorkouts);
    expect(history[0]).toMatchObject({ names: ["Goblet Squat", "Dumbbell Romanian Deadlift", "Reverse Lunge"], evidence: "completed" });
    const blueprint = buildWorkoutBlueprint({ ...base, recentWorkouts });
    expect(blueprint.focus).toContain("Upper body");
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Goblet Squat");
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Dumbbell Romanian Deadlift");
    expect(new Set(blueprint.exercises.map(exercise => exercise.name)).size).toBe(blueprint.exercises.length);
    expect(blueprint.whyToday).toContain("last session");
  });

  it("prescribes recovery after a same-day workout and after a too-hard previous day", () => {
    const recentWorkouts = [{
      metadata: { exercises: [{ name: "Push-Up" }], effortRating: "too_hard" },
      created_at: "2026-10-03T08:00:00.000Z"
    }];
    const today = buildWorkoutBlueprint({ ...base, recentWorkouts });
    expect(today.focus).toBe("Recovery and mobility");
    const checked = applyWorkoutBlueprint(plan, today);
    expect(checked.intensity).toBe("easy");
    expect(checked.exercises.map(exercise => exercise.name)).not.toContain("AI choice");
    expect(checked.experienceVersion).toBe(2);
    const yesterday = buildWorkoutBlueprint({ ...base, recentWorkouts: [{ ...recentWorkouts[0], created_at: "2026-10-02T08:00:00.000Z" }] });
    expect(yesterday.focus).toBe("Recovery and mobility");
  });

  it("uses recent effort conservatively and ignores stale effort", () => {
    const recentWorkouts = [{ metadata: { exercises: [{ name: "Goblet Squat" }], effortRating: "too_easy" }, created_at: "2026-10-02T08:00:00.000Z" }];
    const ready = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts });
    expect(ready.exercises.filter(exercise => exercise.sets).every(exercise => exercise.sets === 4)).toBe(true);
    expect(ready.whyToday).toContain("adds a little volume");
    const conservative = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts, conservative: true });
    expect(conservative.exercises.filter(exercise => exercise.sets).every(exercise => exercise.sets === 2)).toBe(true);
    const stale = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts: [{ ...recentWorkouts[0], created_at: "2026-09-01T08:00:00.000Z" }] });
    expect(stale.whyToday).not.toContain("last workout felt too easy");
  });

  it("does not prescribe gym or household equipment for an outdoor bodyweight request", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", recentWorkouts: [] });
    const allChoices = blueprint.exercises.flatMap(exercise => [exercise, ...(exercise.alternatives ?? [])]);
    expect(allChoices.length).toBeGreaterThan(blueprint.exercises.length);
    expect(allChoices.map(exercise => exercise.name)).not.toEqual(expect.arrayContaining(["Leg Press", "Chair Squat", "Dumbbell Row", "Band Row"]));
    expect(allChoices.every(exercise => Boolean(exercise.reps || exercise.duration))).toBe(true);
  });

  it("uses full-gym equipment while keeping machine work out of limited gyms", () => {
    const full = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym", recentWorkouts: [] });
    expect(full.exercises.filter(exercise => /Dumbbell|Press|Cable|Pulldown/.test(exercise.name)).length).toBeGreaterThanOrEqual(2);
    const limited = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Limited Gym", recentWorkouts: [] });
    expect(limited.exercises.flatMap(exercise => [exercise.name, ...(exercise.alternatives ?? []).map(item => item.name)])).not.toEqual(
      expect.arrayContaining(["Leg Press", "Seated Cable Row", "Lat Pulldown", "Machine Chest Press"])
    );
  });

  it("rotates a prescribed movement locally with its own reps and notes", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, recentWorkouts: [] });
    const checked = applyWorkoutBlueprint(plan, blueprint);
    const swapped = rotateWorkoutExercise(checked, 0);
    expect(swapped).not.toBeNull();
    expect(swapped?.exercises[0].name).not.toBe(checked.exercises[0].name);
    expect(swapped?.exercises[0].reps || swapped?.exercises[0].duration).toBeTruthy();
    expect(swapped?.exercises[0].alternatives?.map(item => item.name)).toContain(checked.exercises[0].name);
    expect(rotateWorkoutExercise(checked, -1)).toBeNull();
    expect(rotateWorkoutExercise(plan, 0)).toBeNull();
  });
});
