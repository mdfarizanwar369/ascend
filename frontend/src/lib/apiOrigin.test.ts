import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("API origin during a hosting move", () => {
  it("keeps an explicitly configured API address", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com/api/v1");
    const { API_URL } = await import("./api");
    expect(API_URL).toBe("https://api.example.com/api/v1");
  });
  it("gives native integrations an absolute URL for the current frontend origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/v1");
    const { API_URL } = await import("./api");
    expect(API_URL).toBe(new URL("/api/v1", window.location.origin).href);
    expect(new URL(API_URL).origin).toBe(window.location.origin);
  });
});
