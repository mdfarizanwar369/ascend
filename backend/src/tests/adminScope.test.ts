import { describe, expect, it } from "vitest";
import { scopeAllowsGym } from "../services/adminScopeService";

describe("gym owner isolation", () => {
  it("allows the platform owner to access every gym", () => {
    expect(scopeAllowsGym({ gymIds: null, isPlatformOwner: true }, "gym-b")).toBe(true);
  });

  it("allows a gym owner to access an assigned gym", () => {
    expect(scopeAllowsGym({ gymIds: ["gym-a"], isPlatformOwner: false }, "gym-a")).toBe(true);
  });

  it("blocks a gym owner from another gym or an unassigned user", () => {
    const scope = { gymIds: ["gym-a"], isPlatformOwner: false };
    expect(scopeAllowsGym(scope, "gym-b")).toBe(false);
    expect(scopeAllowsGym(scope, null)).toBe(false);
  });
});
