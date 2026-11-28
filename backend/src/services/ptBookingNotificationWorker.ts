import { ptLocalDate } from "@ascend/shared";
import { env } from "../config/env";
import { query } from "../db/pool";
import { providerReady, sendNudgePush, type NudgePushDevice } from "../integrations/nudgePush";

type QueuedNotification = {
  id: string;
  kind: "trainer_request" | "client_reminder";
  attempts: number;
  expires_at: Date;
};
type BookingDevice = NudgePushDevice & { booking_id: string; starts_at: Date; gym_zone: string };

async function updateResult(id: string, status: string, now: Date) {
  await query(`
    update pt_booking_notifications
    set status = $2, updated_at = $3,
      due_at = case when $2 = 'queued' then $3::timestamptz + interval '2 minutes' else due_at end
    where id = $1 and status = 'dispatching'
  `, [id, status, now]);
}

async function deliver(event: QueuedNotification, now: Date) {
  // Check the current assignment, booking version, and consent after claiming the event.
  const { rows } = await query<BookingDevice>(`
    select device.id, device.user_id, device.fcm_token, device.provider, device.platform,
      device.apns_environment, device.token_version, booking.id as booking_id, booking.starts_at, gym.timezone as gym_zone
    from pt_booking_notifications event
    join pt_bookings booking on booking.id = event.booking_id and booking.version = event.booking_version
    join gyms gym on gym.id = booking.gym_id
    join trainers trainer on trainer.id = booking.trainer_id and trainer.status = 'active' and trainer.gym_id = gym.id
    join users coach on coach.id = trainer.user_id and coach.status = 'active'
    join users client on client.id = booking.client_id and client.status = 'active' and client.primary_role = 'client'
      and client.assigned_trainer_id = trainer.id and client.gym_id = gym.id
    join notification_devices device on device.enabled
      and device.user_id = case when event.kind = 'trainer_request' then coach.id else client.id end
    left join notification_preferences prefs on prefs.user_id = device.user_id
    where event.id = $1 and event.status = 'dispatching' and event.expires_at > $2 and booking.starts_at > $2
      and booking.status = case when event.kind = 'trainer_request' then 'pending' else 'confirmed' end
      and (prefs.settings->>'enabled') is distinct from 'false'
    order by device.last_seen_at desc limit 5
  `, [event.id, now]);
  const devices = rows.filter(providerReady);
  if (devices.length === 0) return updateResult(event.id, "skipped", now);
  const booking = devices[0];
  const day = ptLocalDate(booking.starts_at, booking.gym_zone);
  const request = event.kind === "trainer_request";
  const path = request ? "/trainer/schedule" : "/pt-bookings";
  const results = await Promise.all(devices.map((device) => sendNudgePush(device, {
    eventId: event.id,
    title: request ? "New PT booking request" : "Your PT session is coming up",
    body: request ? "Open Ascend to review the request." : "Your session starts in about 24 hours. Open Ascend for details.",
    href: `${path}?day=${day}&booking=${booking.booking_id}`,
    expiresAt: event.expires_at
  })));
  const states = results.map((result) => result.status);
  // Only retry when acceptance is ruled out. An unknown reply can follow a real send.
  const status = states.includes("accepted") ? "accepted" : states.includes("unknown") ? "unknown"
    : states.includes("retry") && event.attempts < 3 && event.expires_at.getTime() > now.getTime() + 120_000
      ? "queued" : "failed";
  await updateResult(event.id, status, now);
}

export async function dispatchPtBookingNotifications(now = new Date()) {
  await query(`
    update pt_booking_notifications set status = 'unknown', updated_at = $1
    where status = 'dispatching' and updated_at < $1::timestamptz - interval '2 minutes'
  `, [now]);
  await query(`
    update pt_booking_notifications set status = 'skipped', updated_at = $1
    where status = 'queued' and due_at <= $1 and expires_at <= $1
  `, [now]);
  const { rows } = await query<QueuedNotification>(`
    with due as (
      select id from pt_booking_notifications
      where status = 'queued' and due_at <= $1 and expires_at > $1
      order by due_at, id limit 20 for update skip locked
    )
    update pt_booking_notifications event set status = 'dispatching', attempts = attempts + 1, updated_at = $1
    from due where event.id = due.id
    returning event.id, event.kind, event.attempts, event.expires_at
  `, [now]);
  const results = await Promise.allSettled(rows.map((event) => deliver(event, now)));
  if (results.some((result) => result.status === "rejected")) {
    console.warn("[pt-bookings] Notification dispatch outcome unavailable");
  }
}

export function startPtBookingNotificationWorker() {
  if (!env.PT_BOOKING_V1 || !env.PT_BOOKING_NOTIFICATIONS_V1) return async () => {};
  let active: Promise<void> | undefined;
  const tick = () => {
    active ??= dispatchPtBookingNotifications()
      .catch(() => console.warn("[pt-bookings] Notification queue check failed"))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 30_000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
