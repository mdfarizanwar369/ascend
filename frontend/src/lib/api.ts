import { appEditionHeaders } from "./appEdition";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const READ_DEADLINE_MS = 20_000;

function withReadDeadline<T>(options: RequestInit, work: (signal?: AbortSignal) => Promise<T>): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (options.signal || (method !== "GET" && method !== "HEAD")) return work(options.signal ?? undefined);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Ascend is taking too long to respond. Please try again."));
      controller.abort();
    }, READ_DEADLINE_MS);
  });

  return Promise.race([work(controller.signal), deadline]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function apiTimingEnabled() {
  if (process.env.NEXT_PUBLIC_API_TIMING === "1") return true;
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:api-timing") === "1";
}

function bodyCompositionSaveDebugEnabled() {
  if (process.env.NEXT_PUBLIC_BODY_COMPOSITION_SAVE_DEBUG === "1") return true;
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("ascend:body-composition-save-debug") === "1";
}

async function apiCore<T>(path: string, options: RequestInit, token?: string): Promise<T> {
  let response: Response;
  const url = `${API_URL}${path}`;
  const shouldLogBodyCompositionSave = path.includes("/body-composition/scans") && options.method === "POST" && bodyCompositionSaveDebugEnabled();
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
        ...options.headers,
        ...appEditionHeaders()
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
    if (options.signal?.aborted) throw error;
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
    throw Object.assign(new Error(message), { status: response.status });
  }

  const parsed = await response.json() as T;
  if (shouldLogBodyCompositionSave) {
    console.info("[body-composition-save] Response parsed", { url, parsed });
  }
  return parsed;
}

export function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  return withReadDeadline(options, (signal) => apiCore<T>(path, { ...options, signal }, token));
}

async function apiBlobCore(path: string, options: RequestInit, token?: string) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: options.cache ?? "no-store",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
        ...appEditionHeaders()
      }
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error("Could not reach Ascend right now. Please check your internet connection and try again in a moment.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = typeof errorBody?.error === "string" ? errorBody.error : `API request failed: ${response.status}`;
    throw new Error(`${response.status}: ${message}`);
  }
  return response.blob();
}

export function apiBlob(path: string, options: RequestInit = {}, token?: string) {
  return withReadDeadline(options, (signal) => apiBlobCore(path, { ...options, signal }, token));
}
