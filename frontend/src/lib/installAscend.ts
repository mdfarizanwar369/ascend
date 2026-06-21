"use client";

export const INSTALL_ELIGIBLE_EVENT = "ascend:install-eligible";
export const INSTALL_REQUEST_EVENT = "ascend:install-request";
export const INSTALL_STATE_EVENT = "ascend:install-state";

export const installStorageKeys = {
  eligible: "ascend.install.eligible.v1",
  prompted: "ascend.install.prompted.v1",
  postponed: "ascend.install.postponed.v1",
  bannerDismissedAt: "ascend.install.bannerDismissedAt.v1",
  installed: "ascend.install.installed.v1"
} as const;

type InstallReason = "signup" | "first_action";

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Restricted browsers can still use the in-memory install event for this visit.
  }
}

export function readInstallValue(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function markInstallEligible(reason: InstallReason) {
  write(installStorageKeys.eligible, reason);
  window.dispatchEvent(new CustomEvent(INSTALL_ELIGIBLE_EVENT, { detail: { reason } }));
}

export function requestInstallAscend() {
  window.dispatchEvent(new CustomEvent(INSTALL_REQUEST_EVENT));
}

export function markAscendInstalled() {
  write(installStorageKeys.installed, "true");
  try {
    window.localStorage.removeItem(installStorageKeys.postponed);
    window.localStorage.removeItem(installStorageKeys.bannerDismissedAt);
  } catch {
    // The installed display mode remains the source of truth when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(INSTALL_STATE_EVENT));
}

export function clearAscendInstalled() {
  try {
    window.localStorage.removeItem(installStorageKeys.installed);
  } catch {
    // A fresh native install event still updates the current in-memory state.
  }
  window.dispatchEvent(new CustomEvent(INSTALL_STATE_EVENT));
}

export function isAscendInstalled() {
  if (typeof window === "undefined") return false;
  const iosStandalone = "standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone || readInstallValue(installStorageKeys.installed) === "true";
}
