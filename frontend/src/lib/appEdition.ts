"use client";

import { useSyncExternalStore } from "react";
import { getNativeCapacitorPlatform } from "./nativePlatform";

export function isIosApp() {
  if (typeof window === "undefined") return false;
  return getNativeCapacitorPlatform() === "ios" || /\bAscendIOS\/\d+\b/.test(window.navigator.userAgent);
}

export function isIosSubscriptionEdition() {
  if (!isIosApp()) return false;
  const ua = window.navigator.userAgent;
  return Number(/AscendIOS\/(\d+)/.exec(ua)?.[1] ?? 0) >= 6 && /\bAscendSubscriptions\/1\b/.test(ua) && !/\bAscendFree\//.test(ua);
}

export function isIosFreeEdition() { return isIosApp() && !isIosSubscriptionEdition(); }
export function useIosApp() { return useSyncExternalStore(subscribe, isIosApp, serverSnapshot); }

const subscribe = () => () => {};
const serverSnapshot = () => false;
export function useIosFreeEdition() {
  return useSyncExternalStore(subscribe, isIosFreeEdition, serverSnapshot);
}

export function appEditionHeaders(): Record<string, string> {
  return isIosFreeEdition() ? { "X-Ascend-Edition": "ios-free-v1" } : isIosSubscriptionEdition() ? { "X-Ascend-Edition": "ios-subscriptions-v1" } : {};
}
