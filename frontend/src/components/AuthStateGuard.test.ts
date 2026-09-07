import { describe, expect, it } from "vitest";
import { authStateAction, isPublicPath, localE2EAuthBypassEnabled } from "./AuthStateGuard";

describe("AuthStateGuard", () => {
  it("redirects an initially signed-out visitor away from a protected route", () => {
    expect(authStateAction(undefined, null, "/dashboard")).toBe("login");
  });

  it("keeps an authenticated visitor on the protected route", () => {
    expect(authStateAction(undefined, "member-1", "/dashboard")).toBeNull();
  });

  it("reloads protected state when the signed-in account changes", () => {
    expect(authStateAction("member-1", "member-2", "/trainer")).toBe("reload");
  });

  it("does not redirect while already on login", () => {
    expect(authStateAction("member-1", null, "/login")).toBeNull();
  });

  it("keeps the public product demo accessible without an account", () => {
    expect(isPublicPath("/demo")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
  });

  it("allows the browser E2E auth bypass only for local non-production runs", () => {
    expect(localE2EAuthBypassEnabled("localhost", "development", "e2e-token")).toBe(true);
    expect(localE2EAuthBypassEnabled("127.0.0.1", "test", "e2e-token")).toBe(true);
    expect(localE2EAuthBypassEnabled("www.getascend.fit", "development", "e2e-token")).toBe(false);
    expect(localE2EAuthBypassEnabled("localhost", "production", "e2e-token")).toBe(false);
    expect(localE2EAuthBypassEnabled("localhost", "development", "")).toBe(false);
  });
});
