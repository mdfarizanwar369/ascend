import { describe, expect, it } from "vitest";
import { applyWorkoutBlueprint, buildWorkoutBlueprint, rotateWorkoutExercise, summarizeWorkoutExerciseHistory, V2_WORKOUT_CATALOG, workoutEngineV2Enabled } from "../services/workoutPlanQualityService";
import type { CoachWorkoutPlan } from "../integrations/openai";
import { resolveExerciseVisual, resolveV2WorkoutExerciseVisual } from "@ascend/shared";

const base = { goal: "strength", location: "home", equipment: "Bodyweight", timeAvailable: "30", today: "2026-10-03" };
const plan: CoachWorkoutPlan = {
  title: "A session", intro: "Let's move.", estimatedDurationMinutes: 30, focus: "Full body", intensity: "moderate",
  warmup: ["Easy walk"], exercises: [{ name: "AI choice", sets: 3, reps: "10" }], cooldown: ["Breathe"],
  coachTip: "Move well.", disclaimer: "Stop if you feel pain."
};

describe("Zoe workout engine V2", () => {
  it("has reviewed pictures and coaching instructions for every plan and swap movement", () => {
    expect(V2_WORKOUT_CATALOG).toHaveLength(58);
    for (const item of V2_WORKOUT_CATALOG) {
      const visual = resolveExerciseVisual(item.name);
      expect(visual.status, item.name).toBe("resolved");
      if (visual.status !== "resolved") continue;
      expect(visual.exercise.instructions.length, item.name).toBeGreaterThan(60);
      expect(visual.exercise.cue.length, item.name).toBeGreaterThan(15);
      expect(visual.exercise.equipment.length, item.name).toBeGreaterThan(0);
      expect(visual.exercise.targetMuscles.length, item.name).toBeGreaterThan(0);
      expect(visual.exercise.images.kind === "single" ? visual.exercise.images.main : visual.exercise.images.start, item.name).toMatch(/^\/exercise-visuals\/.+\.webp$/);
    }
  });

  it("also illustrates older saved V2 workouts without broadening V1 exercise matching", () => {
    for (const name of ["Goblet Squat", "Leg Press", "Incline Push-Up", "Band Chest Press", "Dumbbell Row", "Band Row", "Reverse Lunge", "Pallof Press", "Side Plank", "Hip Flexor Stretch"]) {
      expect(resolveV2WorkoutExerciseVisual(name).status, name).toBe("resolved");
    }
    expect(resolveExerciseVisual("Leg Press").status).toBe("ambiguous");
    expect(resolveExerciseVisual("Dumbbell Row").status).toBe("unresolved");
  });

  it("keeps old and precise exercise names equivalent in the rotation avoid list", () => {
    const options = { ...base, location: "gym", equipment: "Full Gym", recentWorkouts: [] };
    const oldNames = buildWorkoutBlueprint({ ...options, avoidExercises: ["Leg Press", "Dumbbell Row", "Goblet Squat"] });
    const preciseNames = buildWorkoutBlueprint({ ...options, avoidExercises: ["45-Degree Leg Press", "Bent-Over Dumbbell Row", "Dumbbell Goblet Squat"] });
    expect(oldNames.exercises.map(exercise => exercise.name)).toEqual(preciseNames.exercises.map(exercise => exercise.name));
  });

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

  it("remembers a generated plan without treating it as a completed workout", () => {
    const first = buildWorkoutBlueprint({ ...base, recentWorkouts: [] });
    const planned = [{
      metadata: { evidenceType: "planned", exercises: first.exercises.map(exercise => ({ name: exercise.name })) },
      created_at: "2026-10-03T08:00:00.000Z"
    }];
    const second = buildWorkoutBlueprint({ ...base, recentWorkouts: planned });
    expect(second.history[0].evidence).toBe("planned");
    expect(second.focus).not.toBe("Recovery and mobility");
    expect(second.exercises.map(exercise => exercise.name)).not.toEqual(first.exercises.map(exercise => exercise.name));
    expect(second.whyToday).toContain("recently planned");
    expect(second.whyToday).not.toContain("logged a workout");
  });

  it("chooses a different suitable movement over one used on the previous day", () => {
    const blueprint = buildWorkoutBlueprint({
      ...base, location: "gym", equipment: "Full Gym", timeAvailable: "60", today: "2026-10-04",
      recentWorkouts: [
        { metadata: { evidenceType: "planned", exercises: [{ name: "Dumbbell Reverse Lunge" }] }, created_at: "2026-10-03T08:00:00Z" },
        { metadata: { evidenceType: "planned", exercises: [{ name: "Supported Split Squat" }] }, created_at: "2026-10-02T08:00:00Z" }
      ]
    });
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Dumbbell Reverse Lunge");
    expect(blueprint.exercises.some(exercise => /Lunge|Split Squat|Step-Up/.test(exercise.name))).toBe(true);
  });

  it("rotates the lower-body pattern instead of repeating the only available squat", () => {
    const first = buildWorkoutBlueprint({ ...base, location: "outdoors", timeAvailable: "20", recentWorkouts: [] });
    expect(first.exercises.map(exercise => exercise.name)).toContain("Bodyweight Squat");
    const second = buildWorkoutBlueprint({
      ...base, location: "outdoors", timeAvailable: "20", today: "2026-10-04",
      recentWorkouts: [{
        metadata: { evidenceType: "planned", exercises: first.exercises.map(exercise => ({ name: exercise.name })) },
        created_at: "2026-10-03T08:00:00Z"
      }]
    });
    expect(second.exercises.map(exercise => exercise.name)).not.toContain("Bodyweight Squat");
    expect(second.exercises.map(exercise => exercise.name)).toEqual(expect.arrayContaining([expect.stringMatching(/Lunge|Split Squat/)]));
  });

  it("avoids back-to-back exercise repeats across a week of planned sessions", () => {
    for (const setting of [
      { location: "outdoors", equipment: "Bodyweight" },
      { location: "home", equipment: "Dumbbells" },
      { location: "home", equipment: "Resistance Bands" },
      { location: "gym", equipment: "Full Gym" }
    ]) {
      const recentWorkouts: Array<{ metadata: { evidenceType: "planned"; exercises: Array<{ name: string }> }; created_at: string }> = [];
      let previous = new Set<string>();
      for (let day = 1; day <= 7; day++) {
        const date = `2026-10-${String(day).padStart(2, "0")}`;
        const blueprint = buildWorkoutBlueprint({ ...base, ...setting, timeAvailable: "45", today: date, recentWorkouts });
        const names = blueprint.exercises.map(exercise => exercise.name);
        expect(names.filter(name => previous.has(name)), `${setting.location} ${setting.equipment} on ${date}`).toEqual([]);
        previous = new Set(names);
        recentWorkouts.unshift({ metadata: { evidenceType: "planned", exercises: names.map(name => ({ name })) }, created_at: `${date}T08:00:00Z` });
      }
    }
  });

  it("does not inflate every exercise after one too-easy response, and ignores stale effort", () => {
    const recentWorkouts = [{ metadata: { exercises: [{ name: "Goblet Squat" }], effortRating: "too_easy" }, created_at: "2026-10-02T08:00:00.000Z" }];
    const ready = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts });
    expect(ready.exercises.filter(exercise => exercise.sets).every(exercise => exercise.sets === 3)).toBe(true);
    expect(ready.whyToday).not.toContain("adds a little volume");
    const conservative = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts, conservative: true });
    expect(conservative.exercises.filter(exercise => exercise.sets).every(exercise => exercise.sets === 2)).toBe(true);
    const stale = buildWorkoutBlueprint({ ...base, timeAvailable: "45", recentWorkouts: [{ ...recentWorkouts[0], created_at: "2026-09-01T08:00:00.000Z" }] });
    expect(stale.whyToday).not.toContain("last workout felt too easy");
  });

  it("does not prescribe gym or household equipment for an outdoor bodyweight request", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", recentWorkouts: [] });
    const allChoices = blueprint.exercises.flatMap(exercise => [exercise, ...(exercise.alternatives ?? [])]);
    expect(allChoices.length).toBeGreaterThan(blueprint.exercises.length);
    expect(allChoices.map(exercise => exercise.name)).not.toEqual(expect.arrayContaining(["45-Degree Leg Press", "Chair Squat", "Bent-Over Dumbbell Row", "Band Bent-Over Row"]));
    expect(allChoices.every(exercise => Boolean(exercise.reps || exercise.duration))).toBe(true);
  });

  it("uses full-gym equipment while keeping machine work out of limited gyms", () => {
    const full = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym", recentWorkouts: [] });
    expect(full.exercises.filter(exercise => /Dumbbell|Press|Cable|Pulldown/.test(exercise.name)).length).toBeGreaterThanOrEqual(2);
    const limited = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Limited Gym", recentWorkouts: [] });
    expect(limited.exercises.flatMap(exercise => [exercise.name, ...(exercise.alternatives ?? []).map(item => item.name)])).not.toEqual(
      expect.arrayContaining(["45-Degree Leg Press", "Seated Cable Row", "Lat Pulldown", "Machine Chest Press"])
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

  it("makes the selected goal change the actual prescription without extra builder questions", () => {
    const options = { ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45", recentWorkouts: [] };
    const strength = buildWorkoutBlueprint({ ...options, goal: "strength" });
    const muscle = buildWorkoutBlueprint({ ...options, goal: "muscle_gain" });
    const fatLoss = buildWorkoutBlueprint({ ...options, goal: "fat_loss" });
    const general = buildWorkoutBlueprint({ ...options, goal: "general_fitness" });
    const recovery = buildWorkoutBlueprint({ ...options, goal: "recovery" });
    const mobility = buildWorkoutBlueprint({ ...options, goal: "mobility" });

    expect(strength.focus).toBe("Full body strength");
    expect(strength.exercises.some(exercise => exercise.reps === "6-10" && exercise.rest === "90-120 sec")).toBe(true);
    expect(strength.exercises.some(exercise => /Walk|Bike/.test(exercise.name))).toBe(false);
    expect(muscle.focus).toBe("Full body muscle building");
    expect(muscle.exercises.filter(exercise => exercise.rest === "60-90 sec")).toHaveLength(5);
    expect(muscle.exercises.map(exercise => exercise.name)).not.toEqual(strength.exercises.map(exercise => exercise.name));
    expect(fatLoss.exercises.some(exercise => /Walk|Bike/.test(exercise.name))).toBe(true);
    expect(fatLoss.exercises.some(exercise => /Row|Pulldown|Pull-Up/.test(exercise.name))).toBe(true);
    expect(general.exercises.some(exercise => /Walk|Bike/.test(exercise.name))).toBe(true);
    expect(general.exercises.some(exercise => /Bug|Bird-Dog|Plank/.test(exercise.name))).toBe(true);
    expect(recovery.exercises[0].name).not.toBe("Brisk Walk");
    expect(recovery.exercises.some(exercise => /Walk|Bike/.test(exercise.name))).toBe(true);
    expect(mobility.focus).toBe("Mobility and range of motion");
    expect(mobility.exercises.some(exercise => /Walk|Bike/.test(exercise.name))).toBe(false);
    expect(applyWorkoutBlueprint(plan, mobility).intensity).toBe("easy");
  });

  it("avoids redundant push variants in a bodyweight muscle-gain session", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, goal: "muscle_gain", timeAvailable: "60", recentWorkouts: [] });
    expect(blueprint.exercises.filter(exercise => /Push-Up/.test(exercise.name))).toHaveLength(1);
    expect(blueprint.exercises.some(exercise => /Lunge|Split Squat/.test(exercise.name))).toBe(true);
  });

  it("keeps each-side instructions when strength targets are adjusted", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, equipment: "Dumbbells", timeAvailable: "60", recentWorkouts: [] });
    const unilateral = blueprint.exercises.flatMap(exercise => [exercise, ...(exercise.alternatives ?? [])])
      .filter(exercise => /Single-Arm Dumbbell Row|Dumbbell Reverse Lunge/.test(exercise.name));
    expect(unilateral.length).toBeGreaterThan(0);
    expect(unilateral.every(exercise => exercise.reps === "6-10 each side")).toBe(true);
  });

  it("uses standing movements for outdoor recovery and mobility without assuming a mat or wall", () => {
    for (const goal of ["recovery", "mobility"]) {
      const blueprint = buildWorkoutBlueprint({ ...base, goal, location: "outdoors", equipment: "Bodyweight", timeAvailable: "60", recentWorkouts: [] });
      const names = blueprint.exercises.map(exercise => exercise.name);
      expect(names).not.toEqual(expect.arrayContaining(["Child's Pose", "Cat-Cow", "Thread the Needle", "Kneeling Hip Flexor Stretch", "Standing Calf Stretch", "Dead Bug", "Bird-Dog"]));
      expect(names.filter(name => name.startsWith("Standing "))).toHaveLength(goal === "mobility" ? 5 : 4);
      expect(blueprint.estimatedDurationMinutes).toBeLessThan(60);
    }
  });

  it("offers varied outdoor mobility across consecutive days without a new input", () => {
    const recentWorkouts: Array<{ metadata: { evidenceType: "planned"; exercises: Array<{ name: string }> }; created_at: string }> = [];
    let previous = new Set<string>();
    for (let day = 1; day <= 7; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const blueprint = buildWorkoutBlueprint({ ...base, goal: "mobility", location: "outdoors", equipment: "Bodyweight", timeAvailable: "45", today: date, recentWorkouts });
      const names = blueprint.exercises.map(exercise => exercise.name);
      expect(names.filter(name => previous.has(name)), date).toEqual([]);
      previous = new Set(names);
      recentWorkouts.unshift({ metadata: { evidenceType: "planned", exercises: names.map(name => ({ name })) }, created_at: `${date}T08:00:00Z` });
    }
  });

  it("keeps all goal, time, equipment, and conservative combinations illustrated and executable", () => {
    const settings = [
      { location: "outdoors", equipment: "Bodyweight" },
      { location: "outdoors", equipment: "Walking or Running Route" },
      { location: "outdoors", equipment: "Park Bench or Bars" },
      { location: "home", equipment: "Bodyweight" },
      { location: "home", equipment: "Dumbbells" },
      { location: "home", equipment: "Resistance Bands" },
      { location: "hotel", equipment: "Bodyweight" },
      { location: "hotel", equipment: "Dumbbells" },
      { location: "hotel", equipment: "Resistance Bands" },
      { location: "gym", equipment: "Limited Gym" },
      { location: "gym", equipment: "Full Gym" }
    ];
    for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness", "recovery", "mobility"]) {
      for (const timeAvailable of ["20", "30", "45", "60"]) {
        for (const setting of settings) {
          for (const conservative of [false, true]) {
            const blueprint = buildWorkoutBlueprint({ ...base, ...setting, goal, timeAvailable, conservative, recentWorkouts: [] });
            const label = `${goal} ${timeAvailable} ${setting.location} ${setting.equipment} conservative=${conservative}`;
            expect(new Set(blueprint.exercises.map(exercise => exercise.name)).size, label).toBe(blueprint.exercises.length);
            expect(blueprint.estimatedDurationMinutes, label).toBeLessThanOrEqual(Number(timeAvailable));
            for (const exercise of blueprint.exercises.flatMap(item => [item, ...(item.alternatives ?? [])])) {
              expect(exercise.reps || exercise.duration, `${label} ${exercise.name}`).toBeTruthy();
              expect(resolveExerciseVisual(exercise.name).status, `${label} ${exercise.name}`).toBe("resolved");
              expect(exercise.name, label).not.toBe("Standing Band Pallof Press");
            }
          }
        }
      }
    }
  });
});
