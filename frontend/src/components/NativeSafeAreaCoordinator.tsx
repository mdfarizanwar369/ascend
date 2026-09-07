"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const CSS_VARIABLE = "--ascend-native-status-bar-top";

/**
 * Android 15+ enforces edge-to-edge rendering, and some WebViews report a zero
 * CSS safe-area inset. Read the actual system-bar height from Capacitor instead
 * of guessing a device padding. CSS still uses env(safe-area-inset-top) on
 * browsers and iOS; the larger standards/native value wins.
 */
export function NativeSafeAreaCoordinator() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let active = true;

    async function syncStatusBarHeight() {
      try {
        const { StatusBar } = await import("@capacitor/status-bar");
        const info = await StatusBar.getInfo();
        if (!active) return;
        const height = info.overlays ? Number(info.height) : 0;
        document.documentElement.style.setProperty(CSS_VARIABLE, `${Number.isFinite(height) && height > 0 ? height : 0}px`);
      } catch {
        // env(safe-area-inset-top) remains the browser-native fallback.
      }
    }

    void syncStatusBarHeight();
    window.addEventListener("resize", syncStatusBarHeight);
    window.addEventListener("orientationchange", syncStatusBarHeight);
    return () => {
      active = false;
      window.removeEventListener("resize", syncStatusBarHeight);
      window.removeEventListener("orientationchange", syncStatusBarHeight);
      document.documentElement.style.removeProperty(CSS_VARIABLE);
    };
  }, []);

  return null;
}
