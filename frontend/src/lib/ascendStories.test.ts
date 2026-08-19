import { describe, expect, it } from "vitest";
import {
  AscendStoryContext,
  availableStoryFormats,
  buildVerifiedStoryMetrics,
  chooseVerifiedMilestone,
  clampStoryCrop,
  createStoryDraft,
  defaultStoryCaption,
  isThenNowDateReversed,
  isThenNowSelectionValid,
  listVerifiedMilestones,
  storyElapsedLabel
} from "./ascendStories";
import {
  ASCEND_STORY_HEIGHT,
  ASCEND_STORY_LOGO_URL,
  ASCEND_STORY_WIDTH,
  calculateStoryCoverPlacement,
  wrapStoryText
} from "./ascendStoryRenderer";

const context: AscendStoryContext = {
  firstPhoto: { id: "first", url: "first.jpg", loggedAt: "2026-06-01T10:00:00.000Z", photoType: "front" },
  latestPhoto: { id: "latest", url: "latest.jpg", loggedAt: "2026-07-01T10:00:00.000Z", photoType: "front" },
  milestone: null,
  milestones: [],
  metrics: [],
  currentStreak: 0
};

describe("Ascend Stories", () => {
  it("exports the required Instagram Story dimensions", () => {
    expect(ASCEND_STORY_WIDTH).toBe(1080);
    expect(ASCEND_STORY_HEIGHT).toBe(1920);
    expect(ASCEND_STORY_LOGO_URL).toBe("/brand/ascend-mark-exact.png");
  });

  it.each([
    { width: 900, height: 1600 },
    { width: 1600, height: 900 },
    { width: 1200, height: 1200 }
  ])("covers portrait, landscape, and square photos without changing their aspect ratio", (image) => {
    const placement = calculateStoryCoverPlacement(image, 0, 0, 1080, 1920, { zoom: 1, x: 0, y: 0 });
    expect(placement.width / placement.height).toBeCloseTo(image.width / image.height, 8);
    expect(placement.width).toBeGreaterThanOrEqual(1080);
    expect(placement.height).toBeGreaterThanOrEqual(1920);
  });

  it("keeps sensitive and non-sensitive metrics hidden by default", () => {
    const draft = createStoryDraft("today", context);
    expect(draft.metricKeys).toEqual([]);
    expect(draft.showAttribution).toBe(true);
  });

  it("only exposes Then to Now when two photos exist", () => {
    expect(availableStoryFormats(context)).toEqual(["today", "then-now"]);
    expect(availableStoryFormats({ ...context, latestPhoto: context.firstPhoto })).toEqual(["today"]);
  });

  it("only exposes Earned when a verified milestone exists", () => {
    expect(availableStoryFormats(context)).not.toContain("earned");
    expect(availableStoryFormats({
      ...context,
      milestone: { key: "streak-7", title: "Seven days", detail: "Verified", occurredAt: "2026-07-01T10:00:00.000Z" }
    })).toContain("earned");
  });

  it("builds captions from dates and verified values rather than placeholders", () => {
    expect(defaultStoryCaption("then-now", context)).toContain("weeks");
    expect(defaultStoryCaption("today", { ...context, currentStreak: 12 })).toBe("12 days of showing up.");
  });

  it("does not invent an achievement when no eligible evidence exists", () => {
    expect(chooseVerifiedMilestone({ memories: [], currentStreak: 3, bestStreak: 4, meals: 10, workouts: 2 })).toBeNull();
  });

  it("does not treat setup or assigned work as an earned reveal", () => {
    expect(chooseVerifiedMilestone({
      memories: [{ milestoneKey: "started-journey", type: "started_journey", title: "Started Ascend", subtitle: "Welcome", occurredAt: "2026-07-01T10:00:00.000Z", priority: 99 }]
    })).toBeNull();
  });

  it("prioritizes a verified goal over lower-value activity milestones", () => {
    const milestone = chooseVerifiedMilestone({
      goalAchievedAt: "2026-07-01T10:00:00.000Z",
      currentStreak: 30,
      workouts: 100,
      meals: 200
    });
    expect(milestone?.key).toBe("goal-achieved");
  });

  it("lists each distinct verified achievement for Earned selection", () => {
    const milestones = listVerifiedMilestones({
      memories: [{ milestoneKey: "memory-1", type: "streak", title: "A month of showing up.", subtitle: "Verified", occurredAt: "2026-07-01T10:00:00.000Z", priority: 20 }],
      currentStreak: 14,
      workouts: 12,
      meals: 40
    });
    expect(milestones.map((milestone) => milestone.key)).toEqual(expect.arrayContaining(["memory-1", "streak-14", "workouts-12", "meals-40"]));
  });

  it("marks weight change as sensitive", () => {
    const metrics = buildVerifiedStoryMetrics({ currentWeight: 72, baselineWeight: 75, momentum: 54, currentStreak: 8 });
    expect(metrics.find((metric) => metric.key === "weight-change")?.sensitive).toBe(true);
  });

  it("labels capped food history as a verified minimum rather than an exact total", () => {
    const milestone = chooseVerifiedMilestone({ meals: 100, mealsAreMinimum: true });
    const metrics = buildVerifiedStoryMetrics({ meals: 100, mealsAreMinimum: true });
    expect(milestone?.title).toContain("100+");
    expect(metrics.find((metric) => metric.key === "meals")?.value).toBe("100+");
  });

  it("labels capped workout history as a verified minimum rather than an exact total", () => {
    const milestone = chooseVerifiedMilestone({ workouts: 100, workoutsAreMinimum: true });
    const metrics = buildVerifiedStoryMetrics({ workouts: 100, workoutsAreMinimum: true });
    expect(milestone?.title).toContain("100+");
    expect(metrics.find((metric) => metric.key === "workouts")?.value).toBe("100+");
  });

  it("clamps crop adjustments to safe renderer bounds", () => {
    expect(clampStoryCrop({ zoom: 8, x: -90, y: 90 })).toEqual({ zoom: 2.5, x: -50, y: 50 });
  });

  it("keeps long unbroken captions inside the export width", () => {
    const measure = { measureText: (text: string) => ({ width: Array.from(text).length * 10 }) as TextMetrics };
    const lines = wrapStoryText(measure, "ProgressWithoutSpaces".repeat(10), 100, 3);
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => measure.measureText(line).width <= 100)).toBe(true);
    expect(lines.at(-1)).toMatch(/\.\.\.$/);
  });

  it("rejects using the same photo twice and detects reversed dates", () => {
    expect(isThenNowSelectionValid(context.firstPhoto, context.firstPhoto)).toBe(false);
    expect(isThenNowSelectionValid(context.firstPhoto, context.latestPhoto)).toBe(true);
    expect(isThenNowDateReversed(context.latestPhoto, context.firstPhoto)).toBe(true);
  });

  it("formats elapsed time without depending on the device timezone", () => {
    expect(storyElapsedLabel(context.firstPhoto.loggedAt, context.latestPhoto.loggedAt)).toBe("4 weeks between check-ins");
  });
});
