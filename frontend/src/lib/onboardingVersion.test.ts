import { describe, expect, it } from "vitest";
import { hasCompletedClientOnboardingProfile } from "./onboardingVersion";

describe("client onboarding compatibility", () => {
  it("keeps a legacy completed profile complete without human-context fields", () => {
    expect(hasCompletedClientOnboardingProfile({
      goal_type: "fat_loss",
      starting_weight_kg: 75
    })).toBe(true);
  });

  it("continues to identify an incomplete legacy profile from the original fields", () => {
    expect(hasCompletedClientOnboardingProfile({ goal_type: "fat_loss" })).toBe(false);
  });
});
