"use client";

import { useSyncExternalStore } from "react";
import { isAscendNativeUserAgent, supportsAscendIosCycle } from "@ascend/shared";
import { monthlyChallengesEnabled } from "./monthlyChallengeFlag";
import { isNativeCapacitorPlatform } from "./nativePlatform";

const subscribe = () => () => {};
const serverSnapshot = () => false;
const clientSnapshot = () => {
  const { userAgent } = navigator;
  return monthlyChallengesEnabled && (supportsAscendIosCycle(userAgent)
    || (!isNativeCapacitorPlatform() && !isAscendNativeUserAgent(userAgent)));
};

export function useMonthlyChallengesAvailable() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
