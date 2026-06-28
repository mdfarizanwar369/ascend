const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function apiTimingEnabled() {
  if (process.env.NEXT_PUBLIC_API_TIMING === "1") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:api-timing") === "1";
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  const url = `${API_URL}${path}`;
  const shouldLogBodyCompositionSave = path.includes("/body-composition/scans") && options.method === "POST";
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();

  try {
    if (shouldLogBodyCompositionSave) {
      console.info("[body-composition-save] Entering api()", { path, method: options.method });
      console.info("[body-composition-save] About to call fetch()", {
        url,
        method: options.method,
        payload: options.body,
        hasToken: Boolean(token)
      });
    }
    response = await fetch(url, {
      ...options,
      cache: options.cache ?? "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    if (shouldLogBodyCompositionSave) {
      console.info("[body-composition-save] Fetch returned", {
        url,
        status: response.status,
        ok: response.ok
      });
    }
    if (apiTimingEnabled()) {
      console.info("[ascend-api-response]", {
        path,
        url,
        method: options.method ?? "GET",
        status: response.status,
        durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt)
      });
    }
  } catch (error) {
    if (shouldLogBodyCompositionSave) {
      console.error("[body-composition-save] Fetch threw", {
        url,
        method: options.method,
        payload: options.body,
        error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null
      });
    }
    throw new Error("Could not reach Ascend right now. Please check your internet connection and try again in a moment.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    if (shouldLogBodyCompositionSave) {
      console.error("[body-composition-save] Response parsed with error status", {
        url,
        status: response.status,
        body: errorBody
      });
    }
    const issueMessage = Array.isArray(errorBody?.issues)
      ? errorBody.issues
          .map((issue: { message?: unknown }) => typeof issue.message === "string" ? issue.message : null)
          .filter(Boolean)
          .join(" ")
      : "";
    const message =
      typeof errorBody?.error === "string"
        ? `${errorBody.error}${issueMessage ? ` ${issueMessage}` : ""}${typeof errorBody?.detail === "string" ? ` ${errorBody.detail}` : ""}`
        : `API request failed: ${response.status}`;
    throw new Error(message);
  }

  const parsed = await response.json() as T;
  if (shouldLogBodyCompositionSave) {
    console.info("[body-composition-save] Response parsed", { url, parsed });
  }
  return parsed;
}
