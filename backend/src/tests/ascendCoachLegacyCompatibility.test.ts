import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  featureEnabled: vi.fn(),
  fullCoachAccess: vi.fn(),
  getAdminGymScope: vi.fn(),
  scopeAllowsGym: vi.fn()
}));

vi.mock("../db/pool", () => ({ query: mocks.query }));
vi.mock("../services/ascendCoachPolicyService", () => ({
  ascendCoachV1Enabled: mocks.featureEnabled,
  hasFullLegacyCoachAccess: mocks.fullCoachAccess
}));
vi.mock("../services/adminScopeService", () => ({
  getAdminGymScope: mocks.getAdminGymScope,
  scopeAllowsGym: mocks.scopeAllowsGym
}));

import { canManageClient } from "../services/clientAccessService";

const trainer = {
  id: "trainer-user",
  firebaseUid: "firebase",
  email: "trainer@example.com",
  primaryRole: "trainer" as const,
  roles: ["trainer" as const],
  trainerId: "trainer-profile",
  isPlatformOwner: false
};

describe("legacy assigned-client compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureEnabled.mockReturnValue(false);
  });

  it("preserves the assigned_trainer_id authorization path while the flag is off", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ assigned_trainer_id: "trainer-profile", gym_id: "gym-a", primary_role: "client", status: "active" }]
    });

    await expect(canManageClient(trainer, "client-user")).resolves.toBe(true);
    expect(mocks.fullCoachAccess).not.toHaveBeenCalled();
  });

  it("uses only the relationship policy while the flag is on", async () => {
    mocks.featureEnabled.mockReturnValue(true);
    mocks.fullCoachAccess.mockResolvedValue(true);

    await expect(canManageClient(trainer, "client-user")).resolves.toBe(true);
    expect(mocks.fullCoachAccess).toHaveBeenCalledWith(trainer, "client-user");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does not preserve the old automatic Platform Owner bypass after rollout", async () => {
    mocks.featureEnabled.mockReturnValue(true);
    mocks.fullCoachAccess.mockResolvedValue(false);
    const owner = { ...trainer, primaryRole: "owner" as const, roles: ["owner" as const, "admin" as const], trainerId: undefined, isPlatformOwner: true };

    await expect(canManageClient(owner, "client-user")).resolves.toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
