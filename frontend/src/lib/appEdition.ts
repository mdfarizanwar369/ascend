"use client";

import { useSyncExternalStore } from "react";
import { getNativeCapacitorPlatform } from "./nativePlatform";

export function isIosFreeEdition() {
  if (typeof window === "undefined") return false;
  return getNativeCapacitorPlatform() === "ios" || /\bAscendIOS\/\d+\b/.test(window.navigator.userAgent);
}

const subscribe = () => () => {};
const serverSnapshot = () => false;
export function useIosFreeEdition() {
  return useSyncExternalStore(subscribe, isIosFreeEdition, serverSnapshot);
}

export function appEditionHeaders(): Record<string, string> {
  return isIosFreeEdition() ? { "X-Ascend-Edition": "ios-free-v1" } : {};
}
