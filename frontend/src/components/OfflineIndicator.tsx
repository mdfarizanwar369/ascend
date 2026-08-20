"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto flex min-h-11 max-w-md items-center justify-center gap-2 rounded-xl border border-amber/40 bg-surface/95 px-4 py-2 text-sm font-medium text-amber shadow-soft backdrop-blur"
    >
      <WifiOff size={17} aria-hidden="true" />
      You are offline. New changes cannot sync until your connection returns.
    </div>
  );
}
