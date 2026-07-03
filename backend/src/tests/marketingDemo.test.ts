import { describe, expect, it } from "vitest";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS } from "@ascend/shared";

describe("marketing demo timeline", () => {
  it("spans exactly 48 seconds", () => {
    expect(MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0)).toBe(48000);
  });

  it("moves through scenes and loops cleanly", () => {
    expect(getMarketingDemoFrame(0).sceneIndex).toBe(0);
    expect(getMarketingDemoFrame(6000).sceneIndex).toBe(1);
    expect(getMarketingDemoFrame(47999).sceneIndex).toBe(7);
    expect(getMarketingDemoFrame(48000).sceneIndex).toBe(0);
  });

  it("returns bounded progress values", () => {
    const frame = getMarketingDemoFrame(12650);
    expect(frame.sceneProgress).toBeGreaterThanOrEqual(0);
    expect(frame.sceneProgress).toBeLessThan(1);
    expect(frame.totalProgress).toBeGreaterThanOrEqual(0);
    expect(frame.totalProgress).toBeLessThan(1);
  });
});
