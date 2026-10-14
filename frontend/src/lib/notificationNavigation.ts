import { nudgeUuid, safeNotificationHref } from "@ascend/shared";
const pendingKey = "ascend.pending-notification.v1";
/** Only an opaque ID survives login. Ownership is always resolved by the server. */
export function rememberNotificationLogin(id: string) {
  if (nudgeUuid.test(id)) { try { sessionStorage.setItem(pendingKey, JSON.stringify({ id, at: Date.now() })); } catch { /* URL fallback below */ } }
}
export function notificationLoginDestination(fallback: string) {
  try {
    const parameter = new URLSearchParams(window.location.search).get("notification");
    const pending = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null");
    sessionStorage.removeItem(pendingKey);
    const id = parameter ?? (pending && Date.now() - pending.at < 15 * 60000 ? pending.id : null);
    if (id && nudgeUuid.test(id)) return `/notifications/open?id=${id}`;
  } catch { /* Storage unavailable or malformed intent. */ }
  return fallback;
}
let lastTap = { href: "", at: 0 };
export function navigateNotification(input: unknown) {
  const href = safeNotificationHref(input);
  if (lastTap.href === href && Date.now() - lastTap.at < 2000) return;
  lastTap = { href, at: Date.now() };
  window.location.assign(href);
}
