"use client";

import { disconnectHealthSync, getHealthSyncStatus, importHealthSync } from "./ascendApi";
import {
  canUseHealthConnect,
  getNativeHealthConnectStatus,
  requestNativeHealthConnectPermissions,
  syncNativeHealthConnect
} from "./healthConnect";
import { canUseAppleHealth, getNativeAppleHealthStatus, requestNativeAppleHealthPermissions, syncNativeAppleHealth } from "./appleHealth";

export function canUseNativeHealthSync() {
  return canUseHealthConnect() || canUseAppleHealth();
}

export async function getNativeHealthStatus() {
  if (canUseAppleHealth()) return getNativeAppleHealthStatus();
  return getNativeHealthConnectStatus();
}

export async function runNativeHealthSync(options: { interactive?: boolean } = {}) {
  if (!canUseAppleHealth()) return runHealthConnectSync(options);
  const interactive = options.interactive ?? true;
  const status = await getNativeAppleHealthStatus();
  if (!status.available) throw new Error("Apple Health is unavailable on this device.");
  if (!status.authorizationRequested) {
    if (!interactive) throw new Error("Connect Apple Health before syncing.");
    await requestNativeAppleHealthPermissions();
  }
  const nativeSync = await syncNativeAppleHealth();
  const imported = await importHealthSync({
    provider: "apple_health",
    permissions: nativeSync.permissionsGranted,
    timezone: nativeSync.timezone,
    syncedAt: nativeSync.syncedAt,
    records: nativeSync.records
  });
  return { nativeSync, imported };
}

export async function runHealthConnectSync(options: { interactive?: boolean } = {}) {
  const interactive = options.interactive ?? true;
  const nativeStatus = await getNativeHealthConnectStatus();
  if (!nativeStatus.available) {
    throw new Error("Health Connect is not available on this Android device.");
  }
  if (!nativeStatus.allPermissionsGranted) {
    if (!interactive) {
      throw new Error("Health Connect permissions are not currently granted.");
    }
    const requested = await requestNativeHealthConnectPermissions();
    if (!requested.allPermissionsGranted) {
      throw new Error("Health Connect permissions were not fully granted.");
    }
  }
  const nativeSync = await syncNativeHealthConnect();
  const imported = await importHealthSync({
    provider: "health_connect",
    permissions: nativeSync.permissionsGranted,
    timezone: nativeSync.timezone,
    syncedAt: nativeSync.syncedAt,
    records: nativeSync.records
  });
  return { nativeSync, imported };
}

export async function disconnectHealthConnectFromAscend() {
  await disconnectHealthSync();
}

export async function shouldAutoSyncHealthConnect() {
  if (!canUseNativeHealthSync()) return false;
  const status = await getHealthSyncStatus().catch(() => null);
  const provider = canUseAppleHealth() ? "apple_health" : "health_connect";
  return Boolean(status?.status.connected && status.status.provider === provider);
}
