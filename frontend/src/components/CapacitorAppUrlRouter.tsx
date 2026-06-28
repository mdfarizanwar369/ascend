"use client";

import { useEffect } from "react";

const ASCEND_HOSTS = new Set(["getascend.fit", "www.getascend.fit"]);

function isNativeCapacitor() {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

function normalizeAscendUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    if (!ASCEND_HOSTS.has(url.hostname.toLowerCase())) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function CapacitorAppUrlRouter() {
  useEffect(() => {
    if (!isNativeCapacitor()) return;

    let active = true;
    let detach = () => undefined;

    async function attach() {
      const { App } = await import("@capacitor/app");

      const routeTo = (urlString: string) => {
        const target = normalizeAscendUrl(urlString);
        if (!target) return;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current === target) return;
        window.location.replace(target);
      };

      const launch = await App.getLaunchUrl().catch(() => null);
      if (active && launch?.url) routeTo(launch.url);

      const listener = await App.addListener("appUrlOpen", (event) => {
        routeTo(event.url);
      });

      detach = () => {
        void listener.remove();
      };
    }

    void attach();

    return () => {
      active = false;
      detach();
    };
  }, []);

  return null;
}
