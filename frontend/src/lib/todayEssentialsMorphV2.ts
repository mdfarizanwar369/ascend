const prototypeSessionKey = "ascend:today-essentials-morph-v2:prototype";

export function isTodayEssentialsMorphV2Requested() {
  if (process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V2 === "true") return true;
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
