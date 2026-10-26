"use client";

import { useEffect } from "react";
import { applyAscendAppearance, getAscendAppearanceRevision, parseAscendAppearance } from "@/lib/ascendAppearance";
import { ascendSiri } from "@/lib/ascendSiri";
import { getNativeCapacitorPlatform, isNativeCapacitorPlatform } from "@/lib/nativePlatform";

export function AscendAppearanceCoordinator() {
  useEffect(() => {
    if (!isNativeCapacitorPlatform() || getNativeCapacitorPlatform() !== "ios") return;

    let cancelled = false;
    const revision = getAscendAppearanceRevision();
    // Widget links load a fresh document, including pages without a theme picker.
    // Restore the device's saved theme without changing the widget preference.
    void ascendSiri.getWidgetTheme().then(({ theme }) => {
      if (cancelled || revision !== getAscendAppearanceRevision()) return;
      const appearance = parseAscendAppearance(theme);
      if (appearance) applyAscendAppearance(appearance);
    }).catch(() => { /* Older builds keep their cached light/dark appearance. */ });

    return () => { cancelled = true; };
  }, []);

  return null;
}
