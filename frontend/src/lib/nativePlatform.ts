export function isNativeCapacitorPlatform() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function getNativeCapacitorPlatform() {
  if (typeof window === "undefined") return null;
  const capacitor = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return capacitor?.getPlatform?.() ?? null;
}

export function isNativeAndroidCapacitor() {
  return isNativeCapacitorPlatform() && getNativeCapacitorPlatform() === "android";
}

export function supportsNativeIosAuth() {
  if (!isNativeCapacitorPlatform() || getNativeCapacitorPlatform() !== "ios") return false;
  // The hosted frontend also runs in the first iOS build, which has no auth plugin.
  const version = /AscendIOS\/(\d+)/.exec(window.navigator.userAgent);
  return Number(version?.[1] ?? 0) >= 2;
}

export function supportsNativeSocialAuth() {
  return isNativeAndroidCapacitor() || supportsNativeIosAuth();
}
