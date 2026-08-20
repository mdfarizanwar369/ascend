import { describe, expect, it } from "vitest";
import { authStateAction } from "./AuthStateGuard";

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
});
