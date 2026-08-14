const PUBLIC_PATHS = new Set(["/", "/login", "/launch", "/reset", "/privacy", "/terms", "/refund-policy", "/contact", "/delete-account"]);

export function isPublicAuthPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname);
}
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  try {
    const parsed = new URL(value, "https://www.getascend.fit");
    if (parsed.origin !== "https://www.getascend.fit" || isPublicAuthPath(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function loginUrlFor(pathname: string, search = "") {
  const returnTo = safeReturnPath(`${pathname}${search}`);
  return returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
}
