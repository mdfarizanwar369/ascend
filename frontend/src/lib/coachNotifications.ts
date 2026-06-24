"use client";

import { getToken, isSupported, onMessage } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";
import { detectInstallPlatform } from "@ascend/shared";
import { getFirebaseClientApp } from "@/lib/firebase";
import { recordNotificationActivity, registerNotificationDevice } from "@/lib/ascendApi";

export const COACH_NOTIFICATION_ELIGIBLE_EVENT = "ascend:coach-notification-eligible";

const storageKeys = {
  prompted: "ascend.notifications.prompted.v1",
  enabled: "ascend.notifications.enabled.v1",
  postponedAt: "ascend.notifications.postponedAt.v1",
  token: "ascend.notifications.token.v1",
  activityDate: "ascend.notifications.activityDate.v1"
} as const;

function read(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari private contexts can restrict storage. Current-session behavior still works.
  }
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function markCoachNotificationEligible() {
  window.dispatchEvent(new CustomEvent(COACH_NOTIFICATION_ELIGIBLE_EVENT));
}

export async function getMessagingIfAvailable(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return null;
  if (!await isSupported().catch(() => false)) return null;
  const { getMessaging } = await import("firebase/messaging");
  return getMessaging(getFirebaseClientApp());
}

export async function enableCoachNotifications() {
  const messaging = await getMessagingIfAvailable();
  if (!messaging) throw new Error("Coach notifications are not available on this browser yet.");

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") {
    write(storageKeys.prompted, "true");
    write(storageKeys.postponedAt, String(Date.now()));
    throw new Error("Notifications were not enabled.");
  }

  const registration = await navigator.serviceWorker.ready;
  const fcmToken = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration
  });
  if (!fcmToken) throw new Error("This browser did not return a notification token.");

  const platform = detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  await registerNotificationDevice({ fcmToken, platform });
  write(storageKeys.enabled, "true");
  write(storageKeys.prompted, "true");
  write(storageKeys.token, fcmToken);
  return fcmToken;
}

export function shouldOfferCoachNotifications() {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window) || Notification.permission === "denied") return false;
  if (read(storageKeys.enabled) === "true") return false;
  if (read(storageKeys.prompted) === "true") return false;
  return true;
}

export function postponeCoachNotifications() {
  write(storageKeys.prompted, "true");
  write(storageKeys.postponedAt, String(Date.now()));
}

export async function recordDailyNotificationActivity(screenName: string) {
  const today = todayKey();
  if (read(storageKeys.activityDate) === today) return;
  await recordNotificationActivity(screenName);
  write(storageKeys.activityDate, today);
}

export async function listenForForegroundCoachMessages(onReceive: (payload: { title: string; body: string; href: string }) => void) {
  const messaging = await getMessagingIfAvailable();
  if (!messaging) return () => undefined;
  return onMessage(messaging, (payload) => {
    onReceive({
      title: payload.notification?.title ?? "Ascend",
      body: payload.notification?.body ?? "Open Ascend when you are ready.",
      href: payload.data?.href ?? "/dashboard"
    });
  });
}
