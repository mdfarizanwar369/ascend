"use client";

import { getNativeCapacitorPlatform, isNativeAndroidCapacitor, isNativeCapacitorPlatform } from "@/lib/nativePlatform";
import { englishMessage } from "@/lib/i18n/static";

function envFlagEnabled(value: string | undefined) {
  return value === "true";
}

export function isAndroidPlayBillingEnabled() {
  return envFlagEnabled(process.env.NEXT_PUBLIC_ANDROID_PLAY_BILLING_ENABLED);
}

export function isIosBillingEnabled() {
  return envFlagEnabled(process.env.NEXT_PUBLIC_IOS_BILLING_ENABLED);
}

export function shouldUseAndroidPlayBilling() {
  return isNativeAndroidCapacitor() && isAndroidPlayBillingEnabled();
}

export function shouldHideHostedBilling() {
  if (!isNativeCapacitorPlatform()) return false;

  const platform = getNativeCapacitorPlatform();
  if (platform === "android") return true;
  if (platform === "ios") return true;

  return false;
}

export function getNativeBillingMessage() {
  if (isNativeAndroidCapacitor() && !isAndroidPlayBillingEnabled()) {
    return englishMessage("billing.premiumUnavailableTestBuild");
  }

  if (getNativeCapacitorPlatform() === "ios" && !isIosBillingEnabled()) {
    return englishMessage("billing.iosUnavailable");
  }

  return null;
}
