import { api } from "./api";
import { getFirebaseToken } from "./authToken";

const reported = new Set<string>();

export async function captureClientError(error: unknown, source: string) {
  if (typeof window === "undefined") return;
  const normalized = error instanceof Error ? error : new Error(String(error));
  const route = `${window.location.pathname}${window.location.search}`;
  const fingerprint = `${route}|${source}|${normalized.name}|${normalized.message}`;
  if (reported.has(fingerprint)) return;
  reported.add(fingerprint);

  try {
    const token = await getFirebaseToken();
    await api("/client-errors", {
      method: "POST",
      body: JSON.stringify({
        route,
        source,
        errorName: normalized.name || "Error",
        message: normalized.message || "Unknown client error",
        stack: normalized.stack ?? null,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null
      })
    }, token);
  } catch {
    // Error reporting must never create a second user-facing failure.
  }
}
