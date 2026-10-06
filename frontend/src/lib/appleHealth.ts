"use client";

import { Capacitor,registerPlugin } from "@capacitor/core";
import { useEffect,useState } from "react";
import { HEALTH_ACTIVITY_CONSENT_VERSION,type HealthActivityImport } from "@ascend/shared";
import { connectHealthActivity,disconnectHealthActivity,getHealthActivityStatus,getMe,importHealthActivity,changeHealthReportingTimezone } from "./ascendApi";
import { getFirebaseClientAuth } from "./firebase";
import { getNativeCapacitorPlatform,isNativeCapacitorPlatform } from "./nativePlatform";

export interface AppleHealthNativeStatus {
  available: boolean;
  capability: string;
  installationId: string;
  connected: boolean;
  accountId: string | null;
  connectionGeneration: string | null;
  calendarGeneration: string | null;
  lastReadAt: string | null;
  pendingCount: number;
  paused: boolean;
}
export const AppleHealth = registerPlugin<{
  status(): Promise<AppleHealthNativeStatus>;
  requestAccess(): Promise<{ authorizationRequested: boolean }>;
  configure(input: { accountId: string; installationId: string; connectionGeneration: string; calendarGeneration: string; timezone: string }): Promise<void>;
  collect(): Promise<{ packet: HealthActivityImport | null; pendingCount: number }>;
  peek(input: { accountId: string }): Promise<{ packet: HealthActivityImport | null; pendingCount: number }>;
  acknowledge(input: { accountId: string; requestId: string }): Promise<void>;
  disconnect(): Promise<void>;
  pause(): Promise<void>;
}>("AscendHealth");

export function hasAppleHealthBridge() {
  return isNativeCapacitorPlatform() && getNativeCapacitorPlatform() === "ios" && Capacitor.isPluginAvailable("AscendHealth");
}
export function useAppleHealthCapability() {
  const [available,setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (hasAppleHealthBridge()) void Promise.all([AppleHealth.status(),getHealthActivityStatus()])
      .then(([native,server]) => { if (active) setAvailable(native.available && native.capability === "appleHealthReadV1" && (server.status.enabled || server.status.connections.some(source => source.installationId === native.installationId))); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  },[]);
  return available;
}

let inFlight: Promise<void> | null = null;
let lastSuccess = 0;
export async function connectAppleHealth(select = false) {
  if (!hasAppleHealthBridge()) throw new Error("Update the Ascend iOS app to connect Apple Health.");
  const uid = getFirebaseClientAuth().currentUser?.uid;
  const [native,me] = await Promise.all([AppleHealth.status(),getMe()]);
  if (!uid || getFirebaseClientAuth().currentUser?.uid !== uid) throw new Error("Sign in before connecting Apple Health.");
  await AppleHealth.requestAccess();
  if (getFirebaseClientAuth().currentUser?.uid !== uid) throw new Error("Your account changed. Connect again.");
  const connected = await connectHealthActivity({ installationId:native.installationId,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
    consentVersion:HEALTH_ACTIVITY_CONSENT_VERSION,consented:true,select });
  if (getFirebaseClientAuth().currentUser?.uid !== uid) throw new Error("Your account changed. Connect again.");
  await AppleHealth.configure({ accountId:me.user.id,installationId:native.installationId,
    connectionGeneration:connected.connection.generation,calendarGeneration:connected.calendarGeneration,timezone:connected.timezone });
  await runAppleHealthSync(true);
}

export function runAppleHealthSync(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!hasAppleHealthBridge() || (!force && Date.now()-lastSuccess < 60_000)) return Promise.resolve();
  const work = async () => {
    const uid = getFirebaseClientAuth().currentUser?.uid;
    if (!uid) { await AppleHealth.disconnect(); return; }
    const [native,server,me] = await Promise.all([AppleHealth.status(),getHealthActivityStatus(),getMe()]);
    if (getFirebaseClientAuth().currentUser?.uid !== uid || (native.connected && native.accountId !== me.user.id)) { await AppleHealth.disconnect(); return; }
    // A rollout pause stops uploads without destroying the protected outbox.
    if (!server.status.enabled) { await AppleHealth.pause(); return; }
    if (!native.connected) return;
    const connection = server.status.connections.find(item => item.installationId === native.installationId && item.connected);
    if (native.accountId !== me.user.id || !connection || native.connectionGeneration !== connection.generation) {
      await AppleHealth.disconnect();
      return;
    }
    if (getFirebaseClientAuth().currentUser?.uid !== uid) { await AppleHealth.disconnect(); return; }
    if ((native.paused || native.calendarGeneration !== server.status.calendarGeneration) && server.status.calendarGeneration && server.status.timezone) {
      await AppleHealth.configure({ accountId:me.user.id,installationId:native.installationId,connectionGeneration:connection.generation,
        calendarGeneration:server.status.calendarGeneration,timezone:server.status.timezone });
    }
    await AppleHealth.collect();
    for (let chunk = 0; chunk < 20; chunk++) {
      if (getFirebaseClientAuth().currentUser?.uid !== uid) { await AppleHealth.disconnect(); throw new Error("Account changed during Health sync."); }
      const pending = await AppleHealth.peek({ accountId:me.user.id });
      if (!pending.packet) break;
      const result = await importHealthActivity(pending.packet);
      if (!result.accepted || result.requestId !== pending.packet.requestId) throw new Error("Health upload was not acknowledged.");
      await AppleHealth.acknowledge({ accountId:me.user.id,requestId:result.requestId });
    }
    const remaining = await AppleHealth.peek({ accountId:me.user.id });
    if (remaining.packet) throw new Error("More Health updates are waiting. Sync again to finish uploading.");
    if (native.pendingCount > 0) {
      // After an offline replay, capture newer device observations immediately
      // rather than calling an old outbox flush a fresh read.
      await AppleHealth.collect();
      for (let chunk=0;chunk<20;chunk++) {
        if (getFirebaseClientAuth().currentUser?.uid !== uid) { await AppleHealth.disconnect(); throw new Error("Account changed during Health sync."); }
        const pending=await AppleHealth.peek({ accountId:me.user.id }); if (!pending.packet) break;
        const result=await importHealthActivity(pending.packet);
        if (!result.accepted || result.requestId!==pending.packet.requestId) throw new Error("Health upload was not acknowledged.");
        await AppleHealth.acknowledge({ accountId:me.user.id,requestId:result.requestId });
      }
      if ((await AppleHealth.peek({ accountId:me.user.id })).packet) throw new Error("More Health updates are waiting. Sync again to finish uploading.");
    }
    lastSuccess = Date.now();
    window.dispatchEvent(new Event("ascend:health-updated"));
  };
  inFlight = work().finally(() => { inFlight = null; });
  return inFlight;
}
export async function disconnectAppleHealth(deleteHistory = false) {
  const native = await AppleHealth.status();
  await AppleHealth.disconnect();
  await disconnectHealthActivity(native.installationId,deleteHistory);
  lastSuccess = 0;
  window.dispatchEvent(new Event("ascend:health-updated"));
}
export async function alignAppleHealthTimezone() {
  await runAppleHealthSync(true);
  await AppleHealth.pause();
  const native=await AppleHealth.status();
  if (native.pendingCount>0) throw new Error("Finish uploading pending Health updates before changing timezone.");
  const server=await getHealthActivityStatus();
  if (!server.status.calendarGeneration) throw new Error("Connect Apple Health first.");
  await changeHealthReportingTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone,server.status.calendarGeneration);
  await runAppleHealthSync(true);
}
