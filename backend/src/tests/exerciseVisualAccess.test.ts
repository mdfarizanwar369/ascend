import { describe, expect, it } from "vitest";
import { hasExerciseVisualAccess } from "../services/exerciseVisualAccess";

describe("exercise visual pilot access", () => {
  it("fails closed when the pilot switch is off", () => {
    expect(hasExerciseVisualAccess({ id: "owner", isPlatformOwner: true }, { enabled: false, userIds: "owner" })).toBe(false);
  });

  it("allows the platform owner when the pilot is on", () => {
    expect(hasExerciseVisualAccess({ id: "owner", isPlatformOwner: true }, { enabled: true, userIds: "" })).toBe(true);
  });

  it("allows only explicitly selected non-owner accounts", () => {
    const config = { enabled: true, userIds: "first, selected-user ,third" };
    expect(hasExerciseVisualAccess({ id: "selected-user", isPlatformOwner: false }, config)).toBe(true);
    expect(hasExerciseVisualAccess({ id: "other-user", isPlatformOwner: false }, config)).toBe(false);
  });
});
