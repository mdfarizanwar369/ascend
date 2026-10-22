import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getWidgetTheme: vi.fn(), setWidgetTheme: vi.fn() }));
vi.mock("@/lib/nativePlatform", () => ({
  isNativeCapacitorPlatform: () => true,
  getNativeCapacitorPlatform: () => "ios"
}));
vi.mock("@/lib/ascendSiri", () => ({ ascendSiri: mocks }));

import { ThemeToggle } from "./ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.appearance = "classic";
  document.documentElement.dataset.theme = "dark";
  mocks.getWidgetTheme.mockReset().mockResolvedValue({ theme: "classic" });
  mocks.setWidgetTheme.mockReset().mockResolvedValue({ theme: "gym-girl" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("saves a chosen appearance to both the app and the native widget", async () => {
  render(<ThemeToggle />);
  fireEvent.click(await screen.findByRole("button", { name: "Choose Ascend appearance" }));
  fireEvent.click(screen.getByRole("button", { name: /Gym Girl Club/i }));
  await waitFor(() => expect(mocks.setWidgetTheme).toHaveBeenCalledWith({ theme: "gym-girl" }));
  await waitFor(() => expect(document.documentElement.dataset.appearance).toBe("gym-girl"));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem("ascend-appearance")).toBe("gym-girl");
});

it("keeps the original light and dark toggle on older iOS builds", async () => {
  mocks.getWidgetTheme.mockRejectedValue(new Error("not implemented"));
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.dataset.appearance).toBe("light");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(mocks.setWidgetTheme).not.toHaveBeenCalled();
});

it("does not apply a theme when the native widget cannot save it", async () => {
  mocks.setWidgetTheme.mockRejectedValue(new Error("unavailable"));
  render(<ThemeToggle />);
  fireEvent.click(await screen.findByRole("button", { name: "Choose Ascend appearance" }));
  fireEvent.click(screen.getByRole("button", { name: /Iron Club/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not update the widget");
  expect(document.documentElement.dataset.appearance).toBe("classic");
});
