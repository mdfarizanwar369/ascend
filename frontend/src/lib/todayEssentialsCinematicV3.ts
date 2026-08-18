const prototypeSessionKey = "ascend:today-essentials-cinematic-v3:prototype";

export function isTodayEssentialsCinematicV3Requested() {
  if (process.env.NEXT_PUBLIC_ASCEND_CINEMATIC_LAUNCH_V3 === "true") return true;
  if (typeof window === "undefined") return false;

  try {
    const requested = new URL(window.location.href).searchParams.get("ascendMorph") === "v3";
    if (requested) window.sessionStorage.setItem(prototypeSessionKey, "true");
    return requested || window.sessionStorage.getItem(prototypeSessionKey) === "true";
  } catch {
    return false;
  }
}

export function clearTodayEssentialsCinematicV3Prototype() {
  try {
    window.sessionStorage.removeItem(prototypeSessionKey);
  } catch {
    // Session storage can be unavailable in restricted browser contexts.
  }
}
