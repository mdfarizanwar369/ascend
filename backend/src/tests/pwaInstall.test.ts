import { describe, expect, it } from "vitest";
import { canAutoOfferInstall, detectInstallPlatform } from "@ascend/shared";

describe("PWA install eligibility", () => {
  it("detects iOS, iPadOS, Android, and desktop devices", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0", "MacIntel", 5)).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("android");
    expect(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });

  it("waits until an earned app screen and never repeats the automatic prompt", () => {
    expect(canAutoOfferInstall({ eligible: true, installed: false, alreadyPrompted: false, pathname: "/dashboard" })).toBe(true);
    expect(canAutoOfferInstall({ eligible: true, installed: false, alreadyPrompted: false, pathname: "/login" })).toBe(false);
    expect(canAutoOfferInstall({ eligible: true, installed: false, alreadyPrompted: true, pathname: "/dashboard" })).toBe(false);
    expect(canAutoOfferInstall({ eligible: true, installed: true, alreadyPrompted: false, pathname: "/dashboard" })).toBe(false);
  });
});
