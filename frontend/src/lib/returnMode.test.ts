import { afterEach, describe, expect, it, vi } from "vitest";
import { firstNameFromFullName, isReturnModeV1Enabled } from "./returnMode";

describe("Return Mode frontend helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("can be explicitly disabled for production rollout safety", () => {
    vi.stubEnv("NEXT_PUBLIC_RETURN_MODE_V1", "false");
    expect(isReturnModeV1Enabled()).toBe(false);
  });

  it("can be explicitly enabled for local validation", () => {
    vi.stubEnv("NEXT_PUBLIC_RETURN_MODE_V1", "true");
    expect(isReturnModeV1Enabled()).toBe(true);
  });

  it("uses only the safe first name and supports Unicode", () => {
    expect(firstNameFromFullName("  Nurin Najwa Binti Rohidi ")).toBe("Nurin");
    expect(firstNameFromFullName("李 小龙")).toBe("李");
    expect(firstNameFromFullName(" ")).toBeNull();
  });
});
