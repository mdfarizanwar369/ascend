const HANDLED_NATIVE_LAUNCHES_KEY = "ascend:handled-native-launches";
const MAX_HANDLED_NATIVE_LAUNCHES = 12;

type NativeRouteStorage = Pick<Storage, "getItem" | "setItem">;

function readHandledNativeLaunches(storage: NativeRouteStorage): string[] {
  try {
    const value = JSON.parse(storage.getItem(HANDLED_NATIVE_LAUNCHES_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function wasNativeLaunchHandled(storage: NativeRouteStorage, target: string) {
  return readHandledNativeLaunches(storage).includes(target);
}

export function rememberNativeLaunch(storage: NativeRouteStorage, target: string) {
  try {
    const handled = readHandledNativeLaunches(storage).filter((item) => item !== target);
    storage.setItem(HANDLED_NATIVE_LAUNCHES_KEY, JSON.stringify([...handled, target].slice(-MAX_HANDLED_NATIVE_LAUNCHES)));
  } catch {
    // Native routing must still work when browser storage is unavailable.
  }
}
