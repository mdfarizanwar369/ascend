import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../db/pool", () => ({ query: queryMock }));

import { backfillWorkoutExerciseObservations } from "../services/workoutProgressionV3Service";

describe("Workout Progression V3 persistence", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("backfills many workouts with a fixed number of database round trips", async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("select id, user_id, metadata, created_at from analytics_events")) {
        return {
          rows: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              user_id: "user-1",
              created_at: "2026-07-30T10:00:00.000Z",
              metadata: {
                source: "ai_workout_capture",
                workoutTitle: "Upper Body",
                workoutType: "Strength",
                workoutDifficulty: "moderate",
                exercises: [{ name: "Bench Press", sets: 3, reps: "10", load: 60, loadUnit: "kg" }]
              }
            },
            {
              id: "22222222-2222-4222-8222-222222222222",
              user_id: "user-1",
              created_at: "2026-07-27T10:00:00.000Z",
              metadata: {
                source: "trainer_logged_session",
                workoutTitle: "Upper Body",
                workoutType: "Strength",
                workoutDifficulty: "moderate",
                exercises: [{ name: "Bench Press", sets: 3, reps: "10", load: 55, loadUnit: "kg" }]
              }
            }
          ]
        };
      }
      if (sql.includes("from workout_exercise_aliases")) return { rows: [] };
      if (sql.includes("insert into workout_exercise_observations")) return { rows: [], rowCount: 2 };
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(backfillWorkoutExerciseObservations("user-1", 100)).resolves.toEqual({
      workoutsScanned: 2,
      observationsProjected: 2
    });
    expect(queryMock).toHaveBeenCalledTimes(3);
  });
});
