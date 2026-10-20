import { beforeEach, describe, expect, it, vi } from "vitest";
import { shareAscendImage, shareAscendStory } from "./ascendStoryShare";

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  share: vi.fn()
}));

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: native.isNativePlatform } }));
vi.mock("@capacitor/filesystem", () => ({ Directory: { Cache: "CACHE", Documents: "DOCUMENTS" }, Filesystem: { writeFile: native.writeFile, deleteFile: native.deleteFile } }));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));

beforeEach(() => {
  vi.clearAllMocks();
  native.isNativePlatform.mockReturnValue(true);
  native.writeFile.mockResolvedValue({ uri: "file:///ascend/share.png" });
  native.deleteFile.mockResolvedValue(undefined);
  native.share.mockResolvedValue(undefined);
});

describe("Ascend image sharing", () => {
  it("shares a food card through the existing native share sheet and cleans up its temporary file", async () => {
    const result = await shareAscendImage(new Blob(["card"], { type: "image/png" }), {
      title: "Share my meal", text: "My meal on Ascend.", filePrefix: "ascend-food-snap"
    });

    expect(result).toBe("native");
    expect(native.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "shares/ascend-food-snap.png", directory: "CACHE" }));
    expect(native.share).toHaveBeenCalledWith({
      title: "Share my meal", text: "My meal on Ascend.", files: ["file:///ascend/share.png"], dialogTitle: "Share my meal"
    });
    expect(native.deleteFile).toHaveBeenCalledWith({ path: "shares/ascend-food-snap.png", directory: "CACHE" });
  });

  it("preserves the progress story share title and path", async () => {
    await shareAscendStory(new Blob(["story"], { type: "image/png" }), "My progress");
    expect(native.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: "shares/ascend-story.png" }));
    expect(native.share).toHaveBeenCalledWith(expect.objectContaining({ title: "Share Your Ascent", text: "My progress" }));
  });
});
