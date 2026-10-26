import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: true,
  platform: "ios" as string | null,
  getWidgetTheme: vi.fn(),
  setWidgetTheme: vi.fn()
}));

vi.mock("@/lib/nativePlatform", () => ({
  isNativeCapacitorPlatform: () => mocks.native,
  getNativeCapacitorPlatform: () => mocks.platform
}));
vi.mock("@/lib/ascendSiri", () => ({ ascendSiri: mocks }));

import { applyAscendAppearance } from "@/lib/ascendAppearance";
import { AscendAppearanceCoordinator } from "./AscendAppearanceCoordinator";

function deferredTheme() {
  let resolve!: (value: { theme: string }) => void;
  const promise = new Promise<{ theme: string }>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/food-log");
  document.documentElement.dataset.appearance = "classic";
  document.documentElement.dataset.theme = "dark";
  mocks.native = true;
  mocks.platform = "ios";
  mocks.getWidgetTheme.mockReset().mockResolvedValue({ theme: "gym-girl" });
  mocks.setWidgetTheme.mockReset();
});

afterEach(() => {
  cleanup();
  expect(mocks.setWidgetTheme).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("appearance restoration on a direct widget destination", () => {
  it("restores Gym Girl Club on the food logger without mounting a theme picker", async () => {
    render(<><AscendAppearanceCoordinator /><h1>Log food</h1></>);

    expect(screen.getByRole("heading", { name: "Log food" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /appearance|theme/i })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/food-log");
    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("gym-girl"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("ascend-appearance")).toBe("gym-girl");
    expect(localStorage.getItem("ascend-theme")).toBe("dark");
  });

  it.each([
    ["classic", "dark"],
    ["light", "light"],
    ["gym-girl", "dark"],
    ["cute-lift", "light"],
    ["iron", "dark"],
    ["summit", "dark"],
    ["ascend-club", "dark"]
  ])("matches the saved %s widget appearance and its color mode", async (theme, mode) => {
    applyAscendAppearance(theme === "classic" ? "light" : "classic");
    mocks.getWidgetTheme.mockResolvedValue({ theme });
    render(<AscendAppearanceCoordinator />);

    await waitFor(() => expect(localStorage.getItem("ascend-appearance")).toBe(theme));
    expect(document.documentElement.dataset.appearance).toBe(theme);
    expect(document.documentElement.dataset.theme).toBe(mode);
    expect(localStorage.getItem("ascend-theme")).toBe(mode);
    expect(mocks.getWidgetTheme).toHaveBeenCalledOnce();
  });

  it("uses the native widget preference when the browser cache still says Classic", async () => {
    localStorage.setItem("ascend-appearance", "classic");
    localStorage.setItem("ascend-theme", "dark");
    render(<AscendAppearanceCoordinator />);

    await waitFor(() => expect(localStorage.getItem("ascend-appearance")).toBe("gym-girl"));
    expect(document.documentElement.dataset.appearance).toBe("gym-girl");
  });

  it("keeps a later explicit choice when an earlier native read finishes late", async () => {
    const request = deferredTheme();
    mocks.getWidgetTheme.mockReturnValue(request.promise);
    render(<AscendAppearanceCoordinator />);
    applyAscendAppearance("summit");

    await act(async () => { request.resolve({ theme: "gym-girl" }); });

    expect(document.documentElement.dataset.appearance).toBe("summit");
    expect(localStorage.getItem("ascend-appearance")).toBe("summit");
  });

  it("also protects an explicit Classic choice even when the DOM value has not changed", async () => {
    const request = deferredTheme();
    mocks.getWidgetTheme.mockReturnValue(request.promise);
    render(<AscendAppearanceCoordinator />);
    applyAscendAppearance("classic");

    await act(async () => { request.resolve({ theme: "gym-girl" }); });

    expect(document.documentElement.dataset.appearance).toBe("classic");
    expect(localStorage.getItem("ascend-appearance")).toBe("classic");
  });

  it("does not change appearance after its page has unmounted", async () => {
    const request = deferredTheme();
    mocks.getWidgetTheme.mockReturnValue(request.promise);
    const page = render(<AscendAppearanceCoordinator />);
    page.unmount();

    await act(async () => { request.resolve({ theme: "gym-girl" }); });

    expect(document.documentElement.dataset.appearance).toBe("classic");
    expect(localStorage.getItem("ascend-appearance")).toBeNull();
  });

  it("still displays the native theme when browser persistence is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    mocks.getWidgetTheme.mockResolvedValue({ theme: "cute-lift" });
    render(<AscendAppearanceCoordinator />);

    await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("cute-lift"));
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

describe("older and non-iOS clients", () => {
  it("preserves the cached appearance if the released bridge does not support theme reads", async () => {
    applyAscendAppearance("iron");
    mocks.getWidgetTheme.mockRejectedValue(new Error("Not implemented"));
    render(<AscendAppearanceCoordinator />);
    await act(async () => { await Promise.resolve(); });

    expect(document.documentElement.dataset.appearance).toBe("iron");
    expect(localStorage.getItem("ascend-appearance")).toBe("iron");
  });

  it.each(["future-theme", "", null])("does not replace a valid existing appearance with unknown native value %s", async theme => {
    applyAscendAppearance("summit");
    mocks.getWidgetTheme.mockResolvedValue({ theme });
    render(<AscendAppearanceCoordinator />);
    await act(async () => { await Promise.resolve(); });

    expect(document.documentElement.dataset.appearance).toBe("summit");
    expect(localStorage.getItem("ascend-appearance")).toBe("summit");
  });

  it.each([
    [false, "web"],
    [true, "android"],
    [false, null]
  ])("does not call the iOS bridge for native=%s platform=%s", (native, platform) => {
    mocks.native = native;
    mocks.platform = platform;
    applyAscendAppearance("light");
    render(<AscendAppearanceCoordinator />);

    expect(mocks.getWidgetTheme).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.appearance).toBe("light");
    expect(localStorage.getItem("ascend-appearance")).toBe("light");
  });
});
