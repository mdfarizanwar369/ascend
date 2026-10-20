import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FoodSharePreview } from "./FoodSharePreview";

const share = vi.hoisted(() => ({ shareAscendImage: vi.fn() }));
vi.mock("@/lib/ascendStoryShare", () => ({ shareAscendImage: share.shareAscendImage }));

const blob = new Blob(["image"], { type: "image/png" });

beforeEach(() => {
  vi.clearAllMocks();
  share.shareAscendImage.mockResolvedValue("web-share");
});

afterEach(cleanup);

it("offers Story and Post for a photo, and shares the Story image", async () => {
  const onFormatChange = vi.fn();
  render(<FoodSharePreview blob={blob} previewUrl="blob:meal" foodName="Fried rice" format="story" hasPhoto isPreparing={false} renderError="" onFormatChange={onFormatChange} onClose={vi.fn()} />);

  expect(screen.getByRole("button", { name: "Story · full screen" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("img", { name: "Story share preview for Fried rice" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Post · feed" }));
  expect(onFormatChange).toHaveBeenCalledWith("post");

  fireEvent.click(screen.getByRole("button", { name: "Share image" }));
  await waitFor(() => expect(share.shareAscendImage).toHaveBeenCalledWith(blob, expect.objectContaining({ filePrefix: "ascend-food-story" })));
});

it("keeps text-only meals in the Post format", () => {
  render(<FoodSharePreview blob={blob} previewUrl="blob:meal" foodName="Lunch" format="post" hasPhoto={false} isPreparing={false} renderError="" onFormatChange={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Story · full screen" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Post share preview for Lunch" })).toBeInTheDocument();
});
