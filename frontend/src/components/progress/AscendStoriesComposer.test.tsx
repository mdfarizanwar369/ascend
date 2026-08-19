import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderStory: vi.fn(),
  saveStory: vi.fn(),
  shareStory: vi.fn(),
  recordEvent: vi.fn(),
  getAscendMemory: vi.fn(),
  getBurnLogs: vi.fn(),
  getFoodLogs: vi.fn(),
  getGoalStatus: vi.fn(),
  getMyProgressComparison: vi.fn(),
  getMyStreak: vi.fn()
}));

vi.mock("@/lib/ascendApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ascendApi")>();
  return {
    ...original,
    getAscendMemory: mocks.getAscendMemory,
    getBurnLogs: mocks.getBurnLogs,
    getFoodLogs: mocks.getFoodLogs,
    getGoalStatus: mocks.getGoalStatus,
    getMyProgressComparison: mocks.getMyProgressComparison,
    getMyStreak: mocks.getMyStreak
  };
});

vi.mock("@/lib/ascendStoryRenderer", () => ({
  renderAscendStory: mocks.renderStory
}));

vi.mock("@/lib/ascendStoryShare", () => ({
  saveAscendStory: mocks.saveStory,
  shareAscendStory: mocks.shareStory
}));

vi.mock("@/lib/ascendStoryAnalytics", () => ({
  recordAscendStoryEvent: mocks.recordEvent
}));

import { AscendStoriesComposer } from "./AscendStoriesComposer";

type ComposerPhotos = ComponentProps<typeof AscendStoriesComposer>["photos"];

const photos = [
  { id: "latest", image_url: "/latest.jpg", logged_at: "2026-08-01T10:00:00.000Z", photo_type: "front" },
  { id: "first", image_url: "/before.jpg", logged_at: "2026-05-01T10:00:00.000Z", photo_type: "front" },
  { id: "side", image_url: "/side.jpg", logged_at: "2026-07-01T10:00:00.000Z", photo_type: "side" }
] as unknown as ComposerPhotos;

async function openComposer(onClose = vi.fn()) {
  render(<AscendStoriesComposer photos={photos} onClose={onClose} />);
  await screen.findByRole("button", { name: "Today" });
  return onClose;
}

describe("Ascend Stories composer", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.renderStory.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    mocks.saveStory.mockResolvedValue({ platform: "web", location: "ascend-story.png" });
    mocks.shareStory.mockResolvedValue("web-share");
    mocks.getAscendMemory.mockResolvedValue({ timeline: [{ milestoneKey: "streak-14", type: "streak", title: "14 days of consistency. Earned.", subtitle: "Verified from your streak.", occurredAt: "2026-08-01T10:00:00.000Z", priority: 20 }] });
    mocks.getBurnLogs.mockResolvedValue({ burnLogs: Array.from({ length: 12 }, (_, index) => ({ id: `burn-${index}` })) });
    mocks.getFoodLogs.mockResolvedValue({ foodLogs: Array.from({ length: 40 }, (_, index) => ({ id: `meal-${index}` })), nextOffset: null });
    mocks.getGoalStatus.mockResolvedValue({ goalStatus: null });
    mocks.getMyProgressComparison.mockResolvedValue({ comparison: { current: { weightKg: 72, momentum: 55 }, baseline: { weightKg: 75 } } });
    mocks.getMyStreak.mockResolvedValue({ streak: { current: 14, best: 14 } });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("opens with sensitive and behavioural metrics hidden", async () => {
    await openComposer();
    expect(screen.getByRole("dialog", { name: /Share Your Ascent story editor/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Current streak/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Weight change/i)).not.toBeChecked();
    expect(screen.getByText(/Sensitive numbers.*stay hidden/i)).toBeInTheDocument();
  });

  it("supports photo selection, same-photo rejection, and independent Then/Now crops", async () => {
    await openComposer();
    fireEvent.click(screen.getByRole("button", { name: /Then/i }));
    expect(screen.getByLabelText("Then")).toHaveValue("first");
    expect(screen.getByLabelText("Now")).toHaveValue("latest");

    fireEvent.change(screen.getByLabelText("Now"), { target: { value: "first" } });
    expect(screen.getByText(/Choose two different photos/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Now")).toHaveValue("latest");

    fireEvent.click(screen.getByRole("button", { name: /Adjust photo/i }));
    expect(screen.getAllByLabelText("Zoom")).toHaveLength(2);
    fireEvent.change(screen.getAllByLabelText("Zoom")[0], { target: { value: "1.4" } });
    fireEvent.change(screen.getAllByLabelText("Zoom")[1], { target: { value: "1.8" } });
    expect(screen.getAllByLabelText("Zoom")[0]).toHaveValue("1.4");
    expect(screen.getAllByLabelText("Zoom")[1]).toHaveValue("1.8");
  });

  it("allows captions, attribution, style, and individual verified metrics to be changed", async () => {
    await openComposer();
    const caption = screen.getByLabelText("Your words");
    fireEvent.change(caption, { target: { value: "Still becoming." } });
    fireEvent.click(screen.getByRole("button", { name: "Loud" }));
    fireEvent.click(screen.getByLabelText(/Current streak/i));
    fireEvent.click(screen.getByLabelText(/Made with Ascend/i));
    fireEvent.click(screen.getByRole("button", { name: /Save image/i }));

    await waitFor(() => expect(mocks.renderStory).toHaveBeenCalledOnce());
    const draft = mocks.renderStory.mock.calls[0][1];
    expect(draft).toMatchObject({
      caption: "Still becoming.",
      style: "loud",
      metricKeys: ["streak"],
      showAttribution: false
    });
    expect(mocks.saveStory).toHaveBeenCalledOnce();
    expect(screen.getByText(/story PNG was downloaded/i)).toBeInTheDocument();
  });

  it("passes the member's edited caption to the share sheet", async () => {
    await openComposer();
    fireEvent.change(screen.getByLabelText("Your words"), { target: { value: "More promises kept." } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(mocks.shareStory).toHaveBeenCalledWith(expect.any(Blob), "More promises kept."));
  });

  it("allows an Earned story to use another verified achievement", async () => {
    await openComposer();
    fireEvent.click(screen.getByRole("button", { name: "Earned" }));
    const achievement = screen.getByLabelText("Achievement");
    fireEvent.change(achievement, { target: { value: "workouts-12" } });
    expect(screen.getByLabelText("Your words")).toHaveValue("12 workouts completed. Still ascending.");
  });

  it("copies or removes the suggested caption without blocking export", async () => {
    await openComposer();
    fireEvent.click(screen.getByRole("button", { name: /Copy caption/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Your words"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Copy caption/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Save image/i }));
    await waitFor(() => expect(mocks.saveStory).toHaveBeenCalledOnce());
  });

  it("handles share cancellation and the web download fallback honestly", async () => {
    await openComposer();
    mocks.shareStory.mockRejectedValueOnce(new DOMException("Share cancelled", "AbortError"));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Sharing cancelled.")).toBeInTheDocument();

    mocks.shareStory.mockResolvedValueOnce("download");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText(/PNG was downloaded/i)).toBeInTheDocument();
    expect(mocks.recordEvent).toHaveBeenCalledWith("ascend_story_image_saved", expect.objectContaining({ platform: "web" }));
  });

  it("keeps the editor usable when a photo URL can no longer be loaded", async () => {
    await openComposer();
    mocks.renderStory.mockRejectedValueOnce(new Error("Could not prepare this photo. Reopen Progress Photos and try again."));
    fireEvent.click(screen.getByRole("button", { name: /Save image/i }));
    expect(await screen.findByText("Could not prepare this photo. Reopen Progress Photos and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save image/i })).toBeEnabled();
    expect(mocks.recordEvent).toHaveBeenCalledWith("ascend_story_generation_failed", expect.any(Object));
  });

  it("closes cleanly and never traps the member in the editor", async () => {
    const onClose = await openComposer();
    fireEvent.click(screen.getByRole("button", { name: /Close story editor/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
