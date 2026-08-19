import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => function MockComposer({ onClose }: { onClose: () => void }) {
    return <div role="dialog" aria-label="Story composer"><button type="button" onClick={onClose}>Close</button></div>;
  }
}));

import { AscendStoriesLauncher } from "./AscendStoriesLauncher";

describe("Ascend Stories launcher", () => {
  afterEach(cleanup);

  it("guides members to add a photo instead of opening an empty composer", () => {
    render(<AscendStoriesLauncher photos={[]} />);
    expect(screen.getByRole("button", { name: "Share Your Ascent" })).toBeDisabled();
    expect(screen.getByText(/Add your first progress photo/i)).toBeInTheDocument();
  });

  it("opens only from an authorised photo already supplied by Progress Photos", () => {
    const photos = [{ id: "own-photo", image_url: "/own-photo.jpg" }] as never[];
    render(<AscendStoriesLauncher photos={photos} />);
    fireEvent.click(screen.getByRole("button", { name: "Share Your Ascent" }));
    expect(screen.getByRole("dialog", { name: "Story composer" })).toBeInTheDocument();
  });
});
