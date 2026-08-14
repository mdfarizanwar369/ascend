import { describe, expect, it } from "vitest";
import { buildSelfDeletionPlan, runDeletionStages, SelfDeletionTarget } from "../services/accountDeletionService";
import { vi } from "vitest";

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

describe("durable deletion stages", () => {
  it.each(["firebase", "storage", "database"] as const)("stops safely when the %s stage fails", async (failedStage) => {
    const calls: string[] = [];
    const dependency = (stage: string) => vi.fn(async () => {
      calls.push(stage);
      if (stage === failedStage) throw new Error(`injected ${stage} failure`);
    });
    const markStageComplete = vi.fn(async (stage: string) => { calls.push(`marked:${stage}`); });

    await expect(runDeletionStages(
      { firebaseDeleted: false, storageDeleted: false, databaseDeleted: false },
      {
        deleteFirebase: dependency("firebase"),
        deleteStorage: dependency("storage"),
        deleteDatabase: dependency("database"),
        markStageComplete
      }
    )).rejects.toThrow(`injected ${failedStage} failure`);

    expect(calls).not.toContain(`marked:${failedStage}`);
    if (failedStage === "firebase") expect(calls).not.toContain("storage");
    if (failedStage === "storage") expect(calls).not.toContain("database");
  });

  it("resumes without repeating completed external stages", async () => {
    const deleteFirebase = vi.fn(async () => undefined);
    const deleteStorage = vi.fn(async () => undefined);
    const deleteDatabase = vi.fn(async () => undefined);
    const markStageComplete = vi.fn(async () => undefined);

    await runDeletionStages(
      { firebaseDeleted: true, storageDeleted: true, databaseDeleted: false },
      { deleteFirebase, deleteStorage, deleteDatabase, markStageComplete }
    );

    expect(deleteFirebase).not.toHaveBeenCalled();
    expect(deleteStorage).not.toHaveBeenCalled();
    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(markStageComplete).toHaveBeenCalledWith("database");
  });
});
