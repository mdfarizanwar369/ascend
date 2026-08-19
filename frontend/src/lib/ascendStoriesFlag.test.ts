import { afterEach, describe, expect, it, vi } from "vitest";
import { ascendStoriesEnabled } from "./ascendStoriesFlag";

describe("Ascend Stories feature flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is enabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "");
    expect(ascendStoriesEnabled()).toBe(true);
  });

  it("can be explicitly disabled as an emergency rollback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "false");
    expect(ascendStoriesEnabled()).toBe(false);
  });

  it("is available in local development without a second flag system", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "");
    expect(ascendStoriesEnabled()).toBe(true);
  });
});
