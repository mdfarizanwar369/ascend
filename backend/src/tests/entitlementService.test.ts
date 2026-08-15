import { describe, expect, it } from "vitest";
import { entitlementGrantsAccess } from "../services/entitlementService";

describe("effective entitlement access window", () => {
  const now = new Date("2026-08-15T00:00:00Z").getTime();

  it("grants active and grace access only while the entitlement is unexpired", () => {
    expect(entitlementGrantsAccess("active", "2026-08-16T00:00:00Z", now)).toBe(true);
    expect(entitlementGrantsAccess("grace_period", "2026-08-16T00:00:00Z", now)).toBe(true);
    expect(entitlementGrantsAccess("active", "2026-08-14T00:00:00Z", now)).toBe(false);
    expect(entitlementGrantsAccess("grace_period", "2026-08-14T00:00:00Z", now)).toBe(false);
  });

  it("preserves canceled access until its paid-through date only", () => {
    expect(entitlementGrantsAccess("canceled", "2026-08-16T00:00:00Z", now)).toBe(true);
    expect(entitlementGrantsAccess("canceled", "2026-08-14T00:00:00Z", now)).toBe(false);
    expect(entitlementGrantsAccess("canceled", null, now)).toBe(false);
  });

  it("does not grant access for pending or account-hold states", () => {
    expect(entitlementGrantsAccess("pending", "2026-08-16T00:00:00Z", now)).toBe(false);
    expect(entitlementGrantsAccess("on_hold", "2026-08-16T00:00:00Z", now)).toBe(false);
  });
});
