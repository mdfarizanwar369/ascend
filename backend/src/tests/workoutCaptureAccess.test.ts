import { describe, expect, it } from "vitest";
import { canUseWorkoutCapture } from "../services/workoutCaptureAccess";

describe("Workout Capture private pilot access", () => {
  it("allows only the platform owner while the feature is enabled", () => {
    expect(canUseWorkoutCapture(true, true)).toBe(true);
    expect(canUseWorkoutCapture(true, false)).toBe(false);
  });

  it("remains unavailable to everyone while the feature is disabled", () => {
    expect(canUseWorkoutCapture(false, true)).toBe(false);
    expect(canUseWorkoutCapture(false, false)).toBe(false);
  });
});
