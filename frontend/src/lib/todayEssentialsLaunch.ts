const pendingColdLaunchKey = "ascend:today-essentials-morph:pending:v1";
const handledColdLaunchKey = "ascend:today-essentials-morph:handled:v1";

let claimedInCurrentDocument = false;

export function markTodayEssentialsColdLaunch() {
  try {
    window.sessionStorage.removeItem(handledColdLaunchKey);
    window.sessionStorage.setItem(pendingColdLaunchKey, "true");
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
}

export function claimTodayEssentialsColdLaunch() {
  if (claimedInCurrentDocument) return false;
  claimedInCurrentDocument = true;

  try {
    if (window.sessionStorage.getItem(handledColdLaunchKey)) return false;

    const wasLaunchedThroughAppEntry = window.sessionStorage.getItem(pendingColdLaunchKey) === "true";
    window.sessionStorage.removeItem(pendingColdLaunchKey);
    window.sessionStorage.setItem(handledColdLaunchKey, "true");

    if (wasLaunchedThroughAppEntry) return true;
  } catch {
    // Fall through to the navigation-entry check below.
  }

  const navigationEntry = window.performance
    .getEntriesByType("navigation")
    .at(0) as PerformanceNavigationTiming | undefined;

  try {
    const initialPath = new URL(navigationEntry?.name ?? window.location.href).pathname;
    return initialPath === "/dashboard" || initialPath === "/launch";
  } catch {
    return window.location.pathname === "/dashboard";
  }
}
