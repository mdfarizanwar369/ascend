"use client";
import { deleteToken, getToken, isSupported, onMessage } from "firebase/messaging";
import type { Messaging } from "firebase/messaging";
import type { PluginListenerHandle } from "@capacitor/core";
import { detectInstallPlatform, safeNotificationHref } from "@ascend/shared";
import { getFirebaseClientApp, getFirebaseClientAuth } from "@/lib/firebase";
import { getSmartNudgePreferences, recordNotificationActivity, registerNotificationDevice, unregisterNotificationDevice, notificationDeviceStatus } from "@/lib/ascendApi";
import { navigateNotification } from "@/lib/notificationNavigation";

export const COACH_NOTIFICATION_ELIGIBLE_EVENT = "ascend:coach-notification-eligible";
const prefix = "ascend.notifications.v2";
let nativeActionListener: Promise<PluginListenerHandle> | null = null;
let refreshPromise: Promise<string | null> | null = null;
let signingOut = false;
function uid() { try { return getFirebaseClientAuth().currentUser?.uid ?? null; } catch { return null; } }
function read(key: string, account = uid()) { try { return account ? localStorage.getItem(`${prefix}.${account}.${key}`) : null; } catch { return null; } }
function write(key: string, value: string, account = uid()) { try { if (account) localStorage.setItem(`${prefix}.${account}.${key}`, value); } catch { /* Storage unavailable. */ } }
function remove(key: string, account = uid()) { try { if (account) localStorage.removeItem(`${prefix}.${account}.${key}`); } catch { /* Storage unavailable. */ } }
async function nativePush() {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  if (platform === "ios" && !/AscendPush\/1/.test(navigator.userAgent)) return null;
  if (!["android", "ios"].includes(platform) || !Capacitor.isPluginAvailable("PushNotifications")) return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return { push: PushNotifications, platform: platform as "android" | "ios" };
}
export function markCoachNotificationEligible() { window.dispatchEvent(new CustomEvent(COACH_NOTIFICATION_ELIGIBLE_EVENT)); }
export async function getMessagingIfAvailable(): Promise<Messaging | null> {
  if (typeof window === "undefined") return null;
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) return null;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) return null;
  if (!await isSupported().catch(() => false)) return null;
  const { getMessaging } = await import("firebase/messaging");
  return getMessaging(getFirebaseClientApp());
}
export type NotificationPermissionState = "granted" | "denied" | "prompt" | "unavailable";
export async function coachNotificationPermission(): Promise<NotificationPermissionState> {
  const native = await nativePush();
  if (native) {
    if (native.platform === "ios" && !(await getSmartNudgePreferences()).apnsAvailable) return "unavailable";
    const permission = (await native.push.checkPermissions()).receive;
    return permission === "granted" || permission === "denied" ? permission : "prompt";
  }
  if (!await getMessagingIfAvailable()) return "unavailable";
  return Notification.permission === "default" ? "prompt" : Notification.permission;
}
async function registerNative(allowPrompt: boolean): Promise<string | null> {
  const native = await nativePush(); if (!native) return null;
  const account = uid(); if (!account || signingOut) return null;
  if (native.platform === "ios" && !(await getSmartNudgePreferences()).apnsAvailable) throw new Error("iOS reminders need the updated Ascend app and push service.");
  let permission = await native.push.checkPermissions();
  if (permission.receive !== "granted" && allowPrompt && permission.receive !== "denied") permission = await native.push.requestPermissions();
  if (permission.receive !== "granted") {
    if (allowPrompt) write("prompted", "true", account);
    if (permission.receive === "denied") await disableCoachNotifications(false);
    if (!allowPrompt) return null;
    throw new Error("Notifications are off on this device. You can enable them in device Settings when you are ready.");
  }
  if (native.platform === "android") await native.push.createChannel({ id: "coach_checkins", name: "Coach check-ins", description: "Your Ascend reminders and trainer updates.", importance: 3, visibility: 0 }).catch(() => undefined);
  let tokenHandle: PluginListenerHandle | undefined; let errorHandle: PluginListenerHandle | undefined; let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      // Both listeners precede register, including on a fast cached-token response.
      void (async () => {
        tokenHandle = await native.push.addListener("registration", value => resolve(value.value));
        errorHandle = await native.push.addListener("registrationError", () => reject(new Error("This device could not register for reminders. Please try again.")));
        timer = setTimeout(() => reject(new Error("Device registration took too long. Please try again.")), 15000);
        await native.push.register();
      })().catch(reject);
    });
    if (uid() !== account || signingOut) return null;
    await registerNotificationDevice({ fcmToken: token, platform: native.platform, provider: native.platform === "ios" ? "apns" : "fcm", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (uid() !== account || signingOut) { await unregisterNotificationDevice(token).catch(() => undefined); return null; }
    write("token", token, account); write("enabled", "true", account); write("prompted", "true", account);
    return token;
  } finally { if (timer) clearTimeout(timer); await tokenHandle?.remove(); await errorHandle?.remove(); }
}
async function registerWeb(allowPrompt: boolean) {
  const account = uid(); if (!account || signingOut) return null;
  const messaging = await getMessagingIfAvailable();
  if (!messaging) { if (!allowPrompt) return null; throw new Error("Reminders are not supported here. Use the updated Ascend app or a supported installed browser app."); }
  let permission = Notification.permission;
  if (permission === "default" && allowPrompt) permission = await Notification.requestPermission();
  if (permission !== "granted") {
    if (allowPrompt) write("prompted", "true", account);
    if (permission === "denied") await disableCoachNotifications(false);
    if (!allowPrompt) return null;
    throw new Error("Notifications are off in this browser. You can change that in browser Settings.");
  }
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error("This browser did not return a notification token.");
  if (uid() !== account || signingOut) return null;
  await registerNotificationDevice({ fcmToken: token, platform: detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints), provider: "fcm", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (uid() !== account || signingOut) { await unregisterNotificationDevice(token).catch(() => undefined); return null; }
  write("token", token, account); write("enabled", "true", account); write("prompted", "true", account);
  return token;
}
export async function enableCoachNotifications() {
  signingOut = false;
  const token = await (await nativePush() ? registerNative(true) : registerWeb(true));
  if (!token) throw new Error("Please sign in again before enabling this device.");
  return token;
}
export async function refreshNativeCoachNotificationToken() {
  if (signingOut) return null;
  if (read("enabled") !== "true") {
    // Preserve old consent only after the server confirms that the legacy token
    // belongs to this account. A browser-wide local flag is not ownership proof.
    const account = uid(); let token: string | null = null;
    try { if (localStorage.getItem("ascend.notifications.enabled.v1") === "true") token = localStorage.getItem("ascend.notifications.token.v1"); } catch { /* Storage unavailable. */ }
    if (!account || !token) return null;
    const status = await notificationDeviceStatus(token).catch(() => ({ registered: false }));
    if (!status.registered || uid() !== account || signingOut) return null;
    write("enabled", "true", account); write("prompted", "true", account); write("token", token, account);
  }
  if (!refreshPromise) refreshPromise = (async () => await nativePush() ? registerNative(false) : registerWeb(false))().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function disableCoachNotifications(forSignOut = true) {
  if (forSignOut) signingOut = true;
  const account = uid();
  // Legacy token is only used for owner-scoped unregister, never to opt a new account in.
  let legacy: string | null = null; try { legacy = localStorage.getItem("ascend.notifications.token.v1"); } catch { /* unavailable */ }
  const token = read("token", account) ?? legacy;
  if (token) await unregisterNotificationDevice(token).catch(() => undefined);
  const native = await nativePush();
  if (native) { await native.push.unregister().catch(() => undefined); await native.push.removeAllDeliveredNotifications().catch(() => undefined); }
  else { const messaging = await getMessagingIfAvailable(); if (messaging) await deleteToken(messaging).catch(() => undefined); }
  remove("enabled", account); remove("token", account); remove("activity", account);
  try { localStorage.removeItem("ascend.notifications.token.v1"); localStorage.removeItem("ascend.notifications.enabled.v1"); } catch { /* unavailable */ }
}
export function shouldOfferCoachNotifications() {
  if (typeof window === "undefined" || !uid()) return false;
  if (/AscendIOS\//.test(navigator.userAgent) && !/AscendPush\/1/.test(navigator.userAgent)) return false;
  if ("Notification" in window && Notification.permission === "denied") return false;
  return read("enabled") !== "true" && read("prompted") !== "true";
}
export function postponeCoachNotifications() { write("prompted", "true"); }
export async function recordDailyNotificationActivity(screenName: string) {
  const account = uid(); if (!account) return;
  // At most once per account/hour. App inactivity is not physical inactivity.
  const last = Number(read("activity", account) ?? 0); if (Date.now() - last < 3600000) return;
  await recordNotificationActivity(screenName); write("activity", String(Date.now()), account);
}
export async function listenForForegroundCoachMessages(onReceive: (payload: { title: string; body: string; href: string }) => void) {
  const receive = (title: unknown, body: unknown, href: unknown) => {
    if (!uid() || signingOut) return;
    onReceive({ title: typeof title === "string" ? title : "Ascend", body: typeof body === "string" ? body : "Open Ascend when you are ready.", href: safeNotificationHref(href) });
  };
  const native = await nativePush();
  if (native) {
    const handle = await native.push.addListener("pushNotificationReceived", n => receive(n.title, n.body, n.data?.href ?? n.link));
    return () => { void handle.remove(); };
  }
  const messaging = await getMessagingIfAvailable(); if (!messaging) return () => {};
  return onMessage(messaging, p => receive(p.notification?.title, p.notification?.body, p.data?.href));
}
export async function initializeNativeCoachNotificationRouting() {
  const native = await nativePush(); if (!native || nativeActionListener) return;
  nativeActionListener = native.push.addListener("pushNotificationActionPerformed", ({ notification }) => navigateNotification(notification.data?.href ?? notification.link));
  try { await nativeActionListener; } catch { nativeActionListener = null; }
}
