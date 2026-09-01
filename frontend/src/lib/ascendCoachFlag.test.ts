import { afterEach, describe, expect, it } from "vitest";
import { ascendCoachV1Enabled, canSeeAscendCoachShell } from "./ascendCoachFlag";

describe("Ascend Coach frontend flag", () => {
  const original = process.env.NEXT_PUBLIC_ASCEND_COACH_V1;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    else process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = original;
  });

  it("defaults off", () => {
    delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    expect(ascendCoachV1Enabled()).toBe(false);
  });

  it("requires an explicit true value", () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "true";
    expect(ascendCoachV1Enabled()).toBe(true);
  });

  it("implements the production role visibility matrix", () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "true";
    expect(canSeeAscendCoachShell({ roles: ["client"], primaryRole: "client" })).toBe(false);
    expect(canSeeAscendCoachShell({ roles: ["admin"], primaryRole: "admin" })).toBe(false);
    expect(canSeeAscendCoachShell({ roles: ["owner", "admin"], primaryRole: "owner", isPlatformOwner: false })).toBe(false);
    expect(canSeeAscendCoachShell({ roles: ["trainer"], primaryRole: "trainer" })).toBe(true);
    expect(canSeeAscendCoachShell({ roles: ["owner", "admin"], primaryRole: "owner", isPlatformOwner: true })).toBe(true);
    expect(canSeeAscendCoachShell({})).toBe(false);
  });

  it("keeps the frontend kill switch authoritative for trainers and Platform Owner", () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "false";
    expect(canSeeAscendCoachShell({ roles: ["trainer"] })).toBe(false);
    expect(canSeeAscendCoachShell({ roles: ["owner"], isPlatformOwner: true })).toBe(false);
  });
});
