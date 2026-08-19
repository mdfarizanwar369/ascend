const prototypeSessionKey = "ascend:today-essentials-morph-v2:prototype";

export function isTodayEssentialsMorphV2Requested() {
  const legacySetting = process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V2;
  const v22Setting = process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V22;

  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      if (url.pathname.startsWith("/dev/essentials-morph")) {
        return url.searchParams.get("ascendMorph") === "v2";
      }
    } catch {
      return false;
    }
  }

  // V2.2 owns the legacy production flag during the rollout. Keeping the old
  // provider disabled prevents two launch controllers racing after navigation.
  const v22OwnsProductionFlag = v22Setting === "true"
    || (v22Setting !== "false" && legacySetting === "true");
  if (v22OwnsProductionFlag) return false;
  if (legacySetting === "true") return true;
  if (typeof window === "undefined") return false;

  try {
    const requested = new URL(window.location.href).searchParams.get("ascendMorph") === "v2";
    if (requested) window.sessionStorage.setItem(prototypeSessionKey, "true");
    return requested || window.sessionStorage.getItem(prototypeSessionKey) === "true";
  } catch {
    return false;
  }
}

export function clearTodayEssentialsMorphV2Prototype() {
  try {
    window.sessionStorage.removeItem(prototypeSessionKey);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}
