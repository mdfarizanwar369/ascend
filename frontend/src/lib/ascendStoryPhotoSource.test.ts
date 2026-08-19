import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AscendStoryContext } from "./ascendStories";
import { prepareStoryPhotos } from "./ascendStoryPhotoSource";

const context = {
  firstPhoto: { id: "first", url: "https://signed.example/first", loggedAt: "2026-01-01T00:00:00.000Z", photoType: "front" },
  latestPhoto: { id: "latest", url: "https://signed.example/latest", loggedAt: "2026-02-01T00:00:00.000Z", photoType: "front" },
  currentStreak: 1,
  milestone: null,
  milestones: [],
  metrics: []
} satisfies AscendStoryContext;

describe("Ascend Story protected photo preparation", () => {
  const createObjectUrl = vi.fn((blob: Blob) => `blob:story-${blob.size}-${createObjectUrl.mock.calls.length}`);
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
  });

  it("loads only the current photo for Today and revokes it after use", async () => {
    const loader = vi.fn(async () => new Blob(["photo"], { type: "image/jpeg" }));
    const prepared = await prepareStoryPhotos(context, "today", loader);

    expect(loader).toHaveBeenCalledOnce();
    expect(loader).toHaveBeenCalledWith("latest");
    expect(prepared.context.latestPhoto.url).toMatch(/^blob:story-/);
    expect(prepared.context.firstPhoto.url).toBe(context.firstPhoto.url);

    prepared.release();
    prepared.release();
    expect(revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it("loads both protected photos for Then to Now", async () => {
    const loader = vi.fn(async (id: string) => new Blob([id], { type: "image/png" }));
    const prepared = await prepareStoryPhotos(context, "then-now", loader);

    expect(loader).toHaveBeenCalledTimes(2);
    expect(prepared.context.firstPhoto.url).toMatch(/^blob:story-/);
    expect(prepared.context.latestPhoto.url).toMatch(/^blob:story-/);
    prepared.release();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it("fails safely when authenticated photo retrieval fails", async () => {
    await expect(prepareStoryPhotos(context, "today", async () => {
      throw new Error("403");
    })).rejects.toThrow("Ascend could not securely load this photo. Please try again.");
  });
});
