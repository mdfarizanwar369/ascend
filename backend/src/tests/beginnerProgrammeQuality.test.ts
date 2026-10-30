import { describe, expect, it } from "vitest";
import { estimateWorkoutDurationMinutes, resolveV2WorkoutExerciseVisual } from "@ascend/shared";
import { buildWorkoutBlueprint, V2_WORKOUT_CATALOG } from "../services/workoutPlanQualityService";

const now = new Date("2026-10-30T04:00:00Z");
const base = { goal: "general_fitness", location: "gym", equipment: "Full Gym", timeAvailable: "30",
  today: "2026-10-30", now, recentWorkouts: [], beginnerProgramme: {
    nextSessionKind: "A" as const, completedSessions: 0, anchorExercises: [], lastCompletedAt: null
  } };
const patternOf = (name: string) => V2_WORKOUT_CATALOG.find(item => item.name === name)?.pattern;

describe("beginner routine prescriptions", () => {
  it("keeps both A and B full body with modest volume and no advanced exercises", () => {
    for (const nextSessionKind of ["A", "B"] as const) {
      const blueprint = buildWorkoutBlueprint({ ...base, goal: "strength", timeAvailable: "45",
        beginnerProgramme: { ...base.beginnerProgramme, nextSessionKind } });
      const patterns = blueprint.exercises.map(exercise => patternOf(exercise.name));
      expect(patterns).toContain("push");
      expect(patterns).toContain("pull");
      expect(patterns).toContain("hinge");
      expect(patterns).toContain(nextSessionKind === "A" ? "squat" : "single_leg");
      for (const exercise of blueprint.exercises) {
        expect(V2_WORKOUT_CATALOG.find(item => item.name === exercise.name)?.advanced).not.toBe(true);
        if (["squat", "hinge", "push", "pull", "single_leg"].includes(patternOf(exercise.name) ?? "")) {
          expect(exercise.sets).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("retains comparable main movements rather than randomizing completed practice away", () => {
    const original = buildWorkoutBlueprint(base);
    const anchorExercises = original.exercises.filter(exercise => ["squat", "push", "pull"].includes(patternOf(exercise.name) ?? "")).map(exercise => exercise.name);
    const next = buildWorkoutBlueprint({ ...base, beginnerProgramme: { ...base.beginnerProgramme,
      completedSessions: 2, anchorExercises, lastCompletedAt: "2026-10-27T04:00:00Z" }, recentWorkouts: [{
      created_at: "2026-10-27T04:00:00Z", metadata: { evidenceType: "completed_plan", exercises: original.exercises.map(exercise => ({ name: exercise.name })) }
    }] });
    for (const name of anchorExercises) expect(next.exercises.map(exercise => exercise.name)).toContain(name);
    expect(next.whyToday).toContain("Familiar main movements");
  });

  it("uses actual elapsed recovery time without consuming the next strength session", () => {
    const recent = buildWorkoutBlueprint({ ...base, beginnerProgramme: { ...base.beginnerProgramme,
      completedSessions: 1, nextSessionKind: "B", lastCompletedAt: "2026-10-29T04:00:00Z" } });
    expect(recent.focus).toBe("Recovery and mobility");
    expect(recent.whyToday).toContain("does not advance your routine");
    expect(recent.exercises.every(exercise => !["squat", "hinge", "push", "pull"].includes(patternOf(exercise.name) ?? ""))).toBe(true);
    const recovered = buildWorkoutBlueprint({ ...base, beginnerProgramme: { ...base.beginnerProgramme,
      completedSessions: 1, nextSessionKind: "B", lastCompletedAt: "2026-10-28T04:00:00Z" } });
    expect(recovered.focus).not.toBe("Recovery and mobility");
  });

  it("returns after a break without losing history or suggesting an old load increase", () => {
    const returned = buildWorkoutBlueprint({ ...base, beginnerProgramme: { ...base.beginnerProgramme,
      completedSessions: 8, lastCompletedAt: "2026-10-01T04:00:00Z" } });
    expect(returned.whyToday).toContain("keeping your routine history");
    expect(returned.exercises.every(exercise => exercise.note?.includes("comfortable starting effort"))).toBe(true);
    expect(returned.exercises.some(exercise => exercise.note?.includes("weight increase"))).toBe(false);
  });

  it("keeps every supported time and setting executable, illustrated and honest", () => {
    const settings = [
      { location: "gym", equipment: "Full Gym" }, { location: "gym", equipment: "Limited Gym" },
      { location: "home", equipment: "Bodyweight" }, { location: "home", equipment: "Dumbbells" },
      { location: "home", equipment: "Resistance Bands" }, { location: "home", equipment: "Sturdy Chair" },
      { location: "home", equipment: "Low Step" }, { location: "hotel", equipment: "Bodyweight" },
      { location: "hotel", equipment: "Dumbbells" }, { location: "hotel", equipment: "Long Resistance Band" },
      { location: "outdoors", equipment: "Bodyweight" }, { location: "outdoors", equipment: "Park Bench" },
      { location: "outdoors", equipment: "Low Exercise Bar" }, { location: "outdoors", equipment: "Pull-Up Bar" },
      { location: "outdoors", equipment: "Exercise Mat" }, { location: "outdoors", equipment: "Walking or Running Route" }
    ];
    for (const setting of settings) for (const timeAvailable of ["20", "30", "45", "60"]) {
      for (const nextSessionKind of ["A", "B"] as const) {
        const blueprint = buildWorkoutBlueprint({ ...base, ...setting, timeAvailable,
          beginnerProgramme: { ...base.beginnerProgramme, nextSessionKind } });
        const label = `${setting.location}/${setting.equipment}/${timeAvailable}/${nextSessionKind}`;
        expect(blueprint.estimatedDurationMinutes, label).toBe(estimateWorkoutDurationMinutes(blueprint.exercises));
        expect(blueprint.estimatedDurationMinutes, label).toBeGreaterThanOrEqual(({ "20": 17, "30": 26, "45": 39, "60": 59 })[timeAvailable]!);
        expect(blueprint.estimatedDurationMinutes, label).toBeLessThanOrEqual(Number(timeAvailable) + 2);
        expect(new Set(blueprint.exercises.map(exercise => exercise.name)).size, label).toBe(blueprint.exercises.length);
        for (const exercise of blueprint.exercises.flatMap(item => [item, ...(item.alternatives ?? [])])) {
          expect(resolveV2WorkoutExerciseVisual(exercise.name).status, `${label}/${exercise.name}`).toBe("resolved");
          expect(exercise.reps || exercise.duration, `${label}/${exercise.name}`).toBeTruthy();
        }
        if (setting.location !== "gym") expect(blueprint.exercises.some(exercise => /machine|barbell|cable/i.test(exercise.name)), label).toBe(false);
      }
    }
  });
});
