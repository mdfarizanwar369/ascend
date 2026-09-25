"use client";

import { isIosSubscriptionEdition } from "./appEdition";
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { getAppleBillingConfig, verifyAppleSubscription } from "./ascendApi";
import { getNativeCapacitorPlatform, isNativeCapacitorPlatform } from "./nativePlatform";

export type AppleProduct = { id: string; title: string; description: string; displayPrice: string };
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
    try { await confirmAppleTransaction(transaction); restored += 1; }
    catch (error) { failure = error; }
  }
  if (failure) throw failure;
  return restored;
}
