self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => undefined);

// Keep this small allowlist aligned with shared safeNotificationHref. Worker tests
// compare it against the shared policy; never accept an arbitrary push URL.
function notificationHref(value) {
  if (typeof value !== "string" || value.length > 200 || /[%\\#\s]/.test(value)) return "/dashboard";
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  if (new RegExp("^/(notifications/open|workout-schedule)\\?id=" + uuid + "$", "i").test(value)) return value;
  if (/^\/food-log\?meal=(breakfast|lunch|dinner)$/.test(value)) return value;
  if (value === "/coach?workout=1" || new RegExp("^/coach-homework/" + uuid + "$", "i").test(value)) return value;
  if (["/dashboard", "/food-log", "/water-log", "/burn-log", "/journey", "/progress", "/coach", "/messages", "/reports", "/trainer", "/weight-log", "/habits", "/momentum-score", "/workout-schedule"].includes(value)) return value;
  return "/dashboard";
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: "Ascend", body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || "Ascend";
  const options = {
    body: notification.body || "Open Ascend when you are ready.",
    icon: "/brand/ascend-logo.png",
    badge: "/brand/ascend-logo.png",
    tag: data.eventId || data.tag || notification.tag || "ascend-coach",
    renotify: false,
    requireInteraction: false,
    data: {
      href: notificationHref(data.href)
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = notificationHref(event.notification.data?.href);
  const targetUrl = new URL(href, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && new URL(client.url).origin === self.location.origin) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
