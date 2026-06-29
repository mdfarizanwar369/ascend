import { pool, query } from "../db/pool";

export type HealthSyncProvider = "health_connect";
export type HealthSyncRecordType = "steps_daily" | "active_calories_daily" | "exercise_session";

export type ImportedHealthSyncRecord = {
  type: HealthSyncRecordType;
  externalRecordId: string;
  recordedOn?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  valueNumeric?: number | null;
  unit?: string | null;
  sourceApp?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type HealthSyncImportInput = {
  provider: HealthSyncProvider;
  permissions: string[];
  timezone: string | null;
  syncedAt?: string | null;
  records: ImportedHealthSyncRecord[];
};

export type HealthSyncSummary = {
  connected: boolean;
  todaySteps: number;
  averageSteps7d: number;
  todayActiveCalories: number;
  workoutsThisWeek: number;
  workoutCompletedToday: boolean;
  lastSyncedAt: string | null;
};

export type HealthSyncStatus = {
  provider: HealthSyncProvider;
  connected: boolean;
  permissions: string[];
  timezone: string | null;
  lastSyncedAt: string | null;
  summary: HealthSyncSummary | null;
};

type HealthSyncConnectionRow = {
  provider: HealthSyncProvider;
  status: string;
  permissions: unknown;
  device_timezone: string | null;
  last_synced_at: string | null;
};

function parsePermissions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(String);
}

export async function ensureHealthSyncSchema() {
  await query(`
    create table if not exists health_sync_connections (
      user_id uuid primary key references users(id) on delete cascade,
      provider text not null default 'health_connect',
      status text not null default 'connected',
      permissions jsonb not null default '[]'::jsonb,
      device_timezone text,
      last_synced_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists health_sync_records (
      id uuid primary key default uuid_generate_v4(),
      user_id uuid not null references users(id) on delete cascade,
      provider text not null default 'health_connect',
      record_type text not null,
      external_record_id text not null,
      recorded_on date,
      start_at timestamptz,
      end_at timestamptz,
      value_numeric numeric(12,2),
      unit text,
      source_app text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (user_id, provider, record_type, external_record_id)
    );

    create index if not exists health_sync_connections_status_idx
      on health_sync_connections(status, last_synced_at desc);

    create index if not exists health_sync_records_user_type_date_idx
      on health_sync_records(user_id, record_type, recorded_on desc);

    create index if not exists health_sync_records_user_type_start_idx
      on health_sync_records(user_id, record_type, start_at desc);
  `);
}

export async function getHealthSyncConnection(userId: string) {
  const result = await query<HealthSyncConnectionRow>(
    `
    select provider, status, permissions, device_timezone, last_synced_at
    from health_sync_connections
    where user_id = $1
    `,
    [userId]
  );
  return result.rows[0] ?? null;
}

async function getLocalDateExpressions(userId: string) {
  const connection = await getHealthSyncConnection(userId);
  if (!connection || connection.status !== "connected") return null;
  const timezone = connection.device_timezone?.trim() || "UTC";
  const localTodayResult = await query<{ local_today: string }>(
    `select (now() at time zone $1)::date::text as local_today`,
    [timezone]
  );
  return {
    connection,
    timezone,
    localToday: localTodayResult.rows[0]?.local_today ?? new Date().toISOString().slice(0, 10)
  };
}

export async function getHealthSyncSummary(userId: string): Promise<HealthSyncSummary | null> {
  const localContext = await getLocalDateExpressions(userId);
  if (!localContext) return null;

  const { localToday, connection } = localContext;
  const summaryResult = await query<{
    today_steps: string | null;
    average_steps_7d: string | null;
    today_active_calories: string | null;
    workouts_this_week: string | null;
    workout_completed_today: boolean | null;
  }>(
    `
    with anchors as (
      select $2::date as local_today
    ),
    steps as (
      select coalesce(sum(value_numeric), 0) as today_steps
      from health_sync_records hsr, anchors a
      where hsr.user_id = $1
        and hsr.provider = 'health_connect'
        and hsr.record_type = 'steps_daily'
        and hsr.recorded_on = a.local_today
    ),
    steps_7d as (
      select avg(coalesce(value_numeric, 0)) as average_steps_7d
      from health_sync_records hsr, anchors a
      where hsr.user_id = $1
        and hsr.provider = 'health_connect'
        and hsr.record_type = 'steps_daily'
        and hsr.recorded_on between a.local_today - interval '6 days' and a.local_today
    ),
    calories as (
      select coalesce(sum(value_numeric), 0) as today_active_calories
      from health_sync_records hsr, anchors a
      where hsr.user_id = $1
        and hsr.provider = 'health_connect'
        and hsr.record_type = 'active_calories_daily'
        and hsr.recorded_on = a.local_today
    ),
    workouts as (
      select count(*) filter (where recorded_on between a.local_today - interval '6 days' and a.local_today) as workouts_this_week,
        bool_or(recorded_on = a.local_today) as workout_completed_today
      from health_sync_records hsr, anchors a
      where hsr.user_id = $1
        and hsr.provider = 'health_connect'
        and hsr.record_type = 'exercise_session'
    )
    select
      (select today_steps::text from steps) as today_steps,
      (select average_steps_7d::text from steps_7d) as average_steps_7d,
      (select today_active_calories::text from calories) as today_active_calories,
      (select workouts_this_week::text from workouts) as workouts_this_week,
      (select workout_completed_today from workouts) as workout_completed_today
    `,
    [userId, localToday]
  );

  const row = summaryResult.rows[0];
  return {
    connected: true,
    todaySteps: Math.round(Number(row?.today_steps ?? 0)),
    averageSteps7d: Math.round(Number(row?.average_steps_7d ?? 0)),
    todayActiveCalories: Math.round(Number(row?.today_active_calories ?? 0)),
    workoutsThisWeek: Number(row?.workouts_this_week ?? 0),
    workoutCompletedToday: row?.workout_completed_today === true,
    lastSyncedAt: connection.last_synced_at
  };
}

export async function getHealthSyncStatus(userId: string): Promise<HealthSyncStatus> {
  const connection = await getHealthSyncConnection(userId);
  if (!connection || connection.status !== "connected") {
    return {
      provider: "health_connect",
      connected: false,
      permissions: [],
      timezone: null,
      lastSyncedAt: connection?.last_synced_at ?? null,
      summary: null
    };
  }

  return {
    provider: connection.provider,
    connected: true,
    permissions: parsePermissions(connection.permissions),
    timezone: connection.device_timezone,
    lastSyncedAt: connection.last_synced_at,
    summary: await getHealthSyncSummary(userId)
  };
}

export async function importHealthSyncData(userId: string, input: HealthSyncImportInput) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
      insert into health_sync_connections (user_id, provider, status, permissions, device_timezone, last_synced_at, updated_at)
      values ($1, $2, 'connected', $3, $4, coalesce($5::timestamptz, now()), now())
      on conflict (user_id) do update set
        provider = excluded.provider,
        status = 'connected',
        permissions = excluded.permissions,
        device_timezone = excluded.device_timezone,
        last_synced_at = excluded.last_synced_at,
        updated_at = now()
      `,
      [userId, input.provider, JSON.stringify(input.permissions), input.timezone, input.syncedAt ?? new Date().toISOString()]
    );

    let imported = 0;
    for (const record of input.records) {
      const result = await client.query(
        `
        insert into health_sync_records (
          user_id, provider, record_type, external_record_id, recorded_on, start_at, end_at,
          value_numeric, unit, source_app, metadata, updated_at
        )
        values ($1,$2,$3,$4,$5::date,$6::timestamptz,$7::timestamptz,$8,$9,$10,$11,now())
        on conflict (user_id, provider, record_type, external_record_id) do update set
          recorded_on = excluded.recorded_on,
          start_at = excluded.start_at,
          end_at = excluded.end_at,
          value_numeric = excluded.value_numeric,
          unit = excluded.unit,
          source_app = excluded.source_app,
          metadata = excluded.metadata,
          updated_at = now()
        `,
        [
          userId,
          input.provider,
          record.type,
          record.externalRecordId,
          record.recordedOn ?? null,
          record.startAt ?? null,
          record.endAt ?? null,
          record.valueNumeric ?? null,
          record.unit ?? null,
          record.sourceApp ?? null,
          JSON.stringify(record.metadata ?? {})
        ]
      );
      imported += result.rowCount ?? 0;
    }

    await client.query("commit");
    return {
      importedCount: imported,
      summary: await getHealthSyncSummary(userId)
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function disconnectHealthSync(userId: string) {
  await query(
    `
    insert into health_sync_connections (user_id, provider, status, permissions, updated_at)
    values ($1, 'health_connect', 'disconnected', '[]'::jsonb, now())
    on conflict (user_id) do update set
      status = 'disconnected',
      updated_at = now()
    `,
    [userId]
  );
}
