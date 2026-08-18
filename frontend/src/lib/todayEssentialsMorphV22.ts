const prototypeSessionKey = "ascend:today-essentials-morph-v2-2:prototype";

export function isTodayEssentialsMorphV22Requested() {
  if (process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V22 === "true") return true;
  if (typeof window === "undefined") return false;

  try {
    const url = new URL(window.location.href);
    const requested = url.searchParams.get("ascendMorph") === "v22";
    if (url.pathname.startsWith("/dev/essentials-morph")) return requested;
    if (requested) window.sessionStorage.setItem(prototypeSessionKey, "true");
    return requested || window.sessionStorage.getItem(prototypeSessionKey) === "true";
  } catch {
    return false;
  }
}

export function clearTodayEssentialsMorphV22Prototype() {
  try {
    window.sessionStorage.removeItem(prototypeSessionKey);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}
