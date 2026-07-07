"use client";

import { getNativeCapacitorPlatform, isNativeAndroidCapacitor, isNativeCapacitorPlatform } from "@/lib/nativePlatform";

function envFlagEnabled(value: string | undefined) {
  return value === "true";
}

export function isAndroidPlayBillingEnabled() {
  return envFlagEnabled(process.env.NEXT_PUBLIC_ANDROID_PLAY_BILLING_ENABLED);
}

export function isIosBillingEnabled() {
  return envFlagEnabled(process.env.NEXT_PUBLIC_IOS_BILLING_ENABLED);
}

export function shouldHideHostedBilling() {
  if (!isNativeCapacitorPlatform()) return false;

  const platform = getNativeCapacitorPlatform();
  if (platform === "android") return !isAndroidPlayBillingEnabled();
  if (platform === "ios") return !isIosBillingEnabled();

  return false;
}

export function getNativeBillingMessage() {
  if (isNativeAndroidCapacitor() && !isAndroidPlayBillingEnabled()) {
    return "Premium upgrades are not available in this test build yet. Testers can request Premium access from the Ascend team.";
  }

  if (getNativeCapacitorPlatform() === "ios" && !isIosBillingEnabled()) {
    return "In-app premium upgrades are not available on iPhone yet. Please use the web app for billing.";
  }

  return null;
}
