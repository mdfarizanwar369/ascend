import { afterEach, describe, expect, it, vi } from "vitest";
import { ascendStoriesEnabled } from "./ascendStoriesFlag";

describe("Ascend Stories feature flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "");
    expect(ascendStoriesEnabled()).toBe(false);
  });

  it("can be explicitly enabled for controlled production testing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "true");
    expect(ascendStoriesEnabled()).toBe(true);
  });

  it("is available in local development without a second flag system", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_ASCEND_STORIES_V1", "");
    expect(ascendStoriesEnabled()).toBe(true);
  });
});
