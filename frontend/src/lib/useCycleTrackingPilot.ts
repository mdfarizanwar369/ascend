"use client";

import { useSyncExternalStore } from "react";
import { isAscendNativeUserAgent, supportsAscendIosCycle } from "@ascend/shared";
import { cycleTrackingEnabled } from "./cycleTrackingFlag";
import { getNativeCapacitorPlatform } from "./nativePlatform";

const subscribe = () => () => {};
const serverSnapshot = () => false;

export function useCycleTrackingPilot() {
  return useSyncExternalStore(subscribe, () => {
    const platform = getNativeCapacitorPlatform();
    const agent = window.navigator.userAgent;
    return cycleTrackingEnabled && (supportsAscendIosCycle(agent)
      || (platform !== "ios" && platform !== "android" && !isAscendNativeUserAgent(agent)));
  }, serverSnapshot);
}
