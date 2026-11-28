"use client";

import { useSyncExternalStore } from "react";
import { isAscendNativeUserAgent } from "@ascend/shared";
import { cycleTrackingEnabled } from "./cycleTrackingFlag";
import { getNativeCapacitorPlatform } from "./nativePlatform";

const subscribe = () => () => {};
const serverSnapshot = () => false;

export function useCycleTrackingPilot() {
  return useSyncExternalStore(subscribe, () => {
    const platform = getNativeCapacitorPlatform();
    return cycleTrackingEnabled && platform !== "ios" && platform !== "android"
      && !isAscendNativeUserAgent(window.navigator.userAgent);
  }, serverSnapshot);
}
