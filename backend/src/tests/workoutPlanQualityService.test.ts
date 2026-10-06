import { describe, expect, it } from "vitest";
import { applyWorkoutBlueprint, buildWorkoutBlueprint, fillMissingWorkoutSwaps, rotateWorkoutExercise, summarizeWorkoutExerciseHistory, V2_WORKOUT_CATALOG, workoutEngineV2Enabled } from "../services/workoutPlanQualityService";
import type { CoachWorkoutPlan } from "../integrations/openai";
import { estimateWorkoutDurationMinutes, resolveExerciseVisual, resolveV2WorkoutExerciseVisual } from "@ascend/shared";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const base = { goal: "strength", location: "home", equipment: "Bodyweight", timeAvailable: "30", today: "2026-10-03" };
const plan: CoachWorkoutPlan = {
  title: "A session", intro: "Let's move.", estimatedDurationMinutes: 30, focus: "Full body", intensity: "moderate",
  warmup: ["Easy walk"], exercises: [{ name: "AI choice", sets: 3, reps: "10" }], cooldown: ["Breathe"],
  coachTip: "Move well.", disclaimer: "Stop if you feel pain."
};

describe("Zoe workout engine V2", () => {
  it("has reviewed pictures and coaching instructions for every plan and swap movement", () => {
    expect(V2_WORKOUT_CATALOG).toHaveLength(120);
    for (const item of V2_WORKOUT_CATALOG) {
      if (item.pattern === "accessory") expect(item.target, item.name).toBeTruthy();
      const visual = resolveV2WorkoutExerciseVisual(item.name);
      expect(visual.status, item.name).toBe("resolved");
      if (visual.status !== "resolved") continue;
      expect(visual.exercise.instructions.length, item.name).toBeGreaterThan(60);
      expect(visual.exercise.cue.length, item.name).toBeGreaterThan(15);
      expect(visual.exercise.equipment.length, item.name).toBeGreaterThan(0);
      expect(visual.exercise.targetMuscles.length, item.name).toBeGreaterThan(0);
      expect(visual.exercise.images.kind === "single" ? visual.exercise.images.main : visual.exercise.images.start, item.name).toMatch(/^\/exercise-visuals\/.+\.webp$/);
      const paths = visual.exercise.images.kind === "single" ? [visual.exercise.images.main] : [visual.exercise.images.start, visual.exercise.images.peak];
      for (const path of paths) {
        expect(existsSync(resolve(__dirname, "../../../frontend/public", path.slice(1))), `${item.name}: ${path}`).toBe(true);
      }
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

  it("uses the whole completed Zoe plan for recovery while carrying confirmed reps into a later prescription", () => {
    const target = "Dumbbell Bench Press";
    const recentWorkouts = [{
      metadata: {
        evidenceType: "observed_performance", source: "coach_zoe_workout_observed", effortRating: "about_right",
        completedPlanExercises: [{ name: "Dumbbell Goblet Squat" }, { name: "Dumbbell Romanian Deadlift" }, { name: target }, { name: "Dumbbell Row" }],
        exercises: [{ name: target, sets: 2, reps: "8", load: 12, loadUnit: "kg" }]
      }, created_at: "2026-09-28T08:00:00.000Z"
    }];
    expect(summarizeWorkoutExerciseHistory(recentWorkouts)[0]).toMatchObject({
      names: ["Dumbbell Goblet Squat", "Dumbbell Romanian Deadlift", target, "Dumbbell Row"], evidence: "observed"
    });
    const blueprint = buildWorkoutBlueprint({
      ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45", recentWorkouts,
      avoidExercises: V2_WORKOUT_CATALOG.filter(item => item.pattern === "push" && item.name !== target).map(item => item.name)
    });
    expect(blueprint.exercises.find(exercise => exercise.name === target)?.note).toContain("Last logged: 2 sets, 8 reps at 12 kg");
    const atTop = [{ ...recentWorkouts[0], metadata: {
      ...recentWorkouts[0].metadata, exercises: [{ name: target, sets: 2, reps: "12", load: 12, loadUnit: "kg" }]
    } }];
    const options = { ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45",
      avoidExercises: V2_WORKOUT_CATALOG.filter(item => item.pattern === "push" && item.name !== target).map(item => item.name) };
    expect(buildWorkoutBlueprint({ ...options, recentWorkouts: atTop }).exercises.find(exercise => exercise.name === target)?.note)
      .toContain("Repeat this load once");
    expect(buildWorkoutBlueprint({ ...options, recentWorkouts: [atTop[0], { ...atTop[0], created_at: "2026-09-25T08:00:00.000Z" }] })
      .exercises.find(exercise => exercise.name === target)?.note).toContain("next small weight increase");
  });

  it("recognizes rowing workouts as cardio history rather than a back-row exercise", () => {
    const history = summarizeWorkoutExerciseHistory([{
      metadata: { exercises: [{ name: "Indoor Rowing" }, { name: "Seated Cable Row" }] }, created_at: "2026-10-02T08:00:00Z"
    }]);
    expect(history[0].patterns).toEqual(["cardio", "pull"]);
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

  it("counts a real workout without named exercises and a synced workout for same-day recovery", () => {
    const manualLog = [{ metadata: { workoutType: "Walking", durationMinutes: 25 }, created_at: "2026-10-03T08:00:00.000Z" }];
    expect(summarizeWorkoutExerciseHistory(manualLog)).toMatchObject([{ names: [], evidence: "completed" }]);
    expect(buildWorkoutBlueprint({ ...base, recentWorkouts: manualLog }).focus).toBe("Recovery and mobility");
    expect(buildWorkoutBlueprint({ ...base, recentWorkouts: [], completedWorkoutToday: true }).focus).toBe("Recovery and mobility");
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

  it("uses the added squat variation before repeating the last outdoor squat", () => {
    const first = buildWorkoutBlueprint({ ...base, location: "outdoors", timeAvailable: "20", recentWorkouts: [] });
    const firstSquat = first.exercises.find(exercise => ["Bodyweight Squat", "Lateral Squat Step"].includes(exercise.name))?.name;
    expect(firstSquat).toBeTruthy();
    const second = buildWorkoutBlueprint({
      ...base, location: "outdoors", timeAvailable: "20", today: "2026-10-04",
      recentWorkouts: [{
        metadata: { evidenceType: "planned", exercises: first.exercises.map(exercise => ({ name: exercise.name })) },
        created_at: "2026-10-03T08:00:00Z"
      }]
    });
    expect(second.exercises.map(exercise => exercise.name)).not.toContain(firstSquat);
    expect(second.exercises.some(exercise => ["Bodyweight Squat", "Lateral Squat Step", "Bodyweight Reverse Lunge", "Stationary Split Squat"].includes(exercise.name))).toBe(true);
  });

  it("avoids back-to-back exercise repeats across a week of planned sessions", () => {
    for (const setting of [
      { location: "outdoors", equipment: "Exercise Mat" },
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
    expect(ready.exercises.filter(exercise => ["squat", "hinge", "push", "pull", "single_leg", "accessory"]
      .includes(V2_WORKOUT_CATALOG.find(item => item.name === exercise.name)?.pattern ?? ""))
      .every(exercise => exercise.sets === 3)).toBe(true);
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
    const gymOnly = new Set(V2_WORKOUT_CATALOG.filter(item => item.kit.every(kit => kit === "gym")).map(item => item.name));
    expect(limited.exercises.flatMap(exercise => [exercise.name, ...(exercise.alternatives ?? []).map(item => item.name)])
      .filter(name => gymOnly.has(name))).toEqual([]);
  });

  it("uses Full Gym accessories without offering unrelated accessory swaps", () => {
    const byName = new Map(V2_WORKOUT_CATALOG.map(item => [item.name, item]));
    const longer = buildWorkoutBlueprint({ ...base, goal: "muscle_gain", location: "gym", equipment: "Full Gym", timeAvailable: "60", recentWorkouts: [] });
    const longerTargets = longer.exercises.map(item => byName.get(item.name)?.target).filter(Boolean);
    expect(longerTargets).toHaveLength(2);
    expect(new Set(longerTargets).size).toBe(2);
    const recentWorkouts: Array<{ metadata: { evidenceType: "planned"; exercises: Array<{ name: string }> }; created_at: string }> = [];
    const accessoryTargets = new Set<string>();
    for (let day = 1; day <= 12; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const blueprint = buildWorkoutBlueprint({ ...base, goal: "muscle_gain", location: "gym", equipment: "Full Gym", timeAvailable: "45", today: date, recentWorkouts });
      expect(blueprint.exercises.map(item => item.name), date).not.toEqual(expect.arrayContaining(["Wall Push-Up", "Knee Push-Up"]));
      const accessory = blueprint.exercises.filter(item => byName.get(item.name)?.pattern === "accessory");
      expect(accessory, date).toHaveLength(1);
      for (const exercise of accessory) {
        const target = byName.get(exercise.name)?.target;
        expect(target).toBeTruthy();
        accessoryTargets.add(target!);
        for (const alternative of exercise.alternatives ?? []) {
          expect(byName.get(alternative.name)?.target, `${exercise.name} -> ${alternative.name}`).toBe(target);
        }
      }
      recentWorkouts.unshift({ metadata: { evidenceType: "planned", exercises: blueprint.exercises.map(item => ({ name: item.name })) }, created_at: `${date}T08:00:00Z` });
    }
    expect(accessoryTargets.size).toBeGreaterThanOrEqual(4);
  });

  it("avoids first-time automatic bar exercises but allows known movements", () => {
    const fresh = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45", recentWorkouts: [] });
    const freshChoices = fresh.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)]);
    for (const name of ["Pull-Up", "Hanging Knee Raise", "Barbell Back Squat", "Barbell Romanian Deadlift", "Barbell Bench Press"]) {
      expect(freshChoices).not.toContain(name);
    }
    const previous = [{ metadata: { evidenceType: "completed_plan", exercises: [{ name: "Pull-Up" }] }, created_at: "2026-09-25T08:00:00Z" }];
    const otherPulls = V2_WORKOUT_CATALOG.filter(item => item.pattern === "pull" && item.name !== "Pull-Up").map(item => item.name);
    const experienced = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45", recentWorkouts: previous, avoidExercises: otherPulls });
    expect(experienced.exercises.map(item => item.name)).toContain("Pull-Up");
    const familiarBarbell = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym", timeAvailable: "45", avoidExercises: V2_WORKOUT_CATALOG.filter(item => item.pattern === "squat" && item.name !== "Barbell Back Squat").map(item => item.name), recentWorkouts: [{
      metadata: { evidenceType: "completed_plan", exercises: [{ name: "Barbell Back Squat" }] }, created_at: "2026-09-25T08:00:00Z"
    }] });
    expect(familiarBarbell.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)])).toContain("Barbell Back Squat");
  });

  it("describes bodyweight strength honestly when no resisted back pull is available", () => {
    for (const location of ["home", "hotel", "outdoors"]) {
      const blueprint = buildWorkoutBlueprint({ ...base, goal: "muscle_gain", location, equipment: "Bodyweight", timeAvailable: "45", recentWorkouts: [] });
      expect(blueprint.focus, location).not.toBe("Full body muscle building");
      expect(blueprint.whyToday, location).toMatch(/limited upper-body resistance|not a resisted back pull/);
    }
    const withDumbbells = buildWorkoutBlueprint({ ...base, goal: "muscle_gain", location: "home", equipment: "Dumbbells", timeAvailable: "45", recentWorkouts: [] });
    expect(withDumbbells.focus).toBe("Full body muscle building");
  });

  it("makes every new Full Gym machine or cable exercise reachable", () => {
    const added = ["Seated Leg Curl", "Leg Extension", "Machine Shoulder Press", "Chest-Supported Machine Row", "Pec Deck Fly",
      "Reverse Pec Deck", "Hip Abduction Machine", "Seated Calf Raise Machine", "Hack Squat Machine", "Cable Face Pull",
      "Cable Chest Fly", "Seated Leg Press", "Hip Thrust Machine", "Lying Leg Curl", "Standing Calf Raise Machine",
      "Cable Pallof Press", "Elliptical Trainer", "Rowing Machine"];
    const reachable = new Set<string>();
    for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness"]) {
      for (const timeAvailable of ["20", "30", "45", "60"]) {
        for (let day = 1; day <= 28; day++) {
          const today = `2026-10-${String(day).padStart(2, "0")}`;
          const blueprint = buildWorkoutBlueprint({ ...base, goal, location: "gym", equipment: "Full Gym", timeAvailable, today, recentWorkouts: [] });
          for (const exercise of blueprint.exercises.flatMap(item => [item, ...(item.alternatives ?? [])])) reachable.add(exercise.name);
        }
      }
    }
    expect(added.filter(name => !reachable.has(name))).toEqual([]);
  });

  it("rotates a prescribed movement locally with its own reps and notes", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, recentWorkouts: [] });
    const checked = applyWorkoutBlueprint(plan, blueprint);
    const swapped = rotateWorkoutExercise(checked, 0);
    expect(swapped).not.toBeNull();
    expect(swapped?.exercises[0].name).not.toBe(checked.exercises[0].name);
    expect(swapped?.exercises[0].reps || swapped?.exercises[0].duration).toBeTruthy();
    expect(swapped?.exercises[0].alternatives?.map(item => item.name)).toContain(checked.exercises[0].name);
    expect(swapped?.estimatedDurationMinutes).toBe(estimateWorkoutDurationMinutes(swapped!.exercises));
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
    const patternOf = (name: string) => V2_WORKOUT_CATALOG.find(item => item.name === name)?.pattern;
    const strengthFinish = strength.exercises.filter(exercise => patternOf(exercise.name) === "cardio");
    expect(strengthFinish).toHaveLength(1);
    expect(Number.parseInt(strengthFinish[0].duration ?? "0", 10)).toBeLessThanOrEqual(10);
    expect(muscle.focus).toBe("Full body muscle building");
    expect(muscle.exercises.filter(exercise => exercise.rest === "60-90 sec")).toHaveLength(5);
    expect(muscle.exercises.map(exercise => exercise.name)).not.toEqual(strength.exercises.map(exercise => exercise.name));
    expect(fatLoss.exercises.some(exercise => patternOf(exercise.name) === "cardio")).toBe(true);
    expect(fatLoss.exercises.some(exercise => patternOf(exercise.name) === "pull")).toBe(true);
    expect(general.exercises.some(exercise => patternOf(exercise.name) === "cardio")).toBe(true);
    expect(general.exercises.some(exercise => patternOf(exercise.name) === "core")).toBe(true);
    expect(recovery.exercises[0].name).not.toBe("Brisk Walk");
    expect(recovery.exercises.some(exercise => patternOf(exercise.name) === "cardio")).toBe(true);
    expect(mobility.focus).toBe("Mobility and range of motion");
    expect(mobility.exercises.filter(exercise => patternOf(exercise.name) === "mobility").length).toBeGreaterThanOrEqual(3);
    expect(mobility.exercises.filter(exercise => patternOf(exercise.name) === "cardio")).toHaveLength(1);
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
      expect(blueprint.estimatedDurationMinutes).toBeGreaterThanOrEqual(59);
      expect(blueprint.estimatedDurationMinutes).toBeLessThanOrEqual(64);
    }
  });

  it("keeps hotel-room plans and swaps within confirmed equipment and a small space", () => {
    for (const equipment of ["Bodyweight", "Dumbbells", "Long Resistance Band"]) {
      for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness", "recovery", "mobility"]) {
        const blueprint = buildWorkoutBlueprint({ ...base, location: "hotel", equipment, goal, timeAvailable: "45", recentWorkouts: [] });
        const names = blueprint.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)]);
        expect(names, `${equipment} ${goal}`).not.toEqual(expect.arrayContaining([
          "Chair Squat", "Low Step-Up", "Bench Incline Push-Up", "Bodyweight Walking Lunge",
          "Easy Walk", "Brisk Walk", "Seated Dumbbell Calf Raise"
        ]));
        expect(applyWorkoutBlueprint(plan, blueprint).warmup[0]).toContain("quiet marching");
      }
    }
  });

  it("makes the outdoor equipment choices distinct without assuming a floor or wall", () => {
    const options = { ...base, location: "outdoors", goal: "general_fitness", timeAvailable: "45", recentWorkouts: [] };
    const bodyweight = buildWorkoutBlueprint({ ...options, equipment: "Bodyweight" });
    const route = buildWorkoutBlueprint({ ...options, equipment: "Walking or Running Route" });
    const bench = buildWorkoutBlueprint({ ...options, equipment: "Park Bench" });
    const lowBar = buildWorkoutBlueprint({ ...options, equipment: "Low Exercise Bar" });
    const mat = buildWorkoutBlueprint({ ...options, equipment: "Exercise Mat" });
    const names = (blueprint: typeof bodyweight) => blueprint.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)]);
    for (const blueprint of [bodyweight, route, bench, lowBar]) {
      for (const name of names(blueprint)) {
        const item = V2_WORKOUT_CATALOG.find(candidate => candidate.name === name)!;
        expect(item.requiresFloor, name).not.toBe(true);
        expect(item.requiresWall, name).not.toBe(true);
      }
    }
    expect(names(bodyweight)).not.toContain("Walk Intervals");
    expect(names(route)).toContain("Walk Intervals");
    expect(names(bench)).toEqual(expect.arrayContaining(["Bench Sit-to-Stand", "Bench Incline Push-Up"]));
    expect(names(lowBar)).toContain("Inverted Row");
    expect(names(mat).some(name => V2_WORKOUT_CATALOG.find(item => item.name === name)?.requiresFloor)).toBe(true);
    expect(names(mat)).not.toContain("Wall Push-Up");
    expect(buildWorkoutBlueprint({ ...options, goal: "strength", equipment: "Bodyweight" }).focus).toBe("Outdoor strength and conditioning");
    const legacy = buildWorkoutBlueprint({ ...options, equipment: "Park Bench or Bars" });
    expect(names(legacy)).not.toEqual(expect.arrayContaining(["Bench Sit-to-Stand", "Bench Incline Push-Up", "Inverted Row", "Pull-Up"]));
  });

  it("introduces jogging and pull-up bar work only after completed exercise history", () => {
    const routeOptions = { ...base, location: "outdoors", equipment: "Walking or Running Route", goal: "fat_loss", timeAvailable: "45" };
    const freshRoute = buildWorkoutBlueprint({ ...routeOptions, recentWorkouts: [] });
    expect(freshRoute.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)])).not.toContain("Walk-Jog Intervals");
    const runner = buildWorkoutBlueprint({ ...routeOptions, recentWorkouts: [{
      metadata: { evidenceType: "completed_plan", exercises: [{ name: "Jog" }] }, created_at: "2026-09-25T08:00:00Z"
    }], avoidExercises: ["Walk Intervals"] });
    expect(runner.exercises.map(item => item.name)).toContain("Walk-Jog Intervals");
    const barOptions = { ...base, location: "outdoors", equipment: "Pull-Up Bar", goal: "strength", timeAvailable: "45" };
    const freshBar = buildWorkoutBlueprint({ ...barOptions, recentWorkouts: [] });
    expect(freshBar.exercises.map(item => item.name)).toContain("Short Bar Hang");
    expect(freshBar.exercises.find(item => item.name === "Short Bar Hang")?.alternatives?.map(item => item.name))
      .toContain("Standing Upper-Back Squeeze");
    expect(freshBar.exercises.map(item => item.name)).not.toContain("Standing Upper-Back Squeeze");
    expect(freshBar.exercises.flatMap(item => [item.name, ...(item.alternatives ?? []).map(alternative => alternative.name)])).not.toContain("Pull-Up");
    const experienced = buildWorkoutBlueprint({ ...barOptions, recentWorkouts: [{
      metadata: { evidenceType: "completed_plan", exercises: [{ name: "Pull-Up" }] }, created_at: "2026-09-25T08:00:00Z"
    }], avoidExercises: ["Short Bar Hang"] });
    expect(experienced.exercises.map(item => item.name)).toContain("Pull-Up");
  });

  it("fills long hotel sessions with distinct gentle movements instead of duplicate marching", () => {
    for (const timeAvailable of ["45", "60"]) {
      for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness", "recovery", "mobility"]) {
        for (const equipment of ["Bodyweight", "Dumbbells", "Long Resistance Band"]) {
          for (const conservative of [false, true]) {
            const blueprint = buildWorkoutBlueprint({ ...base, location: "hotel", equipment, goal,
              timeAvailable, conservative, recentWorkouts: [] });
            const label = `${timeAvailable} ${goal} ${equipment} conservative=${conservative}`;
            const minutesOf = (duration: string | null | undefined) => Number.parseInt(duration ?? "0", 10);
            const cardio = blueprint.exercises.filter(exercise => exercise.duration?.includes("min"));
            expect(cardio.every(exercise => minutesOf(exercise.duration) <= 18), label).toBe(true);
            expect(blueprint.exercises.filter(exercise => /march/i.test(exercise.name)).length, label).toBeLessThanOrEqual(1);
            expect(blueprint.estimatedDurationMinutes, label).toBeGreaterThanOrEqual(timeAvailable === "60" ? 59 : 39);
            const workout = applyWorkoutBlueprint(plan, blueprint);
            for (const [index, exercise] of workout.exercises.entries()) {
              if (!exercise.duration?.includes("min")) continue;
              const swapped = rotateWorkoutExercise(workout, index);
              expect(swapped, `${label}: ${exercise.name}`).not.toBeNull();
              expect(swapped!.exercises.filter(item => /march/i.test(item.name)).length,
                `${label}: ${exercise.name} swap`).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
    const recovery = buildWorkoutBlueprint({ ...base, location: "hotel", equipment: "Bodyweight",
      goal: "recovery", timeAvailable: "60", recentWorkouts: [] });
    expect(recovery.exercises.map(exercise => exercise.name)).toEqual(expect.arrayContaining([
      "Standing Chest Opener", "Standing Hip Flexor Stretch", "Side Step Touch"
    ]));
    const stale = applyWorkoutBlueprint(plan, recovery);
    const sideIndex = stale.exercises.findIndex(exercise => exercise.name === "Side Step Touch");
    stale.exercises[sideIndex].alternatives = [{ name: "March in Place", duration: "15 min" }];
    const repaired = fillMissingWorkoutSwaps(stale, { location: "hotel", equipment: "Bodyweight" });
    expect(repaired.exercises[sideIndex].alternatives?.map(candidate => candidate.name)).not.toContain("March in Place");
    expect(rotateWorkoutExercise(repaired, sideIndex)?.exercises.filter(exercise => /march/i.test(exercise.name))).toHaveLength(1);
  });

  it("keeps a small number of completed movements familiar after recovery while rotating the rest", () => {
    const options = { ...base, location: "gym", equipment: "Full Gym", goal: "strength", timeAvailable: "45", today: "2026-10-05" };
    const first = buildWorkoutBlueprint({ ...options, recentWorkouts: [] });
    const previousNames = first.exercises.map(exercise => exercise.name);
    const next = buildWorkoutBlueprint({ ...options, recentWorkouts: [{
      metadata: { evidenceType: "completed_plan", exercises: previousNames.map(name => ({ name })), effortRating: "about_right" },
      created_at: "2026-10-03T08:00:00Z"
    }] });
    const retained = next.exercises.filter(exercise => previousNames.includes(exercise.name));
    expect(retained.length).toBeGreaterThanOrEqual(1);
    expect(retained.length).toBeLessThanOrEqual(2);
    expect(next.whyToday).toContain("familiar movement returns");
  });

  it("shows a workout estimate based on the actual prescription instead of the selected time window", () => {
    expect(estimateWorkoutDurationMinutes([
      { sets: 2, reps: "10", rest: "60 sec" },
      { duration: "10 min" }
    ])).toBe(20);
    expect(estimateWorkoutDurationMinutes([{ sets: 2, duration: "30 sec each side", rest: "30 sec" }])).toBe(10);
    const blueprint = buildWorkoutBlueprint({ ...base, goal: "general_fitness", location: "outdoors",
      equipment: "Pull-Up Bar", timeAvailable: "45", conservative: true, recentWorkouts: [] });
    const workout = applyWorkoutBlueprint(plan, blueprint);
    expect(blueprint.estimatedDurationMinutes).toBe(estimateWorkoutDurationMinutes(blueprint.exercises));
    expect(workout.estimatedDurationMinutes).toBeLessThanOrEqual(47);
    expect(workout.estimatedDurationMinutes).toBeGreaterThanOrEqual(39);
    expect(workout.warmup[1]).toMatch(/^1 minute/);
    expect(workout.cooldown[1]).toMatch(/^1 minute/);
    const correctedCopy = applyWorkoutBlueprint({ ...plan, title: "45-minute outdoor workout",
      intro: "You have a 45 min session.", coachTip: "Finish in 45 minutes." }, blueprint);
    expect(correctedCopy.title).toContain(`${blueprint.estimatedDurationMinutes}-minute`);
    expect(correctedCopy.intro).toContain(`${blueprint.estimatedDurationMinutes} min`);
    expect(correctedCopy.coachTip).toContain(`${blueprint.estimatedDurationMinutes} minutes`);
  });

  it("uses a safe short bar hold for a conservative first-time outdoor bar choice", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", equipment: "Pull-Up Bar",
      goal: "general_fitness", timeAvailable: "45", conservative: true, recentWorkouts: [] });
    const bar = blueprint.exercises.find(exercise => exercise.name === "Short Bar Hang");
    expect(bar?.duration).toBe("5-10 sec");
    expect(bar?.note).toContain("never jump");
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Pull-Up");
    expect(blueprint.whyToday).toContain("bar is used for a short hold");
  });

  it("progresses a bar hold only after confirmed seconds and eases it after a too-hard report", () => {
    const recentWorkouts = [{ metadata: { evidenceType: "observed_performance", effortRating: "about_right",
      completedPlanExercises: [{ name: "Short Bar Hang" }],
      exercises: [{ name: "Short Bar Hang", durationValue: 12, durationUnit: "seconds" }] },
    created_at: "2026-10-01T08:00:00Z" }];
    const options = { ...base, location: "outdoors", equipment: "Pull-Up Bar", goal: "general_fitness", timeAvailable: "45" };
    const progressed = buildWorkoutBlueprint({ ...options, recentWorkouts });
    expect(progressed.exercises.find(exercise => exercise.name === "Short Bar Hang"))
      .toMatchObject({ duration: "10-15 sec", note: expect.stringContaining("Last logged: 12 sec") });
    const eased = buildWorkoutBlueprint({ ...options, recentWorkouts: [{ ...recentWorkouts[0], metadata: {
      ...recentWorkouts[0].metadata, effortRating: "too_hard"
    } }] });
    expect(eased.exercises.find(exercise => exercise.name === "Short Bar Hang")?.duration).toBe("5-10 sec");
  });

  it("prescribes the full hour for a cautious hotel session without extra resistance sets", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "hotel", equipment: "Bodyweight", goal: "strength",
      timeAvailable: "60", conservative: true, recentWorkouts: [] });
    expect(blueprint.estimatedDurationMinutes).toBeGreaterThanOrEqual(59);
    expect(blueprint.estimatedDurationMinutes).toBeLessThanOrEqual(64);
    expect(blueprint.exercises.filter(exercise => exercise.sets).every(exercise => exercise.sets === 2)).toBe(true);
    expect(blueprint.exercises.filter(exercise => /March|Side Step/.test(exercise.name))).toHaveLength(2);
  });

  it("keeps a timed cardio block the same length when it is swapped", () => {
    const workout = applyWorkoutBlueprint(plan, buildWorkoutBlueprint({ ...base, goal: "general_fitness",
      location: "gym", equipment: "Full Gym", timeAvailable: "45", recentWorkouts: [] }));
    const index = workout.exercises.findIndex(exercise => exercise.duration?.includes("min"));
    expect(index).toBeGreaterThanOrEqual(0);
    const swapped = rotateWorkoutExercise(workout, index);
    expect(swapped?.exercises[index].duration).toBe(workout.exercises[index].duration);
  });

  it("shows a shorter estimate when a long recovery walk is swapped for compact movement", () => {
    const workout = applyWorkoutBlueprint(plan, buildWorkoutBlueprint({ ...base, goal: "recovery",
      location: "outdoors", equipment: "Bodyweight", timeAvailable: "60", recentWorkouts: [] }));
    const index = workout.exercises.findIndex(exercise => exercise.name === "Easy Walk");
    expect(index).toBeGreaterThanOrEqual(0);
    const swapped = rotateWorkoutExercise(workout, index);
    expect(swapped?.exercises[index].duration).toBe("15 min");
    expect(swapped?.estimatedDurationMinutes).toBeLessThan(workout.estimatedDurationMinutes);
  });

  it("honors avoided exercises when adding movement to fill the hour", () => {
    const home = buildWorkoutBlueprint({ ...base, goal: "strength", timeAvailable: "60",
      avoidExercises: ["Easy Walk"], recentWorkouts: [] });
    expect(home.exercises.map(exercise => exercise.name)).not.toContain("Easy Walk");
    expect(home.estimatedDurationMinutes).toBeGreaterThanOrEqual(59);
    const hotel = buildWorkoutBlueprint({ ...base, location: "hotel", equipment: "Bodyweight", goal: "strength",
      timeAvailable: "60", conservative: true, avoidExercises: ["March in Place"], recentWorkouts: [] });
    expect(hotel.exercises.map(exercise => exercise.name)).not.toContain("March in Place");
    expect(hotel.estimatedDurationMinutes).toBeGreaterThanOrEqual(59);
    const allHotelCardioAvoided = buildWorkoutBlueprint({ ...base, location: "hotel", equipment: "Bodyweight", goal: "strength",
      timeAvailable: "60", conservative: true,
      avoidExercises: ["March in Place", "Side Step Touch", "Gentle Knee March"], recentWorkouts: [] });
    expect(allHotelCardioAvoided.exercises.map(exercise => exercise.name)).not.toContain("March in Place");
    expect(allHotelCardioAvoided.exercises.map(exercise => exercise.name)).not.toContain("Side Step Touch");
    expect(allHotelCardioAvoided.exercises.map(exercise => exercise.name)).not.toContain("Gentle Knee March");
    expect(allHotelCardioAvoided.estimatedDurationMinutes).toBeLessThan(55);
    expect(allHotelCardioAvoided.whyToday).toContain("shorter than your chosen time");
    const recovery = buildWorkoutBlueprint({ ...base, location: "hotel", equipment: "Bodyweight", goal: "recovery",
      timeAvailable: "60", avoidExercises: ["March in Place", "Side Step Touch", "Gentle Knee March"], recentWorkouts: [] });
    expect(recovery.exercises.every(exercise => !["March in Place", "Side Step Touch", "Gentle Knee March"].includes(exercise.name))).toBe(true);
    expect(recovery.exercises.flatMap(exercise => exercise.alternatives ?? [])
      .every(exercise => !["March in Place", "Side Step Touch", "Gentle Knee March"].includes(exercise.name))).toBe(true);
    expect(recovery.estimatedDurationMinutes).toBeLessThan(55);
    expect(recovery.whyToday).toContain("shorter than your chosen time");
  });

  it("does not call a lower-body outdoor session balanced full-body work", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", equipment: "Bodyweight",
      goal: "general_fitness", timeAvailable: "45", conservative: true, recentWorkouts: [] });
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Pull-Up");
    expect(blueprint.focus).toBe("Outdoor movement and conditioning");
    expect(blueprint.whyToday).toContain("limited upper-body resistance");
  });

  it("does not label a short gym session bodyweight when gym equipment was selected", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "gym", equipment: "Full Gym",
      goal: "fat_loss", timeAvailable: "20", recentWorkouts: [] });
    expect(blueprint.focus).toBe("Strength and conditioning");
  });

  it("makes every selected equipment choice meaningful across goals, durations, and conservative profiles", () => {
    const choices = [
      { location: "gym", equipment: "Full Gym", kit: "gym" },
      { location: "gym", equipment: "Limited Gym", kit: "dumbbells" },
      { location: "gym", equipment: "Dumbbells at Gym", kit: "dumbbells" },
      { location: "home", equipment: "Dumbbells", kit: "dumbbells" },
      { location: "home", equipment: "Long Resistance Band", kit: "bands" },
      { location: "home", equipment: "Sturdy Chair", kit: "chair" },
      { location: "home", equipment: "Low Step", kit: "low_step" },
      { location: "hotel", equipment: "Dumbbells", kit: "dumbbells" },
      { location: "hotel", equipment: "Long Resistance Band", kit: "bands" },
      { location: "outdoors", equipment: "Walking or Running Route", kit: "route" },
      { location: "outdoors", equipment: "Park Bench", kit: "park_bench" },
      { location: "outdoors", equipment: "Low Exercise Bar", kit: "low_bar" },
      { location: "outdoors", equipment: "Pull-Up Bar", kit: "pullup_bar" },
      { location: "outdoors", equipment: "Exercise Mat", kit: "mat" }
    ];
    for (const { location, equipment, kit } of choices) {
      for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness", "recovery", "mobility"]) {
        for (const timeAvailable of ["20", "30", "45", "60"]) {
          for (const conservative of [false, true]) {
            const blueprint = buildWorkoutBlueprint({ ...base, location, equipment, goal, timeAvailable, conservative, recentWorkouts: [] });
            const usesEquipment = blueprint.exercises.some(exercise => {
              const item = V2_WORKOUT_CATALOG.find(candidate => candidate.name === exercise.name);
              return kit === "mat" ? item?.requiresFloor === true : item?.kit.some(value => value === kit) === true;
            });
            const label = `${location}/${equipment}/${goal}/${timeAvailable}/${conservative}`;
            if (!usesEquipment) {
              expect(blueprint.whyToday.toLowerCase(), label).toContain(equipment.toLowerCase() === "walking or running route" ? "chosen route" : equipment.toLowerCase());
            }
            if (!["recovery", "mobility"].includes(goal) && !(timeAvailable === "20" &&
              equipment === "Walking or Running Route" && ["strength", "muscle_gain"].includes(goal))) {
              expect(usesEquipment, label).toBe(true);
            }
          }
        }
      }
    }
  }, 20_000);

  it("uses a chosen outdoor route even when the short strength template has no cardio slot", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", equipment: "Walking or Running Route",
      goal: "strength", timeAvailable: "20", recentWorkouts: [] });
    const workout = applyWorkoutBlueprint(plan, blueprint);
    expect(workout.warmup[0]).toContain("chosen route");
    expect(workout.cooldown[0]).toContain("chosen route");
  });

  it("explains why selected equipment is set aside for a same-day recovery session", () => {
    const blueprint = buildWorkoutBlueprint({ ...base, location: "outdoors", equipment: "Pull-Up Bar", goal: "strength",
      timeAvailable: "45", recentWorkouts: [{
        metadata: { evidenceType: "completed_plan", exercises: [{ name: "Bodyweight Squat" }] },
        created_at: "2026-10-03T08:00:00.000Z"
      }] });
    expect(blueprint.focus).toBe("Recovery and mobility");
    expect(blueprint.exercises.map(exercise => exercise.name)).not.toContain("Short Bar Hang");
    expect(blueprint.whyToday).toContain("pull-up bar is available, but this easy session does not need it");
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
      { location: "outdoors", equipment: "Park Bench" },
      { location: "outdoors", equipment: "Low Exercise Bar" },
      { location: "outdoors", equipment: "Pull-Up Bar" },
      { location: "outdoors", equipment: "Exercise Mat" },
      { location: "outdoors", equipment: "Park Bench or Bars" },
      { location: "home", equipment: "Bodyweight" },
      { location: "home", equipment: "Dumbbells" },
      { location: "home", equipment: "Resistance Bands" },
      { location: "home", equipment: "Long Resistance Band" },
      { location: "home", equipment: "Sturdy Chair" },
      { location: "home", equipment: "Low Step" },
      { location: "hotel", equipment: "Bodyweight" },
      { location: "hotel", equipment: "Dumbbells" },
      { location: "hotel", equipment: "Resistance Bands" },
      { location: "hotel", equipment: "Long Resistance Band" },
      { location: "gym", equipment: "Limited Gym" },
      { location: "gym", equipment: "Full Gym" }
    ];
    for (const goal of ["strength", "muscle_gain", "fat_loss", "general_fitness", "recovery", "mobility"]) {
      for (const timeAvailable of ["20", "30", "45", "60"]) {
        for (const setting of settings) {
          for (const conservative of [false, true]) {
            const blueprint = buildWorkoutBlueprint({ ...base, ...setting, goal, timeAvailable, conservative, recentWorkouts: [] });
            const label = `${goal} ${timeAvailable} ${setting.location} ${setting.equipment} conservative=${conservative}`;
            const maximumMoves: Record<string, number> = { "20": 4, "30": 5, "45": 6, "60": 8 };
            expect(blueprint.exercises.length, label).toBeLessThanOrEqual(maximumMoves[timeAvailable]);
            expect(new Set(blueprint.exercises.map(exercise => exercise.name)).size, label).toBe(blueprint.exercises.length);
            expect(blueprint.estimatedDurationMinutes, label).toBe(estimateWorkoutDurationMinutes(blueprint.exercises));
            const minimum: Record<string, number> = { "20": 17, "30": 26, "45": 39, "60": 59 };
            expect(blueprint.estimatedDurationMinutes, label).toBeGreaterThanOrEqual(minimum[timeAvailable]);
            expect(blueprint.estimatedDurationMinutes, label).toBeLessThanOrEqual(Number(timeAvailable) + 2);
            const workout = applyWorkoutBlueprint(plan, blueprint);
            for (const [index, exercise] of workout.exercises.entries()) {
              expect(exercise.alternatives?.length, `${label}: ${exercise.name}`).toBeGreaterThan(0);
              expect(rotateWorkoutExercise(workout, index), `${label}: ${exercise.name}`).not.toBeNull();
            }
            let afterSwaps = workout;
            for (let index = 0; index < afterSwaps.exercises.length; index++) {
              if (!afterSwaps.exercises[index].alternatives?.length) continue;
              const swapped = rotateWorkoutExercise(afterSwaps, index);
              expect(swapped, `${label}: sequential swap ${index}`).not.toBeNull();
              afterSwaps = swapped!;
            }
            for (const exercise of blueprint.exercises.flatMap(item => [item, ...(item.alternatives ?? [])])) {
              expect(exercise.reps || exercise.duration, `${label} ${exercise.name}`).toBeTruthy();
              expect(resolveV2WorkoutExerciseVisual(exercise.name).status, `${label} ${exercise.name}`).toBe("resolved");
              expect(exercise.name, label).not.toBe("Standing Band Pallof Press");
              if (setting.location !== "hotel") expect(exercise.name, label).not.toBe("Gentle Knee March");
            }
          }
        }
      }
    }
  }, 15_000);
});
