// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true }
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { getInfo: vi.fn(async () => ({ height: 32, overlays: true })) }
}));

import { NativeSafeAreaCoordinator } from "./NativeSafeAreaCoordinator";

describe("NativeSafeAreaCoordinator", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty("--ascend-native-status-bar-top");
  });

  it("uses the reported native status-bar inset instead of a guessed device padding", async () => {
    const view = render(<NativeSafeAreaCoordinator />);

    await waitFor(() => expect(document.documentElement.style.getPropertyValue("--ascend-native-status-bar-top")).toBe("32px"));
    view.unmount();
    expect(document.documentElement.style.getPropertyValue("--ascend-native-status-bar-top")).toBe("");
  });
});
