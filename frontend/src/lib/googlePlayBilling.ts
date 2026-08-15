"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeAndroidCapacitor } from "./nativePlatform";

export type NativeGooglePlayProduct = {
  productId: string;
  title: string;
  description: string;
  offerToken: string;
  basePlanId?: string | null;
  formattedPrice: string;
  priceCurrencyCode?: string | null;
  billingPeriod?: string | null;
  recurrenceMode?: number | null;
};

export type NativeGooglePlayPurchase = {
  purchaseToken: string;
  orderId?: string | null;
  packageName?: string | null;
  isAcknowledged: boolean;
  purchaseState: number;
  products: string[];
  productId: string;
  autoRenewing: boolean;
  purchaseTime: number;
};

type PlayBillingPlugin = {
  getStatus(): Promise<{ available: boolean; ready: boolean; appEnvironment: string; billingChannel: string }>;
  getProducts(options?: { productIds?: string[] }): Promise<{ available: boolean; ready: boolean; products: NativeGooglePlayProduct[] }>;
  purchase(options: { productId: string; offerToken?: string; obfuscatedAccountId: string }): Promise<{ purchase: NativeGooglePlayPurchase }>;
  getActivePurchases(): Promise<{ available: boolean; ready: boolean; purchases: NativeGooglePlayPurchase[] }>;
  openSubscriptions(): Promise<{ opened: boolean }>;
};

const PlayBilling = registerPlugin<PlayBillingPlugin>("PlayBilling");

export function canUseNativeGooglePlayBilling() {
  return isNativeAndroidCapacitor();
}

export async function getNativeGooglePlayStatus() {
  if (!canUseNativeGooglePlayBilling()) {
    return { available: false, ready: false, appEnvironment: "web", billingChannel: "web" };
  }
  return PlayBilling.getStatus();
}

export async function getNativeGooglePlayProducts(productIds?: string[]) {
  if (!canUseNativeGooglePlayBilling()) {
    return { available: false, ready: false, products: [] as NativeGooglePlayProduct[] };
  }
  return PlayBilling.getProducts(productIds?.length ? { productIds } : undefined);
}

export async function startNativeGooglePlayPurchase(productId: string, obfuscatedAccountId: string, offerToken?: string) {
  if (!canUseNativeGooglePlayBilling()) throw new Error("Google Play Billing is available only in the Android app.");
  return PlayBilling.purchase({ productId, offerToken, obfuscatedAccountId });
}

export async function getNativeGooglePlayPurchases() {
  if (!canUseNativeGooglePlayBilling()) {
    return { available: false, ready: false, purchases: [] as NativeGooglePlayPurchase[] };
  }
  return PlayBilling.getActivePurchases();
}

export async function openNativeGooglePlaySubscriptions() {
  if (!canUseNativeGooglePlayBilling()) throw new Error("Google Play subscription management is available only in the Android app.");
  return PlayBilling.openSubscriptions();
}
