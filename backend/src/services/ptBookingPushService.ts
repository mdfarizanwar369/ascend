import { query } from "../db/pool";
import { providerReady, sendNudgePush, type NudgePushDevice } from "../integrations/nudgePush";
import type { PtClientNotice } from "./ptBookingService";

export function notifyPtBookingClient(update?: PtClientNotice) {
  if (!update) return;
  // The booking and in-app update are already committed. Push delivery is optional.
  void deliver(update).catch(() => console.warn("[pt-bookings] Could not dispatch booking update"));
}

async function deliver(update: PtClientNotice) {
  const devices = await query<NudgePushDevice & { starts_at: Date }>(`
    select device.id, device.user_id, device.fcm_token, device.provider, device.platform,
      device.apns_environment, device.token_version, booking.starts_at
    from notification_devices device
    join pt_bookings booking on booking.client_id = device.user_id and booking.client_update_id = $2
    where device.user_id = $1 and device.enabled and booking.status = 'confirmed' and booking.starts_at > now()
    order by device.last_seen_at desc limit 5
  `, [update.clientId, update.id]);
  await Promise.all(devices.rows.filter(providerReady).map((device) => sendNudgePush(device, {
    eventId: update.id,
    title: update.kind === "moved" ? "Your PT booking was moved" : "Your PT booking is confirmed",
    body: "Open Ascend to see the details.",
    href: "/pt-bookings",
    expiresAt: new Date(Math.min(device.starts_at.getTime(), Date.now() + 24 * 60 * 60_000))
  })));
}
