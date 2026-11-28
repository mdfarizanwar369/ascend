"use client";

import { useSyncExternalStore } from "react";
import { isAscendNativeUserAgent } from "@ascend/shared";
import { monthlyChallengesEnabled } from "./monthlyChallengeFlag";
import { isNativeCapacitorPlatform } from "./nativePlatform";

const subscribe = () => () => {};
const serverSnapshot = () => false;
const webSnapshot = () => monthlyChallengesEnabled && !isNativeCapacitorPlatform() && !isAscendNativeUserAgent(navigator.userAgent);

export function useMonthlyChallengesOnWeb() {
  return useSyncExternalStore(subscribe, webSnapshot, serverSnapshot);
}
