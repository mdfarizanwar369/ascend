"use client";

import { isIosSubscriptionEdition } from "./appEdition";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { getAppleBillingConfig, verifyAppleSubscription } from "./ascendApi";
import { getFirebaseClientAuth } from "./firebase";
import { getNativeCapacitorPlatform, isNativeCapacitorPlatform } from "./nativePlatform";

export type AppleSubscriptionPeriod = { value: number; unit: "day" | "week" | "month" | "year" };
export type AppleIntroductoryOffer = {
  eligible: boolean;
  displayPrice: string;
  paymentMode: "freeTrial" | "payAsYouGo" | "payUpFront" | "unknown";
  period: AppleSubscriptionPeriod;
  periodCount: number;
};
export type AppleProduct = {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
  subscriptionPeriod?: AppleSubscriptionPeriod;
  subscriptionGroupId?: string;
  introductoryOffer?: AppleIntroductoryOffer;
};
export type AppleTransaction = { transactionId: string; signedTransaction: string; environment?: "Production" | "Sandbox" };
type AppleBillingPlugin = {
  getProducts(): Promise<{ products: AppleProduct[] }>;
  purchase(input: { productId: string; appAccountToken: string }): Promise<{ outcome: "purchased" | "pending" | "cancelled"; transaction?: AppleTransaction }>;
  getTransactions(): Promise<{ transactions: AppleTransaction[] }>;
  restore(): Promise<{ transactions: AppleTransaction[] }>;
  finish(input: { transactionId: string }): Promise<void>;
  manageSubscriptions(): Promise<void>;
  getPurchaseIntent(): Promise<{ productId?: string }>;
  clearPurchaseIntent(): Promise<void>;
  addListener(event: "transactionsUpdated" | "purchaseIntent", callback: () => void): Promise<PluginListenerHandle>;
};
export const AppleBilling = registerPlugin<AppleBillingPlugin>("AppleBilling");

// StoreKit can return the same unfinished or current entitlement on every app event.
// Keep automatic retries bounded while leaving an explicit Restore or purchase immediate.
const automaticAttempts = new Map<string, number>();
const SUCCESS_RECHECK_MS = 60 * 60_000;
const REJECTED_RECHECK_MS = 15 * 60_000;
const TRANSIENT_RECHECK_MS = 60_000;
const MAX_AUTOMATIC_ATTEMPTS = 100;

export function clearAutomaticAppleSyncAttempts() {
  automaticAttempts.clear();
}

export function supportsAppleBilling() {
  if (!isNativeCapacitorPlatform() || getNativeCapacitorPlatform() !== "ios") return false;
  return isIosSubscriptionEdition();
}

export async function confirmAppleTransaction(transaction: AppleTransaction) {
  const result = await verifyAppleSubscription(transaction);
  await AppleBilling.finish({ transactionId: transaction.transactionId });
  window.dispatchEvent(new Event("ascend:subscription-changed"));
  return result;
}

export async function syncAppleTransactions(restore = false) {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return 0;
  const config = await getAppleBillingConfig();
  if (!config.enabled) return 0;
  let result: { transactions: AppleTransaction[] };
  if (restore) {
    try {
      result = await AppleBilling.restore();
    } catch (restoreError) {
      // StoreKit may already have signed entitlements even if its account refresh fails.
      // Recover them through the same server verification as a successful restore.
      try {
        result = await AppleBilling.getTransactions();
      } catch {
        throw restoreError;
      }
      if (result.transactions.length === 0) throw restoreError;
    }
  } else {
    result = await AppleBilling.getTransactions();
  }
  let restored = 0;
  let failure: unknown;
  for (const transaction of result.transactions) {
    const key = `${uid}:${transaction.transactionId}`;
    const previous = automaticAttempts.get(key);
    if (!restore && previous && previous > Date.now()) continue;
    // Mark before awaiting so overlapping native events cannot verify the same purchase twice.
    if (!restore) automaticAttempts.set(key, Date.now() + TRANSIENT_RECHECK_MS);
    try {
      await confirmAppleTransaction(transaction);
      restored += 1;
      automaticAttempts.set(key, Date.now() + SUCCESS_RECHECK_MS);
    } catch (error) {
      const status = error instanceof Error ? (error as Error & { status?: number }).status : undefined;
      automaticAttempts.set(key, Date.now() + (status && status >= 400 && status < 500 && status !== 429 ? REJECTED_RECHECK_MS : TRANSIENT_RECHECK_MS));
      failure = error;
    }
    if (automaticAttempts.size > MAX_AUTOMATIC_ATTEMPTS) automaticAttempts.delete(automaticAttempts.keys().next().value!);
  }
  if (failure) throw failure;
  return restored;
}
