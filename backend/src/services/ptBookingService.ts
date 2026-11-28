import {
  ptLocalDate, ptSessionWellbeingWindowMs, ptWeekStart, shiftPtDate,
  type PtAppointment, type PtBookingAction, type PtBookingRole, type PtBookingSlot, type PtBookingWeek,
  type PtCalendarBlock, type PtCalendarBlockInput,
  type PtBookingUpdate, type PtBookingUpdateKind, type PtRebookingClient, type PtSessionWellbeing, type PtTrainerOpenings
} from "@ascend/shared";
import { pool, query, withQueryClient } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { getAdminGymScope, scopeAllowsGym } from "./adminScopeService";

type Gym = NonNullable<PtBookingWeek["gym"]>;
type Coach = Gym & { trainerId: string; trainerName: string; clientName: string };
type Participant = "client" | "trainer";
export type PtClientNotice = { id: string; clientId: string; kind: PtBookingUpdateKind };

const gymFields = 'gym.id, gym.name, gym.timezone as "timeZone"';
const appointmentFields = `booking.id, booking.client_id as "clientId", member.full_name as "clientName",
  trainer_user.full_name as "trainerName", booking.starts_at as "startsAt", booking.ends_at as "endsAt", booking.version,
  case when booking.status = 'pending' and booking.starts_at <= now() then 'expired' else booking.status end as status`;

function bookingError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

async function inTransaction<T>(work: () => Promise<T>) {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    const result = await withQueryClient(connection, work);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    if ((error as { code?: string }).code === "23P01") {
      throw bookingError(409, "This time overlaps a confirmed booking. Pick another time.");
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function clientCoach(clientId: string, lock = false, trainerId?: string) {
  const result = await query<Coach>(`
    select ${gymFields}, trainer.id as "trainerId", trainer_user.full_name as "trainerName", member.full_name as "clientName"
    from users member
    join trainers trainer on trainer.id = member.assigned_trainer_id and trainer.gym_id = member.gym_id
    join users trainer_user on trainer_user.id = trainer.user_id
    join gyms gym on gym.id = trainer.gym_id
    where member.id = $1 and member.status = 'active' and member.primary_role = 'client'
      and trainer.status = 'active' and trainer_user.status = 'active'
      and ($2::uuid is null or trainer.id = $2)
    ${lock ? "for no key update of trainer for share of member, trainer_user" : ""}
  `, [clientId, trainerId ?? null]);
  return result.rows[0] ?? null;
}

async function trainerGym(user: AuthUser, lock = false) {
  const result = await query<Gym>(`
    select ${gymFields} from trainers trainer
    join gyms gym on gym.id = trainer.gym_id
    where trainer.id = $1 and trainer.user_id = $2 and trainer.status = 'active'
    ${lock ? "for no key update of trainer" : ""}
  `, [user.trainerId, user.id]);
  return result.rows[0] ?? null;
}

async function getSlots(coach: Coach, clientId: string, week: string, today: string,
  options: { at?: string; ignoreBookingId?: string; trainerBooking?: boolean } = {}) {
  const result = await query<PtBookingSlot>(`
    with days as (
      select $3::date + day_offset as day
      from generate_series(0, 6) day_offset
      where $3::date + day_offset between $4::date and ($4::date + 27)
    ), slots as (
      select tick at time zone $5 as starts_at, tick as local_start
      from days
      cross join lateral generate_series(days.day::timestamp,
        days.day + interval '23 hours', interval '1 hour') tick
    )
    select starts_at as "startsAt", starts_at + interval '1 hour' as "endsAt"
    from slots
    where starts_at > now() and ($6::timestamptz is null or starts_at = $6)
      and starts_at at time zone $5 = local_start
      and not exists (
        select 1 from pt_calendar_blocks block
        where block.trainer_id = $1 and block.gym_id = $9
          and pt_calendar_block_overlaps(block, slots.starts_at, slots.starts_at + interval '1 hour', $5)
      )
      and not exists (
        select 1 from pt_bookings booking
        where booking.trainer_id = $1 and booking.status = 'confirmed'
          and booking.id is distinct from $7::uuid
          and booking.starts_at > slots.starts_at - interval '1 hour'
          and booking.starts_at < slots.starts_at + interval '1 hour'
      )
      and not exists (
        select 1 from pt_bookings booking
        where booking.client_id = $2 and (booking.status = 'confirmed' or ($8 and booking.status = 'pending'))
          and booking.id is distinct from $7::uuid
          and booking.starts_at > slots.starts_at - interval '1 hour'
          and booking.starts_at < slots.starts_at + interval '1 hour'
      )
    order by starts_at
  `, [coach.trainerId, clientId, week, today, coach.timeZone, options.at ?? null, options.ignoreBookingId ?? null, !options.trainerBooking, coach.id]);
  return result.rows;
}

export async function listPtBookingUpdates(clientId: string) {
  const result = await query<PtBookingUpdate>(`
    select booking.client_update_id as id, booking.client_update_kind as kind, booking.starts_at as "startsAt",
      gym.timezone as "timeZone"
    from pt_bookings booking join gyms gym on gym.id = booking.gym_id
    where booking.client_id = $1 and booking.client_update_id is not null and booking.client_update_read_at is null
      and booking.status = 'confirmed' and booking.starts_at > now()
    order by booking.updated_at desc limit 5
  `, [clientId]);
  return result.rows;
}

export async function dismissPtBookingUpdate(clientId: string, updateId: string) {
  await query(`
    update pt_bookings set client_update_read_at = now()
    where client_id = $1 and client_update_id = $2 and client_update_read_at is null
  `, [clientId, updateId]);
}

async function getRebookingClients(gymId: string) {
  const result = await query<PtRebookingClient>(`
    with latest as (
      select client_id, max(completed_at) as completed_at
      from trainer_coaching_sessions
      where gym_id = $1 and status = 'completed' and completed_at between now() - interval '14 days' and now()
      group by client_id
    )
    select member.id as "clientId", member.full_name as "clientName", trainer_user.full_name as "trainerName",
      latest.completed_at as "lastSessionAt"
    from latest
    join users member on member.id = latest.client_id and member.primary_role = 'client'
      and member.status = 'active' and member.gym_id = $1
    join trainers trainer on trainer.id = member.assigned_trainer_id and trainer.gym_id = $1 and trainer.status = 'active'
    join users trainer_user on trainer_user.id = trainer.user_id and trainer_user.status = 'active'
    where not exists (
      select 1 from pt_bookings booking
      where booking.client_id = member.id and booking.trainer_id = trainer.id and booking.gym_id = $1
        and booking.starts_at > now() and booking.status in ('pending', 'confirmed')
    )
    order by latest.completed_at desc, member.id
  `, [gymId]);
  return result.rows;
}

export async function getPtBookingWeek(user: AuthUser, role: PtBookingRole, date?: string, gymId?: string, allowWellbeing = false): Promise<PtBookingWeek> {
  let gym: Gym | null;
  let coach: Coach | null = null;
  let gyms: PtBookingWeek["gyms"] = [];
  if (role === "manager") {
    const scope = await getAdminGymScope(user);
    if (gymId && !scopeAllowsGym(scope, gymId)) throw bookingError(403, "This gym is outside your booking access.");
    const result = await query<Gym>(`
      select ${gymFields} from gyms gym
      where ($1::uuid[] is null or gym.id = any($1)) order by gym.name, gym.id
    `, [scope.gymIds]);
    gym = (gymId ? result.rows.find((row) => row.id === gymId) : result.rows[0]) ?? null;
    gyms = result.rows.map(({ id, name }) => ({ id, name }));
  } else if (role === "trainer") {
    gym = await trainerGym(user);
  } else {
    coach = await clientCoach(user.id);
    gym = coach && { id: coach.id, name: coach.name, timeZone: coach.timeZone };
  }

  const today = ptLocalDate(new Date(), gym?.timeZone ?? "Asia/Kuala_Lumpur");
  const week = ptWeekStart(date ?? today);
  if (week < shiftPtDate(today, -35) || week > shiftPtDate(today, 28)) {
    throw bookingError(400, "Choose a week closer to today.");
  }
  const blocks = role === "trainer" && gym ? query<PtCalendarBlock>(`
    select id, to_char(starts_on, 'YYYY-MM-DD') as "startsOn", to_char(ends_on, 'YYYY-MM-DD') as "endsOn",
      left(starts_at::text, 5) as "startsAt", left(ends_at::text, 5) as "endsAt", repeat_pattern as repeat
    from pt_calendar_blocks
    where trainer_id = $1 and gym_id = $2 and (repeat_pattern != 'none' or ends_on >= $3::date)
    order by starts_on, starts_at nulls first, id
  `, [user.trainerId, gym.id, today]) : null;
  const slots = coach ? getSlots(coach, user.id, week, today) : null;
  const wellbeingEnabled = allowWellbeing && role !== "manager";
  const bookings = gym || role === "client" ? query<PtAppointment>(`
    select ${appointmentFields}${wellbeingEnabled ? `,
      case when checkin.booking_id is not null then
        json_build_object('feeling', checkin.feeling, 'preference', checkin.preference)
      end as wellbeing` : ""}
    from pt_bookings booking
    join users member on member.id = booking.client_id
    join trainers trainer on trainer.id = booking.trainer_id
    join users trainer_user on trainer_user.id = trainer.user_id
    ${wellbeingEnabled ? `left join pt_session_wellbeing checkin on checkin.booking_id = booking.id and checkin.booking_version = booking.version
      and checkin.expires_at > now() and booking.status = 'confirmed'
      and member.status = 'active' and member.primary_role = 'client' and member.assigned_trainer_id = trainer.id
      and member.gym_id = booking.gym_id and trainer.gym_id = booking.gym_id
      and trainer.status = 'active' and trainer_user.status = 'active'` : ""}
    where booking.starts_at >= ($1::date::timestamp at time zone $3)
      and booking.starts_at < ($2::date::timestamp at time zone $3)
      and ${role === "client" ? "booking.client_id = $4"
        : role === "trainer" ? "booking.trainer_id = $4 and member.assigned_trainer_id = $4 and member.status = 'active' and member.primary_role = 'client' and member.gym_id = booking.gym_id and trainer.gym_id = booking.gym_id"
        : "booking.gym_id = $4"}
    order by booking.starts_at, booking.id
  `, [week, shiftPtDate(week, 7), gym?.timeZone ?? "Asia/Kuala_Lumpur", role === "client" ? user.id : role === "trainer" ? user.trainerId : gym?.id]) : null;
  const [savedBlocks, availableSlots, schedule, updates, rebooking] = await Promise.all([
    blocks, slots, bookings,
    role === "client" ? listPtBookingUpdates(user.id) : undefined,
    role === "manager" && gym && week === ptWeekStart(today) ? getRebookingClients(gym.id) : undefined
  ]);
  return {
    enabled: true, gym, gyms, week, today, trainerId: coach?.trainerId, trainerName: coach?.trainerName,
    blocks: savedBlocks?.rows, slots: availableSlots ?? undefined, bookings: schedule?.rows ?? [],
    updates, needsRebooking: rebooking, ...(wellbeingEnabled ? { wellbeingEnabled: true } : {})
  };
}

export function savePtSessionWellbeing(user: AuthUser, id: string, version: number, wellbeing: PtSessionWellbeing | null) {
  return inTransaction(async () => {
    const coach = await clientCoach(user.id, true);
    if (!coach) throw bookingError(404, "This PT booking was not found.");
    const result = await query<{ version: number; status: string; starts_at: Date; ends_at: Date; current_time: Date }>(`
      select version, status, starts_at, ends_at, clock_timestamp() as current_time
      from pt_bookings where id = $1 and client_id = $2 and trainer_id = $3 and gym_id = $4 for update
    `, [id, user.id, coach.trainerId, coach.id]);
    const booking = result.rows[0];
    if (!booking) throw bookingError(404, "This PT booking was not found.");
    if (booking.version !== version) {
      throw bookingError(409, "This booking changed. Open the latest booking to share a check-in.");
    }
    if (!wellbeing) {
      await query("delete from pt_session_wellbeing where booking_id = $1", [id]);
      return;
    }
    const timeUntilStart = booking.starts_at.getTime() - booking.current_time.getTime();
    if (booking.status !== "confirmed" || timeUntilStart <= 0 || timeUntilStart > ptSessionWellbeingWindowMs) {
      throw bookingError(409, "You can share in the 24 hours before a confirmed session.");
    }
    await query(`
      insert into pt_session_wellbeing (booking_id, booking_version, feeling, preference, expires_at)
      values ($1, $2, $3, $4, $5)
      on conflict (booking_id) do update set booking_version = excluded.booking_version,
        feeling = excluded.feeling, preference = excluded.preference, expires_at = excluded.expires_at
    `, [id, version, wellbeing.feeling, wellbeing.preference, booking.ends_at]);
  });
}

export function addPtCalendarBlock(user: AuthUser, block: PtCalendarBlockInput) {
  return inTransaction(async () => {
    const gym = await trainerGym(user, true);
    if (!gym) throw bookingError(403, "An active trainer profile is required.");
    if (block.startsOn < ptLocalDate(new Date(), gym.timeZone)) {
      throw bookingError(400, "Choose today or a future date.");
    }
    const values = [user.trainerId, gym.id, block.startsOn, block.endsOn, block.startsAt, block.endsAt, block.repeat];
    const existing = await query<{ id: string }>(`
      select id from pt_calendar_blocks where trainer_id = $1 and gym_id = $2 and starts_on = $3 and ends_on = $4
        and starts_at is not distinct from $5::time and ends_at is not distinct from $6::time and repeat_pattern = $7
    `, values);
    if (existing.rows[0]) return existing.rows[0];
    const { rows: [saved] } = await query<{ id: string }>(`
      insert into pt_calendar_blocks (trainer_id, gym_id, starts_on, ends_on, starts_at, ends_at, repeat_pattern)
      values ($1, $2, $3, $4, $5, $6, $7) returning id
    `, values);
    const conflict = await query(`
      select 1 from pt_bookings booking join pt_calendar_blocks block on block.id = $1
      where booking.trainer_id = block.trainer_id and booking.gym_id = block.gym_id and booking.status = 'confirmed'
        and booking.ends_at > now() and pt_calendar_block_overlaps(block, booking.starts_at, booking.ends_at, $2)
      limit 1
    `, [saved.id, gym.timeZone]);
    if (conflict.rowCount) {
      throw bookingError(409, "A confirmed session overlaps this block. Move or cancel it first.");
    }
    await query(`
      update pt_bookings booking set status = 'declined', updated_at = now(), version = version + 1
      from pt_calendar_blocks block
      where block.id = $1 and booking.trainer_id = block.trainer_id and booking.gym_id = block.gym_id
        and booking.status = 'pending' and booking.starts_at > now()
        and pt_calendar_block_overlaps(block, booking.starts_at, booking.ends_at, $2)
    `, [saved.id, gym.timeZone]);
    return saved;
  });
}

export function removePtCalendarBlock(user: AuthUser, id: string) {
  return inTransaction(async () => {
    const gym = await trainerGym(user, true);
    if (!gym) throw bookingError(403, "An active trainer profile is required.");
    const removed = await query("delete from pt_calendar_blocks where id = $1 and trainer_id = $2 and gym_id = $3",
      [id, user.trainerId, gym.id]);
    if (!removed.rowCount) throw bookingError(404, "This calendar block was not found.");
  });
}

export function requestPtBooking(user: AuthUser, trainerId: string, startsAt: string) {
  return inTransaction(async () => {
    const coach = await clientCoach(user.id, true);
    if (!coach || coach.trainerId !== trainerId) throw bookingError(403, "You can only book with your assigned trainer.");

    const existing = await query<{ id: string }>(`
      select id from pt_bookings where trainer_id = $1 and client_id = $2 and starts_at = $3
      and status in ('pending', 'confirmed') and starts_at > now()
    `, [trainerId, user.id, startsAt]);
    if (existing.rows[0]) return existing.rows[0].id;

    const today = ptLocalDate(new Date(), coach.timeZone);
    const startDate = ptLocalDate(new Date(startsAt), coach.timeZone);
    if (startDate < today || startDate > shiftPtDate(today, 27)) throw bookingError(409, "This time is outside the booking window.");
    const [slot] = await getSlots(coach, user.id, ptWeekStart(startDate), today, { at: startsAt });
    if (!slot) throw bookingError(409, "This time is no longer available. Please pick another.");

    const result = await query<{ id: string }>(`
      insert into pt_bookings (gym_id, trainer_id, client_id, starts_at, ends_at) values ($1, $2, $3, $4, $5)
      on conflict (client_id, trainer_id, starts_at) where status in ('pending', 'confirmed')
      do update set starts_at = excluded.starts_at
      returning id
    `, [coach.id, trainerId, user.id, slot.startsAt, slot.endsAt]);
    return result.rows[0].id;
  });
}

async function coachForTrainer(user: AuthUser, clientId: string, lock = false) {
  const coach = user.trainerId && await clientCoach(clientId, lock, user.trainerId);
  if (!coach) throw bookingError(403, "You can only book sessions for your assigned clients.");
  return coach;
}

export async function getTrainerPtOpenings(user: AuthUser, clientId: string, date?: string, bookingId?: string): Promise<PtTrainerOpenings> {
  const coach = await coachForTrainer(user, clientId);
  const today = ptLocalDate(new Date(), coach.timeZone);
  const week = ptWeekStart(date ?? today);
  if (week < ptWeekStart(today) || week > ptWeekStart(shiftPtDate(today, 27))) {
    throw bookingError(400, "Choose a week within the booking window.");
  }
  if (bookingId) {
    const valid = await query(`
      select 1 from pt_bookings where id = $1 and client_id = $2 and trainer_id = $3 and gym_id = $4
        and status = 'confirmed' and starts_at > now()
    `, [bookingId, clientId, coach.trainerId, coach.id]);
    if (!valid.rowCount) throw bookingError(404, "This upcoming booking was not found.");
  }
  const [slots, next] = await Promise.all([
    getSlots(coach, clientId, week, today, { trainerBooking: true, ignoreBookingId: bookingId }),
    query<PtAppointment>(`
      select ${appointmentFields}
      from pt_bookings booking
      join users member on member.id = booking.client_id
      join trainers trainer on trainer.id = booking.trainer_id
      join users trainer_user on trainer_user.id = trainer.user_id
      where booking.client_id = $1 and booking.trainer_id = $2 and booking.gym_id = $3
        and booking.status = 'confirmed' and booking.starts_at > now()
      order by booking.starts_at limit 1
    `, [clientId, coach.trainerId, coach.id])
  ]);
  return { slots, nextBooking: next.rows[0] ?? null, today, week, clientName: coach.clientName, timeZone: coach.timeZone };
}

async function declineOverlappingRequests(trainerId: string, startsAt: string, endsAt: string, excludingId?: string) {
  await query(`
    update pt_bookings set status = 'declined', updated_at = now(), version = version + 1
    where trainer_id = $1 and status = 'pending' and id is distinct from $4::uuid
      and starts_at < $3 and ends_at > $2
  `, [trainerId, startsAt, endsAt, excludingId ?? null]);
}

async function confirmedUpdate(id: string, clientId: string, kind: PtBookingUpdateKind, slot?: PtBookingSlot) {
  const result = await query<{ updateId: string }>(`
    update pt_bookings set status = 'confirmed', updated_at = now(), version = version + 1,
      client_update_id = uuid_generate_v4(), client_update_kind = $2, client_update_read_at = null,
      starts_at = coalesce($3, starts_at), ends_at = coalesce($4, ends_at)
    where id = $1 returning client_update_id as "updateId"
  `, [id, kind, slot?.startsAt ?? null, slot?.endsAt ?? null]);
  return { id: result.rows[0].updateId, clientId, kind } satisfies PtClientNotice;
}

export function bookPtForClient(user: AuthUser, clientId: string, startsAt: string, move?: { id: string; version: number }) {
  return inTransaction(async (): Promise<{ id: string; notice?: PtClientNotice }> => {
    const coach = await coachForTrainer(user, clientId, true);
    const existing = await query<{ id: string; status: string; version: number; startsAt: string }>(`
      select id, status, version, starts_at as "startsAt" from pt_bookings
      where client_id = $1 and trainer_id = $2 and gym_id = $3 and starts_at > now()
      and (case when $4::uuid is null then starts_at = $5 and status in ('pending', 'confirmed') else id = $4 end)
      for update
    `, [clientId, coach.trainerId, coach.id, move?.id ?? null, startsAt]);
    const current = existing.rows[0];
    if (move && (!current || current.status !== "confirmed")) {
      throw bookingError(409, "This booking is no longer confirmed and upcoming.");
    }
    if (current?.status === "confirmed" && new Date(current.startsAt).getTime() === new Date(startsAt).getTime()) {
      return { id: current.id };
    }
    if (move && current?.version !== move.version) {
      throw bookingError(409, "This booking changed. Reopen it to move the latest booking.");
    }

    const today = ptLocalDate(new Date(), coach.timeZone);
    const date = ptLocalDate(new Date(startsAt), coach.timeZone);
    const [slot] = await getSlots(coach, clientId, ptWeekStart(date), today, {
      at: startsAt, ignoreBookingId: move?.id, trainerBooking: true
    });
    if (!slot) throw bookingError(409, "This time is no longer available. Please pick another.");
    await declineOverlappingRequests(coach.trainerId, slot.startsAt, slot.endsAt, current?.id);
    if (current) {
      const notice = await confirmedUpdate(current.id, clientId, move ? "moved" : "confirmed", slot);
      return { id: current.id, notice };
    }
    const created = await query<{ id: string; updateId: string }>(`
      insert into pt_bookings (gym_id, trainer_id, client_id, starts_at, ends_at, status, client_update_id, client_update_kind)
      values ($1, $2, $3, $4, $5, 'confirmed', uuid_generate_v4(), 'confirmed')
      returning id, client_update_id as "updateId"
    `, [coach.id, coach.trainerId, clientId, slot.startsAt, slot.endsAt]);
    const { id, updateId } = created.rows[0];
    return { id, notice: { id: updateId, clientId, kind: "confirmed" } };
  });
}

export function changePtBooking(user: AuthUser, role: Participant, bookingId: string, action: PtBookingAction, version?: number) {
  const target = ({ confirm: "confirmed", decline: "declined", cancel: "cancelled" } as const)[action];
  return inTransaction(async () => {
    const gym = role === "trainer" ? await trainerGym(user, true) : null;
    if (role === "trainer" && !gym) throw bookingError(403, "An active trainer profile is required.");
    if (role === "trainer") {
      const assigned = await query(`
        select 1 from pt_bookings booking join users member on member.id = booking.client_id
        where booking.id = $1 and booking.trainer_id = $2 and booking.gym_id = $3
          and member.assigned_trainer_id = $2 and member.gym_id = $3 and member.status = 'active' and member.primary_role = 'client'
        for share of member
      `, [bookingId, user.trainerId, gym?.id]);
      if (!assigned.rowCount) throw bookingError(404, "This booking was not found.");
    }
    const result = await query<{ status: string; future: boolean; clientId: string; startsAt: string; endsAt: string; version: number }>(`
      select status, starts_at > now() as future, client_id as "clientId", starts_at as "startsAt", ends_at as "endsAt", version
      from pt_bookings where id = $1
      and ${role === "client" ? "client_id" : "trainer_id"} = $2 for update
    `, [bookingId, role === "client" ? user.id : user.trainerId]);
    const booking = result.rows[0];
    if (!booking) throw bookingError(404, "This booking was not found.");
    if (booking.status === target) return;
    if ((version !== undefined && version !== booking.version) || !booking.future
      || (booking.status !== "pending" && !(action === "cancel" && booking.status === "confirmed"))) {
      throw bookingError(409, "This booking has changed or the time has passed. Refresh to see its current status.");
    }
    if (action === "confirm") {
      const notice = await confirmedUpdate(bookingId, booking.clientId, "confirmed");
      await declineOverlappingRequests(user.trainerId!, booking.startsAt, booking.endsAt);
      return notice;
    }
    await query("update pt_bookings set status = $2, updated_at = now(), version = version + 1 where id = $1", [bookingId, target]);
  });
}
