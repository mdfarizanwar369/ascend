"use client";

import { useEffect } from "react";
import { captureClientError } from "@/lib/clientErrorReporter";

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => void captureClientError(event.error ?? event.message, "window.error");
    const onUnhandledRejection = (event: PromiseRejectionEvent) => void captureClientError(event.reason, "unhandledrejection");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);
  return null;
}
