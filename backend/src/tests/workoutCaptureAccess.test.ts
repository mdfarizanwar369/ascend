import { describe, expect, it } from "vitest";
import { workoutCaptureAccessFor } from "../services/workoutCaptureAccess";

const freeMember = {
  featureEnabled: true,
  primaryRole: "client" as const,
  roles: ["client" as const],
  activePlan: "free" as const,
  isPlatformOwner: false
};

describe("Workout Capture public access", () => {
  it("gives free members three detailed workouts in a rolling seven-day period", () => {
    expect(workoutCaptureAccessFor({ ...freeMember, used: 0 })).toMatchObject({
      enabled: true,
      canCapture: true,
      allowance: { tier: "free", limit: 3, used: 0, remaining: 3 }
    });
    expect(workoutCaptureAccessFor({ ...freeMember, used: 3 })).toMatchObject({
      enabled: true,
      canCapture: false,
      allowance: { tier: "free", limit: 3, used: 3, remaining: 0 }
    });
  });

  it("allows an idempotent retry after the free limit is reached", () => {
    expect(workoutCaptureAccessFor({ ...freeMember, used: 3, alreadySaved: true }).canCapture).toBe(true);
  });

  it("keeps Premium, Trainer Pro, admins, and the platform owner unlimited", () => {
    expect(workoutCaptureAccessFor({ ...freeMember, activePlan: "premium", used: 12 }).allowance?.limit).toBeNull();
    expect(workoutCaptureAccessFor({ ...freeMember, activePlan: "trainer_pro", used: 12 }).allowance?.limit).toBeNull();
    expect(workoutCaptureAccessFor({ ...freeMember, primaryRole: "admin", roles: ["admin"], used: 12 }).allowance?.limit).toBeNull();
    expect(workoutCaptureAccessFor({ ...freeMember, isPlatformOwner: true, used: 12 }).allowance?.limit).toBeNull();
  });

  it("remains unavailable to everyone while the feature is disabled", () => {
    expect(workoutCaptureAccessFor({ ...freeMember, featureEnabled: false, used: 0 })).toEqual({
      enabled: false,
      canCapture: false,
      allowance: null
    });
  });
});
