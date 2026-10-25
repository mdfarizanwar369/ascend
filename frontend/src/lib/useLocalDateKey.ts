"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "./date";

// Timers pause while iOS suspends the app. Check the local calendar again on
// return, and schedule midnight using local dates so DST changes are respected.
export function useLocalDateKey() {
  const [day, setDay] = useState(() => localDateKey());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function update() {
      clearTimeout(timer);
      setDay(localDateKey());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, Math.max(1, midnight.getTime() - now.getTime()));
    }
    function onVisible() {
      if (document.visibilityState !== "hidden") update();
    }
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return day;
}
