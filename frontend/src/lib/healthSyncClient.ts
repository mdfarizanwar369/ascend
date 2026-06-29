"use client";

import { disconnectHealthSync, getHealthSyncStatus, importHealthSync } from "./ascendApi";
import {
  canUseHealthConnect,
  getNativeHealthConnectStatus,
  requestNativeHealthConnectPermissions,
  syncNativeHealthConnect
} from "./healthConnect";

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
  if (!canUseHealthConnect()) return false;
  const status = await getHealthSyncStatus().catch(() => null);
  return Boolean(status?.status.connected);
}
