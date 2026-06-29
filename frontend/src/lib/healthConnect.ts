"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeAndroidCapacitor } from "./nativePlatform";

export type HealthConnectAvailability =
  | "available"
  | "update_required"
  | "provider_update_required"
  | "unavailable";

export type NativeHealthSyncRecord = {
  type: "steps_daily" | "active_calories_daily" | "exercise_session";
  externalRecordId: string;
  recordedOn?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  sourceApp?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NativeHealthConnectStatus = {
  available: boolean;
  availability: HealthConnectAvailability;
  permissionsGranted: string[];
  allPermissionsGranted: boolean;
};

export type NativeHealthConnectSyncResult = NativeHealthConnectStatus & {
  timezone: string | null;
  syncedAt: string;
  records: NativeHealthSyncRecord[];
};

type HealthSyncPlugin = {
  getStatus(): Promise<NativeHealthConnectStatus>;
  requestHealthPermissions(): Promise<NativeHealthConnectStatus>;
  sync(): Promise<NativeHealthConnectSyncResult>;
};

const HealthSync = registerPlugin<HealthSyncPlugin>("HealthSync");

export function canUseHealthConnect() {
  return isNativeAndroidCapacitor();
}

export async function getNativeHealthConnectStatus() {
  if (!canUseHealthConnect()) {
    return {
      available: false,
      availability: "unavailable" as const,
      permissionsGranted: [],
      allPermissionsGranted: false
    };
  }
  return HealthSync.getStatus();
}

export async function requestNativeHealthConnectPermissions() {
  if (!canUseHealthConnect()) throw new Error("Health Connect is available only in the Android app.");
  return HealthSync.requestHealthPermissions();
}

export async function syncNativeHealthConnect() {
  if (!canUseHealthConnect()) throw new Error("Health Connect is available only in the Android app.");
  return HealthSync.sync();
}
