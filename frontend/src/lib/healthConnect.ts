"use client";

import { registerPlugin } from "@capacitor/core";
import { isNativeAndroidCapacitor } from "./nativePlatform";
import { englishMessage } from "./i18n/static";

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
  if (!canUseHealthConnect()) throw new Error(englishMessage("health.healthConnectAndroidOnly"));
  return HealthSync.requestHealthPermissions();
}

export async function syncNativeHealthConnect() {
  if (!canUseHealthConnect()) throw new Error(englishMessage("health.healthConnectAndroidOnly"));
  return HealthSync.sync();
}
