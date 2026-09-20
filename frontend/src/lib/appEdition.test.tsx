import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { isIosFreeEdition, appEditionHeaders } from "./appEdition";
import { shouldHideHostedBilling, shouldUseAndroidPlayBilling } from "./billingPlatform";
import { usablePlan } from "./subscriptionPlan";
import { canOfferWebInstall } from "./installAscend";
import { IosFreeEditionBoundary } from "@/components/IosFreeEditionBoundary";

const state = vi.hoisted(() => ({ path: "/dashboard", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path, useRouter: () => ({ replace: state.replace }) }));
function device(platform: string, ua: string, standalone = false) {
  Object.defineProperty(window, "Capacitor", { configurable: true, value: platform === "web" ? undefined : { getPlatform: () => platform, isNativePlatform: () => true } });
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  Object.defineProperty(window.navigator, "standalone", { configurable: true, value: standalone });
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); device("web", "browser"); state.path = "/dashboard"; });
describe("native iOS vs home-screen billing", () => {
  it.each([false, true])("keeps Stripe and paid entitlements on iPhone Safari/PWA (standalone=%s)", standalone => {
    device("web", "Mozilla iPhone AppleWebKit Safari", standalone);
    expect(isIosFreeEdition()).toBe(false);
    expect(appEditionHeaders()).toEqual({});
    expect(shouldHideHostedBilling()).toBe(false);
    expect(usablePlan("premium", "active")).toBe("premium");
  });
  it("keeps Android's existing Play billing and paid access unchanged", () => {
    device("android", "Mozilla AscendAndroid/1 Capacitor");
    vi.stubEnv("NEXT_PUBLIC_ANDROID_PLAY_BILLING_ENABLED", "true");
    expect(isIosFreeEdition()).toBe(false);
    expect(appEditionHeaders()).toEqual({});
    expect(shouldUseAndroidPlayBilling()).toBe(true);
    expect(shouldHideHostedBilling()).toBe(true);
    expect(usablePlan("trainer_pro", "active")).toBe("trainer_pro");
  });
  it("restricts iOS before the native bridge initializes", () => {
    device("web", "Mozilla AscendIOS/4 AscendFree/1 Capacitor");
    expect(isIosFreeEdition()).toBe(true);
    expect(appEditionHeaders()).toEqual({ "X-Ascend-Edition": "ios-free-v1" });
    expect(usablePlan("premium", "active")).toBe("free");
    expect(canOfferWebInstall()).toBe(false);
  });
  it.each(["/subscription", "/trainer", "/admin/users", "/athlete", "/reports/weekly", "/messages", "/coach-homework/id", "/profile/health-sync"])("does not mount an unavailable screen at %s in the native app", path => {
    device("ios", "Mozilla iPhone"); state.path = path;
    const paidScreen = vi.fn(() => <button>Buy Premium</button>);
    const PaidScreen = paidScreen;
    render(<IosFreeEditionBoundary><PaidScreen /></IosFreeEditionBoundary>);
    expect(paidScreen).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Buy/ })).not.toBeInTheDocument();
    expect(screen.getByText("2 AI meal estimates per day")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/dashboard");
  });
  it("renders the payment screen normally in an iPhone home-screen install", () => {
    device("web", "Mozilla iPhone", true); state.path = "/subscription";
    render(<IosFreeEditionBoundary><button>Pay with Stripe</button></IosFreeEditionBoundary>);
    expect(screen.getByRole("button", { name: "Pay with Stripe" })).toBeInTheDocument();
  });
  it("keeps the free dashboard available in iOS", () => {
    device("ios", "Mozilla iPhone");
    render(<IosFreeEditionBoundary><button>Log a meal</button></IosFreeEditionBoundary>);
    expect(screen.getByRole("button", { name: "Log a meal" })).toBeInTheDocument();
  });
  it.each(["/privacy", "/terms", "/refund-policy"])("uses the Apple edition policy for native %s", path => {
    device("ios", "Mozilla iPad"); state.path = path;
    render(<IosFreeEditionBoundary><p>Android policy text</p></IosFreeEditionBoundary>);
    expect(screen.queryByText("Android policy text")).not.toBeInTheDocument();
    expect(state.replace).toHaveBeenCalledWith(`${path}/ios`);
  });
  it.each(["android", "web"])("preserves Health Sync for %s", platform => {
    device(platform, platform === "android" ? "AscendAndroid/1" : "Mozilla iPhone"); state.path = "/profile/health-sync";
    render(<IosFreeEditionBoundary><p>Health Connect</p></IosFreeEditionBoundary>);
    expect(screen.getByText("Health Connect")).toBeInTheDocument();
  });
  it.each(["/", "/demo"])("opens the app instead of the website marketing at %s", path => {
    device("ios", "Mozilla iPhone"); state.path = path;
    render(<IosFreeEditionBoundary><button>See paid plans</button></IosFreeEditionBoundary>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(state.replace).toHaveBeenCalledWith("/launch");
  });
});
