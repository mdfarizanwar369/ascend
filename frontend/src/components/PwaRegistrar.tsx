"use client";

import { useRegisterServiceWorker } from "@/lib/pwa";

export function PwaRegistrar() {
  useRegisterServiceWorker();
  return null;
}
