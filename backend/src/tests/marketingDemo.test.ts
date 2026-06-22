import { describe, expect, it } from "vitest";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS } from "@ascend/shared";

describe("marketing demo timeline", () => {
  it("spans exactly 30 seconds", () => {
    expect(MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0)).toBe(30000);
  });

  it("moves through scenes and loops cleanly", () => {
    expect(getMarketingDemoFrame(0).sceneIndex).toBe(0);
    expect(getMarketingDemoFrame(3500).sceneIndex).toBe(1);
    expect(getMarketingDemoFrame(29999).sceneIndex).toBe(7);
    expect(getMarketingDemoFrame(30000).sceneIndex).toBe(0);
  });

  it("returns bounded progress values", () => {
    const frame = getMarketingDemoFrame(12650);
    expect(frame.sceneProgress).toBeGreaterThanOrEqual(0);
    expect(frame.sceneProgress).toBeLessThan(1);
    expect(frame.totalProgress).toBeGreaterThanOrEqual(0);
    expect(frame.totalProgress).toBeLessThan(1);
  });
});
