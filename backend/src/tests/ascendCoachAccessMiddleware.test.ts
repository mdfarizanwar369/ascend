import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../middleware/auth";
import { createRequireAscendCoachShellAccess } from "../middleware/ascendCoachAccess";

const trainer: AuthUser = {
  id: "trainer-user",
  firebaseUid: "trainer-firebase",
  email: "trainer@example.com",
  roles: ["trainer"],
  primaryRole: "trainer",
  trainerId: "trainer-profile",
  isPlatformOwner: false
};

function invoke(actor: AuthUser | undefined, featureEnabled = true) {
  const status = vi.fn();
  const json = vi.fn();
  status.mockReturnValue({ json });
  const next = vi.fn();
  const middleware = createRequireAscendCoachShellAccess({ featureEnabled: () => featureEnabled });
  middleware({ user: actor } as never, { status } as never, next);
  return { status, json, next };
}

describe("Ascend Coach production shell middleware", () => {
  it("allows an authenticated trainer", () => {
    const result = invoke(trainer);
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it("allows only the authenticated Platform Owner owner path", () => {
    const result = invoke({ ...trainer, roles: ["owner", "admin"], primaryRole: "owner", trainerId: undefined, isPlatformOwner: true });
    expect(result.next).toHaveBeenCalledOnce();
  });

  it.each([
    ["normal member", { ...trainer, roles: ["client"], primaryRole: "client", trainerId: undefined }],
    ["ordinary admin", { ...trainer, roles: ["admin"], primaryRole: "admin", trainerId: undefined }]
  ])("denies an authenticated %s", (_label, actor) => {
    const result = invoke(actor as AuthUser);
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ code: "coach_role_required" }));
    expect(result.next).not.toHaveBeenCalled();
  });

  it("denies unauthenticated requests", () => {
    const result = invoke(undefined);
    expect(result.status).toHaveBeenCalledWith(401);
    expect(result.next).not.toHaveBeenCalled();
  });

  it("keeps the backend kill switch authoritative for every eligible role", () => {
    for (const actor of [trainer, { ...trainer, roles: ["owner", "admin"] as AuthUser["roles"], primaryRole: "owner" as const, trainerId: undefined, isPlatformOwner: true }]) {
      const result = invoke(actor, false);
      expect(result.status).toHaveBeenCalledWith(404);
      expect(result.json).toHaveBeenCalledWith(expect.objectContaining({ code: "feature_disabled" }));
      expect(result.next).not.toHaveBeenCalled();
    }
  });
});
