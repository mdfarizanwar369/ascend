import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PwaInstallCoordinator } from "./PwaInstallCoordinator";
import { InstallAscendButton } from "./InstallAscendButton";
import {
  INSTALL_REQUEST_EVENT,
  installStorageKeys,
  isAscendInstalled,
  markInstallEligible,
  requestInstallAscend
} from "@/lib/installAscend";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("./BrandMark", () => ({ BrandMark: () => null }));

const safari = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.6 Mobile/15E148 Safari/604.1";

function setPlatform(userAgent: string, nativePlatform?: string) {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(userAgent);
  vi.stubGlobal("Capacitor", nativePlatform ? {
    isNativePlatform: () => true,
    getPlatform: () => nativePlatform
  } : undefined);
}

function renderInstallControls() {
  render(<><PwaInstallCoordinator /><InstallAscendButton /></>);
}

describe("web installation prompts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    setPlatform(safari);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { name: "iOS native bridge", userAgent: safari, bridge: "ios" },
    { name: "TestFlight before the bridge is ready", userAgent: `${safari} AscendIOS/2 Capacitor` },
    { name: "first iOS build", userAgent: `${safari} AscendIOS/1 Capacitor` },
    { name: "Android native bridge", userAgent: "Mozilla/5.0 (Linux; Android 14)", bridge: "android" },
    { name: "Android before the bridge is ready", userAgent: "Mozilla/5.0 (Linux; Android 14) AscendAndroid/1 Capacitor" }
  ])("hides the signup prompt, saved reminder and settings button in $name", ({ userAgent, bridge }) => {
    setPlatform(userAgent, bridge);
    window.localStorage.setItem(installStorageKeys.eligible, "signup");
    window.localStorage.setItem(installStorageKeys.postponed, "true");
    renderInstallControls();
    act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Install Ascend reminder")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ascend/ })).not.toBeInTheDocument();

    // Stale installation events must not re-open either native app's web prompt.
    act(() => {
      window.dispatchEvent(new CustomEvent(INSTALL_REQUEST_EVENT));
      window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Install Ascend reminder")).not.toBeInTheDocument();
  });

  it("treats the native app as installed without storing web install eligibility", () => {
    setPlatform(`${safari} AscendIOS/2 Capacitor`);
    const requested = vi.fn();
    window.addEventListener(INSTALL_REQUEST_EVENT, requested);
    try {
      markInstallEligible("signup");
      requestInstallAscend();
      expect(isAscendInstalled()).toBe(true);
      expect(window.localStorage.getItem(installStorageKeys.eligible)).toBeNull();
      expect(requested).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(INSTALL_REQUEST_EVENT, requested);
    }
  });

  it("keeps Safari signup instructions and the postponed install reminder", () => {
    renderInstallControls();
    act(() => { markInstallEligible("signup"); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Choose Add to Home Screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Install Ascend reminder")).toBeInTheDocument();
    act(() => { requestInstallAscend(); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("still offers installation in Android Chrome when the browser supports it", () => {
    setPlatform("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36");
    renderInstallControls();
    act(() => {
      markInstallEligible("first_action");
      window.dispatchEvent(new Event("beforeinstallprompt", { cancelable: true }));
    });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Choose Add to Home Screen")).not.toBeInTheDocument();
  });

  it("keeps an installed Home Screen web app free of install prompts", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(query => ({
      matches: query === "(display-mode: standalone)", media: query,
      onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn()
    }));
    window.localStorage.setItem(installStorageKeys.postponed, "true");
    renderInstallControls();
    act(() => { markInstallEligible("signup"); requestInstallAscend(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Install Ascend reminder")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ascend is installed" })).toBeDisabled();
  });
});
