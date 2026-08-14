const SENSITIVE = /token|password|authorization|cookie|email|phone|health|medical|image|photo/i;

function safeContext(context: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [
    key,
    SENSITIVE.test(key) ? "[REDACTED]" : typeof value === "string" ? value.slice(0, 300) : value
  ]));
}

export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  const detail = {
    name: error instanceof Error ? error.name : "ClientError",
    message: error instanceof Error ? error.message.slice(0, 300) : "Unknown client error",
    context: safeContext(context),
    timestamp: new Date().toISOString()
  };
  window.dispatchEvent(new CustomEvent("ascend:client-error", { detail }));
  if (process.env.NODE_ENV !== "production") console.error("[ascend-client-error]", detail);
}
