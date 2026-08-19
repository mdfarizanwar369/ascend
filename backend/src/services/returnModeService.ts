import { evaluateReturnModeEligibility, type ReturnModeInactivityBucket, type Role } from "@ascend/shared";
import { pool } from "../db/pool";

type ReturnModeProfileRow = {
  id: string;
  full_name: string;
  status: string;
  goal_type: string | null;
  starting_weight_kg: string | number | null;
  last_meaningful_activity_at: string | Date | null;
  return_mode_last_shown_at: string | Date | null;
  return_mode_shown_for_activity_at: string | Date | null;
};

export type ReturnModeClaim = {
  claimed: boolean;
  fullName?: string;
  inactivityBucket?: ReturnModeInactivityBucket;
};

function analyticsMetadata(inactivityBucket: ReturnModeInactivityBucket) {
  return JSON.stringify({
    inactivity_bucket: inactivityBucket,
    entry_surface: "app_launch"
  });
}

export async function claimReturnMode(input: {
  userId: string;
  primaryRole: Role;
  roles: Role[];
  now?: Date;
}): Promise<ReturnModeClaim> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const profileResult = await db.query<ReturnModeProfileRow>(
      `
      select id, full_name, status, goal_type, starting_weight_kg,
        last_meaningful_activity_at, return_mode_last_shown_at, return_mode_shown_for_activity_at
      from users
      where id = $1
      for update
      `,
      [input.userId]
    );
    const profile = profileResult.rows[0];
    if (!profile) {
      await db.query("commit");
      return { claimed: false };
    }

    const eligibility = evaluateReturnModeEligibility({
      featureEnabled: true,
      authResolved: true,
      profileResolved: true,
      status: profile.status,
      primaryRole: input.primaryRole,
      roles: input.roles,
      goalType: profile.goal_type,
      startingWeightKg: profile.starting_weight_kg,
      lastMeaningfulActivityAt: profile.last_meaningful_activity_at,
      returnModeLastShownAt: profile.return_mode_last_shown_at,
      returnModeShownForActivityAt: profile.return_mode_shown_for_activity_at
    }, input.now ?? new Date());

    if (!eligibility.eligible) {
      await db.query("commit");
      return { claimed: false };
    }

    await db.query(
      `
      update users
      set return_mode_last_shown_at = clock_timestamp(),
        return_mode_shown_for_activity_at = last_meaningful_activity_at
      where id = $1
      `,
      [input.userId]
    );
    await db.query(
      `
      insert into analytics_events (user_id, event_name, metadata)
      values ($1, 'return_mode_viewed', $2::jsonb)
      `,
      [input.userId, analyticsMetadata(eligibility.inactivityBucket)]
    );
    await db.query("commit");
    return {
      claimed: true,
      fullName: profile.full_name,
      inactivityBucket: eligibility.inactivityBucket
    };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

export async function recordReturnModeContinued(userId: string) {
  const result = await pool.query<{
    inactivity_bucket: ReturnModeInactivityBucket;
  }>(
    `
    select case
      when extract(epoch from (return_mode_last_shown_at - last_meaningful_activity_at)) / 3600 >= 720 then '30_plus_days'
      when extract(epoch from (return_mode_last_shown_at - last_meaningful_activity_at)) / 3600 >= 336 then '14_29_days'
      else '5_13_days'
    end as inactivity_bucket
    from users
    where id = $1
      and return_mode_shown_for_activity_at = last_meaningful_activity_at
      and return_mode_last_shown_at is not null
    `,
    [userId]
  );
  const profile = result.rows[0];
  if (!profile) return { recorded: false };

  await pool.query(
    `
    insert into analytics_events (user_id, event_name, metadata)
    select $1, 'return_mode_continued', $2::jsonb
    where not exists (
      select 1
      from analytics_events event
      join users u on u.id = $1
      where event.user_id = $1
        and event.event_name = 'return_mode_continued'
        and event.created_at >= u.return_mode_last_shown_at
    )
    `,
    [userId, analyticsMetadata(profile.inactivity_bucket)]
  );
  return { recorded: true };
}
