"use client";

import { getToken, isSupported, onMessage } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";
import type { PluginListenerHandle } from "@capacitor/core";
import { detectInstallPlatform } from "@ascend/shared";
import { getFirebaseClientApp } from "@/lib/firebase";
import { recordNotificationActivity, registerNotificationDevice, unregisterNotificationDevice } from "@/lib/ascendApi";

export const COACH_NOTIFICATION_ELIGIBLE_EVENT = "ascend:coach-notification-eligible";

const storageKeys = {
  prompted: "ascend.notifications.prompted.v1",
  enabled: "ascend.notifications.enabled.v1",
  postponedAt: "ascend.notifications.postponedAt.v1",
  token: "ascend.notifications.token.v1",
  activityDate: "ascend.notifications.activityDate.v1"
} as const;

let nativeActionListener: Promise<PluginListenerHandle> | null = null;
let nativeRefreshPromise: Promise<string | null> | null = null;

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

function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local storage is a convenience cache only.
  }
}

function isLikelyAscendAndroidApp() {
  if (typeof navigator === "undefined") return false;
  return /AscendAndroid\/1/i.test(navigator.userAgent);
}

async function isNativeAndroidApp() {
  if (typeof window === "undefined") return false;
  if (!isLikelyAscendAndroidApp()) return false;
  const { Capacitor } = await import("@capacitor/core");
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

async function getNativePushNotifications() {
  if (!await isNativeAndroidApp()) return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return PushNotifications;
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
  if (await isNativeAndroidApp()) return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;
  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return null;
  if (!await isSupported().catch(() => false)) return null;
  const { getMessaging } = await import("firebase/messaging");
  return getMessaging(getFirebaseClientApp());
}

async function createNativeCoachChannel() {
  const push = await getNativePushNotifications();
  if (!push) return;
  await push.createChannel({
    id: "coach_checkins",
    name: "Coach check-ins",
    description: "Helpful Ascend coaching nudges and trainer updates.",
    importance: 3,
    visibility: 0,
    lights: true,
    vibration: true
  }).catch(() => undefined);
}

async function registerNativePushToken() {
  const push = await getNativePushNotifications();
  if (!push) return null;

  const permission = await push.checkPermissions();
  const granted = permission.receive === "granted" ? permission : await push.requestPermissions();
  if (granted.receive !== "granted") {
    write(storageKeys.prompted, "true");
    write(storageKeys.postponedAt, String(Date.now()));
    throw new Error("Notifications were not enabled.");
  }

  await createNativeCoachChannel();

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let tokenHandle: PluginListenerHandle | null = null;
    let errorHandle: PluginListenerHandle | null = null;
    let timeout: number | null = null;

    const cleanup = () => {
      tokenHandle?.remove();
      errorHandle?.remove();
      if (timeout) window.clearTimeout(timeout);
    };

    push.addListener("registration", async (token) => {
      if (settled) return;
      settled = true;
      try {
        await registerNotificationDevice({ fcmToken: token.value, platform: "android" });
        write(storageKeys.enabled, "true");
        write(storageKeys.prompted, "true");
        write(storageKeys.token, token.value);
        cleanup();
        resolve(token.value);
      } catch (error) {
        cleanup();
        reject(error);
      }
    }).then((handle) => {
      tokenHandle = handle;
    }).catch(reject);

    push.addListener("registrationError", (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(error.error || "Android could not register this device for notifications."));
    }).then((handle) => {
      errorHandle = handle;
    }).catch(reject);

    timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Android did not return a notification token. Please try again."));
    }, 15_000);

    push.register().catch((error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
  });
}

async function enableWebCoachNotifications() {
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

export async function enableCoachNotifications() {
  if (await isNativeAndroidApp()) return registerNativePushToken();
  return enableWebCoachNotifications();
}

export async function refreshNativeCoachNotificationToken() {
  if (!await isNativeAndroidApp()) return null;
  if (read(storageKeys.enabled) !== "true") return null;
  if (!nativeRefreshPromise) {
    nativeRefreshPromise = registerNativePushToken().finally(() => {
      nativeRefreshPromise = null;
    });
  }
  return nativeRefreshPromise;
}

export async function disableCoachNotifications() {
  const token = read(storageKeys.token);
  if (token) {
    await unregisterNotificationDevice(token).catch(() => undefined);
  }
  const push = await getNativePushNotifications();
  if (push) await push.unregister().catch(() => undefined);
  remove(storageKeys.enabled);
  remove(storageKeys.token);
}

export function shouldOfferCoachNotifications() {
  if (typeof window === "undefined") return false;
  if (isLikelyAscendAndroidApp()) {
    if (read(storageKeys.enabled) === "true") return false;
    if (read(storageKeys.prompted) === "true") return false;
    return true;
  }
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
  const push = await getNativePushNotifications();
  if (push) {
    const handle = await push.addListener("pushNotificationReceived", (notification) => {
      onReceive({
        title: notification.title ?? "Ascend",
        body: notification.body ?? "Open Ascend when you are ready.",
        href: notification.data?.href ?? notification.link ?? "/dashboard"
      });
    });
    return () => handle.remove();
  }

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

export async function initializeNativeCoachNotificationRouting() {
  const push = await getNativePushNotifications();
  if (!push || nativeActionListener) return;
  nativeActionListener = push.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const href = notification.data?.href ?? notification.link ?? "/dashboard";
    window.location.assign(href);
  });
}
