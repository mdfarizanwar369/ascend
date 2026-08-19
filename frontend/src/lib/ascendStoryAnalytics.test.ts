import { describe, expect, it, vi } from "vitest";
import { recordAscendStoryEvent, sanitizeAscendStoryAnalyticsProperties } from "./ascendStoryAnalytics";

describe("Ascend Stories analytics contract", () => {
  it("removes sensitive and unsupported properties", () => {
    expect(sanitizeAscendStoryAnalyticsProperties({
      format: "today",
      style: "quiet",
      platform: "web",
      caption: "private words",
      weight: 72,
      signedUrl: "https://example.test/private"
    })).toEqual({ format: "today", style: "quiet", platform: "web" });
  });

  it("emits only the documented privacy-safe detail", () => {
    const listener = vi.fn();
    window.addEventListener("ascend:analytics", listener);
    recordAscendStoryEvent("ascend_story_opened", { format: "earned", style: "cinematic" });
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      event: "ascend_story_opened",
      format: "earned",
      style: "cinematic"
    });
    window.removeEventListener("ascend:analytics", listener);
  });
});
