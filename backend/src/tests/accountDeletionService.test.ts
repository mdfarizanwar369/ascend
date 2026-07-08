import { describe, expect, it } from "vitest";
import { buildSelfDeletionPlan, SelfDeletionTarget } from "../services/accountDeletionService";

function target(overrides: Partial<SelfDeletionTarget> = {}): SelfDeletionTarget {
  return {
    id: "user-1",
    firebaseUid: "firebase-1",
    email: "member@example.com",
    fullName: "Member",
    primaryRole: "client",
    roles: ["client"],
    status: "active",
    trainerId: null,
    hasLivePaidSubscription: false,
    isPlatformOwner: false,
    ...overrides
  };
}

describe("self account deletion planning", () => {
  it("allows immediate deletion for a standard client account", () => {
    expect(buildSelfDeletionPlan(target())).toEqual({
      mode: "immediate",
      reasonCodes: []
    });
  });

  it("requires manual review for a live paid subscription", () => {
    expect(buildSelfDeletionPlan(target({ hasLivePaidSubscription: true }))).toEqual({
      mode: "manual_review",
      reasonCodes: ["live_paid_subscription"]
    });
  });

  it("requires manual review for trainers and managed roles", () => {
    expect(buildSelfDeletionPlan(target({ primaryRole: "trainer", roles: ["trainer"] }))).toEqual({
      mode: "manual_review",
      reasonCodes: ["managed_role"]
    });
  });

  it("requires manual review for the platform owner", () => {
    expect(buildSelfDeletionPlan(target({ isPlatformOwner: true, primaryRole: "owner", roles: ["owner", "admin"] }))).toEqual({
      mode: "manual_review",
      reasonCodes: ["platform_owner", "managed_role"]
    });
  });
});
