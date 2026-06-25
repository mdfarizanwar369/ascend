import { AscendDNAService, AscendDnaEvent, NotificationCandidate, NotificationEngine } from "@ascend/shared";
import { query } from "../db/pool";
import { getFirebaseMessaging } from "../integrations/firebase";

type Platform = "android" | "ios" | "desktop" | "web";

export async function ensureNotificationSchema() {
  await query(`
    create table if not exists notification_devices (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      fcm_token text not null unique,
      platform text not null default 'web',
      user_agent text,
      enabled boolean not null default true,
      last_seen_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists notification_devices_user_enabled_idx
      on notification_devices(user_id, enabled, last_seen_at desc);

    create table if not exists notification_events (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      notification_type text not null,
      priority integer not null,
      title text not null,
      body text not null,
      href text not null default '/dashboard',
      tag text not null default 'ascend-coach',
      dedupe_key text not null,
      status text not null default 'sent',
      channel text not null default 'push',
      error text,
      created_at timestamptz not null default now(),
      sent_at timestamptz
    );

    create unique index if not exists notification_events_user_dedupe_idx
      on notification_events(user_id, dedupe_key);

    create index if not exists notification_events_user_type_created_idx
      on notification_events(user_id, notification_type, created_at desc);
  `);
}

export async function registerNotificationDevice(input: {
  userId: string;
  fcmToken: string;
  platform: Platform;
  userAgent?: string | null;
}) {
  const result = await query(
    `
    insert into notification_devices (user_id, fcm_token, platform, user_agent)
    values ($1, $2, $3, $4)
    on conflict (fcm_token) do update set
      user_id = excluded.user_id,
      platform = excluded.platform,
      user_agent = excluded.user_agent,
      enabled = true,
      last_seen_at = now(),
      updated_at = now()
    returning id, platform, enabled, last_seen_at
    `,
    [input.userId, input.fcmToken, input.platform, input.userAgent ?? null]
  );
  return result.rows[0];
}

export async function disableNotificationDevice(userId: string, fcmToken: string) {
  await query("update notification_devices set enabled = false, updated_at = now() where user_id = $1 and fcm_token = $2", [userId, fcmToken]);
}

export async function recordNotificationActivity(userId: string, screenName = "app") {
  await query(
    `
    insert into analytics_events (user_id, gym_id, event_name, metadata)
    select id, gym_id, 'screen_open', $2::jsonb
    from users
    where id = $1
    `,
    [userId, { screenName }]
  );
}

function notificationLink(href: string) {
  return href.startsWith("http") ? href : `${process.env.FRONTEND_URL ?? "https://www.getascend.fit"}${href}`;
}

async function logNotificationEvent(userId: string, candidate: NotificationCandidate, status: "sent" | "skipped" | "error", error?: string | null) {
  await query(
    `
    insert into notification_events (
      user_id, notification_type, priority, title, body, href, tag, dedupe_key, status, error, sent_at
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,case when $9 = 'sent' then now() else null end)
    on conflict (user_id, dedupe_key) do nothing
    `,
    [
      userId,
      candidate.type,
      candidate.priority,
      candidate.title,
      candidate.body,
      candidate.href,
      candidate.tag,
      candidate.dedupeKey,
      status,
      error ?? null
    ]
  );
}

export async function sendNotificationToUser(userId: string, candidate: NotificationCandidate) {
  const duplicate = await query("select id from notification_events where user_id = $1 and dedupe_key = $2 limit 1", [
    userId,
    candidate.dedupeKey
  ]);
  if (duplicate.rows[0]) return { sent: 0, skipped: true };

  const devices = await query<{ fcm_token: string }>(
    "select fcm_token from notification_devices where user_id = $1 and enabled = true order by last_seen_at desc limit 5",
    [userId]
  );
  if (!devices.rows.length) {
    await logNotificationEvent(userId, candidate, "skipped", "no_enabled_devices");
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  let lastError: string | null = null;
  for (const device of devices.rows) {
    try {
      await getFirebaseMessaging().send({
        token: device.fcm_token,
        notification: {
          title: candidate.title,
          body: candidate.body
        },
        data: {
          href: candidate.href,
          type: candidate.type,
          tag: candidate.tag
        },
        webpush: {
          fcmOptions: { link: notificationLink(candidate.href) },
          notification: {
            icon: "/brand/ascend-logo.png",
            badge: "/brand/ascend-logo.png",
            tag: candidate.tag,
            renotify: false,
            requireInteraction: false
          }
        }
      });
      sent += 1;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "unknown_error";
      if (/registration-token-not-registered|invalid-registration-token/i.test(lastError)) {
        await query("update notification_devices set enabled = false, updated_at = now() where fcm_token = $1", [device.fcm_token]);
      }
    }
  }

  await logNotificationEvent(userId, candidate, sent > 0 ? "sent" : "error", sent > 0 ? null : lastError);
  return { sent, skipped: false };
}

export async function notifyHumanCoachEvent(input: {
  userId: string;
  event: "message" | "praise" | "mission" | "nutrition_plan";
  senderName?: string | null;
  missionTitle?: string | null;
}) {
  try {
    const candidate = NotificationEngine.select({
      now: new Date(),
      dna: AscendDNAService.buildProfile({ events: [], now: new Date() }),
      openedToday: false,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      trainerEvent: {
        type: input.event,
        senderName: input.senderName,
        missionTitle: input.missionTitle
      }
    });
    if (!candidate) return { sent: 0, skipped: true };
    return sendNotificationToUser(input.userId, candidate);
  } catch {
    return { sent: 0, skipped: true };
  }
}

async function buildDnaEvents(userId: string): Promise<AscendDnaEvent[]> {
  const result = await query<AscendDnaEvent>(
    `
    select 'food' as type, logged_at as "occurredAt" from food_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'water' as type, logged_at as "occurredAt" from water_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'weight' as type, logged_at as "occurredAt" from weight_logs where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'activity' as type, created_at as "occurredAt" from analytics_events where user_id = $1 and event_name = 'burn_log' and created_at >= now() - interval '28 days'
    union all select 'progress_photo' as type, logged_at as "occurredAt" from progress_photos where user_id = $1 and logged_at >= now() - interval '28 days'
    union all select 'screen_open' as type, created_at as "occurredAt" from analytics_events where user_id = $1 and event_name = 'screen_open' and created_at >= now() - interval '28 days'
    `
    ,
    [userId]
  );
  return result.rows;
}

export async function runCoachNotificationJob(limit = 500) {
  const users = await query<{ id: string }>(
    `
    select distinct u.id
    from users u
    join notification_devices nd on nd.user_id = u.id and nd.enabled = true
    where u.status = 'active'
    order by u.id
    limit $1
    `,
    [limit]
  );

  let sent = 0;
  for (const user of users.rows) {
    const [events, sentTodayResult, openedTodayResult, foodTodayResult, weeklyReflectionResult] = await Promise.all([
      buildDnaEvents(user.id),
      query<{
        coaching: string;
        celebration: string;
        trainer_message: string;
      }>(
        `
        select
          count(*) filter (where notification_type in ('next_best_move', 'weekly_reflection')) as coaching,
          count(*) filter (where notification_type = 'celebration') as celebration,
          count(*) filter (where notification_type in ('trainer_message', 'trainer_praise', 'trainer_mission', 'trainer_nutrition_plan')) as trainer_message
        from notification_events
        where user_id = $1 and created_at >= current_date
        `,
        [user.id]
      ),
      query<{ opened: string }>(
        "select count(*) as opened from analytics_events where user_id = $1 and event_name = 'screen_open' and created_at >= current_date",
        [user.id]
      ),
      query<{ food_count: string; protein_g: string; water_ml: string }>(
        `
        select
          (select count(*) from food_logs where user_id = $1 and logged_at >= current_date) as food_count,
          (select coalesce(sum(protein_g), 0) from food_logs where user_id = $1 and logged_at >= current_date) as protein_g,
          (select coalesce(sum(amount_ml), 0) from water_logs where user_id = $1 and logged_at >= current_date) as water_ml
        `,
        [user.id]
      ),
      query<{ report_count: string }>(
        "select count(*) as report_count from weekly_reports where user_id = $1 and created_at >= now() - interval '7 days'",
        [user.id]
      )
    ]);
    const now = new Date();
    const dna = AscendDNAService.buildProfile({ now, events });
    const sentToday = sentTodayResult.rows[0];
    const foodToday = foodTodayResult.rows[0];
    const foodCount = Number(foodToday?.food_count ?? 0);
    const proteinLeft = Math.max(0, 90 - Number(foodToday?.protein_g ?? 0));
    const waterLeftMl = Math.max(0, 2500 - Number(foodToday?.water_ml ?? 0));
    const nextBestMove = AscendDNAService.getNextBestMove({
      now,
      dna,
      todaysFoodCount: foodCount,
      caloriesLeft: foodCount ? 0 : 1200,
      calorieOver: 0,
      proteinLeft,
      waterLeftMl,
      completedHabits: 0,
      totalHabits: 0,
      todaysBurnCalories: 0,
      latestWeightLoggedToday: dna.daysSinceWeight === 0,
      progressPhotoDue: dna.progressPhotoConsistency < 25
    });
    const candidate = NotificationEngine.select({
      now,
      dna,
      openedToday: Number(openedTodayResult.rows[0]?.opened ?? 0) > 0,
      prioritiesComplete: foodCount > 0 && proteinLeft <= 15 && waterLeftMl <= 250,
      sentToday: {
        coaching: Number(sentToday?.coaching ?? 0) > 0,
        celebration: Number(sentToday?.celebration ?? 0) > 0,
        trainerMessage: Number(sentToday?.trainer_message ?? 0) > 0
      },
      weeklyReflectionDue: now.getDay() === 1 && Number(weeklyReflectionResult.rows[0]?.report_count ?? 0) > 0,
      celebrationSignals: dna.currentStreak > dna.bestStreak && dna.currentStreak > 1
        ? [{ type: "longest_streak", value: dna.currentStreak }]
        : dna.averageWeeklyConsistency >= 85
          ? [{ type: "best_week" }]
          : [],
      nextBestMove
    });
    if (!candidate) continue;
    const result = await sendNotificationToUser(user.id, candidate);
    sent += result.sent;
  }

  return { usersChecked: users.rows.length, notificationsSent: sent };
}
