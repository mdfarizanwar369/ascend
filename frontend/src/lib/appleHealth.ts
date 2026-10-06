"use client";

import { registerPlugin } from "@capacitor/core";
import { getNativeCapacitorPlatform, isNativeCapacitorPlatform } from "./nativePlatform";
import type { NativeHealthConnectStatus, NativeHealthConnectSyncResult } from "./healthConnect";

type AppleHealthStatus = NativeHealthConnectStatus & { authorizationRequested: boolean };
type AppleHealthPlugin = {
  getStatus(): Promise<AppleHealthStatus>;
  requestHealthPermissions(): Promise<AppleHealthStatus>;
  sync(): Promise<NativeHealthConnectSyncResult>;
};

const AppleHealth = registerPlugin<AppleHealthPlugin>("AscendHealth");

export function canUseAppleHealth() {
  if (typeof window === "undefined") return false;
  return isNativeCapacitorPlatform() && getNativeCapacitorPlatform() === "ios"
    && Number(/AscendIOS\/(\d+)/.exec(window.navigator.userAgent)?.[1] ?? 0) >= 7;
}

export function getNativeAppleHealthStatus() {
  if (!canUseAppleHealth()) throw new Error("Apple Health requires the latest Ascend iPhone app.");
  return AppleHealth.getStatus();
}

export function requestNativeAppleHealthPermissions() {
  if (!canUseAppleHealth()) throw new Error("Apple Health requires the latest Ascend iPhone app.");
  return AppleHealth.requestHealthPermissions();
}

export function syncNativeAppleHealth() {
  if (!canUseAppleHealth()) throw new Error("Apple Health requires the latest Ascend iPhone app.");
  return AppleHealth.sync();
}
