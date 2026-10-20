import { afterEach, expect, it, vi } from "vitest";
import { FOOD_SHARE_STORY_HEIGHT, FOOD_SHARE_WIDTH, renderFoodShareCard } from "./foodShareCard";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("renders a photo meal as a 9:16 Story with its reviewed values", async () => {
  const labels: string[] = [];
  const gradient = { addColorStop: vi.fn() };
  const context = {
    fillRect: vi.fn(), drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => gradient), createRadialGradient: vi.fn(() => gradient),
    fillText: vi.fn((value: string) => labels.push(value)),
    measureText: vi.fn((value: string) => ({ width: value.length * 27 }))
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let size: [number, number] | null = null;
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback: BlobCallback) {
    size = [this.width, this.height];
    callback(new Blob(["story"], { type: "image/png" }));
  });
  class LoadedImage {
    width = 1200;
    height = 900;
    onload: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("Image", LoadedImage);

  const result = await renderFoodShareCard({ foodName: "Fried rice with chili sauce", calories: 560, proteinG: 13, carbsG: 85, fatG: 18, imageUrl: "blob:meal" }, "story");
  expect(result.type).toBe("image/png");
  expect(size).toEqual([FOOD_SHARE_WIDTH, FOOD_SHARE_STORY_HEIGHT]);
  expect(context.drawImage).toHaveBeenCalledTimes(2);
  expect(labels).toContain("560");
  expect(labels).toContain("13g");
  expect(labels).toContain("85g");
  expect(labels).toContain("18g");
});

it("keeps a photo-free meal out of the photo-led Story layout", async () => {
  await expect(renderFoodShareCard({ foodName: "Lunch", calories: 300, proteinG: 8, carbsG: 40, fatG: 9, imageUrl: null }, "story"))
    .rejects.toThrow("Add a meal photo");
});
