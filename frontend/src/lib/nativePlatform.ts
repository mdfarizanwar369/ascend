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
