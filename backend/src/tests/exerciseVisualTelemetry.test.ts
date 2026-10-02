import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }));
vi.mock("../db/pool", () => ({ query: mocks.query }));
import { recordGeneratedWorkoutVisuals, recordVisualUiEvent, safeAggregateExerciseName } from "../services/exerciseVisualTelemetry";

beforeEach(() => mocks.query.mockClear());

describe("privacy-safe visual pilot counters", () => {
  it("aggregates approved, ambiguous and safe unsupported exercise names without user or workout data", async () => {
    await recordGeneratedWorkoutVisuals({ exercises: [
      { name: "Glute Bridge" }, { name: "Glute Bridges" }, { name: "Goblet Squat" }, { name: "Box Squat" }
    ] });
    expect(mocks.query).toHaveBeenCalledTimes(3);
    const args = mocks.query.mock.calls.map(call => call[1]);
    expect(args).toContainEqual(["resolved", "glute bridge", "glute-bridge", 2]);
    expect(args).toContainEqual(["ambiguous", "goblet squat", "", 1]);
    expect(args).toContainEqual(["unresolved", "box squat", "", 1]);
    expect(JSON.stringify(args)).not.toMatch(/user_id|workout_id|note/i);
  });
  it("redacts any unsupported name that might contain personal or health details", () => {
    expect(safeAggregateExerciseName("Jane's rehab for diabetes")).toBe("[redacted]");
    expect(safeAggregateExerciseName("contact me at jane@example.com")).toBe("[redacted]");
    expect(safeAggregateExerciseName("90/90 Hip Switch")).toBe("[redacted]");
    expect(safeAggregateExerciseName("Wall Sit")).toBe("wall sit");
  });
  it("accepts only registry IDs for UI events", async () => {
    expect(await recordVisualUiEvent("detail_opened", "not-in-registry")).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(await recordVisualUiEvent("image_load_failure", "bird-dog")).toBe(true);
    expect(mocks.query.mock.calls[0][1]).toEqual(["image_load_failure", "bird-dog", "bird-dog"]);
  });
});
