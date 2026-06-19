const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      cache: options.cache ?? "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("Could not reach Ascend right now. Please check your internet connection and try again in a moment.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message =
      typeof errorBody?.error === "string"
        ? `${errorBody.error}${typeof errorBody?.detail === "string" ? ` ${errorBody.detail}` : ""}`
        : `API request failed: ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
