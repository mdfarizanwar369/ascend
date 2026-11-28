import {
  ptLocalDate, ptWeekStart, shiftPtDate,
  type PtAppointment, type PtAvailability, type PtBookingAction, type PtBookingRole, type PtBookingSlot, type PtBookingWeek
} from "@ascend/shared";
import { pool, query, withQueryClient } from "../db/pool";
import type { AuthUser } from "../middleware/auth";
import { getAdminGymScope, scopeAllowsGym } from "./adminScopeService";

type Gym = NonNullable<PtBookingWeek["gym"]>;
type Coach = Gym & { trainerId: string; trainerName: string };
type Participant = "client" | "trainer";

const gymFields = 'gym.id, gym.name, gym.timezone as "timeZone"';
const appointmentFields = `booking.id, booking.client_id as "clientId", member.full_name as "clientName",
  trainer_user.full_name as "trainerName", booking.starts_at as "startsAt", booking.ends_at as "endsAt",
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
    throw error;
  } finally {
    connection.release();
  }
}

async function clientCoach(clientId: string, lock = false) {
  const result = await query<Coach>(`
    select ${gymFields}, trainer.id as "trainerId", trainer_user.full_name as "trainerName"
    from users member
    join trainers trainer on trainer.id = member.assigned_trainer_id and trainer.gym_id = member.gym_id
    join users trainer_user on trainer_user.id = trainer.user_id
    join gyms gym on gym.id = trainer.gym_id
    where member.id = $1 and member.status = 'active' and member.primary_role = 'client'
      and trainer.status = 'active' and trainer_user.status = 'active'
    ${lock ? "for no key update of trainer for share of member, trainer_user" : ""}
  `, [clientId]);
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

async function getSlots(coach: Coach, clientId: string, week: string, today: string, at?: string) {
  const result = await query<PtBookingSlot>(`
    with days as (
      select $3::date + day_offset as day
      from generate_series(0, 6) day_offset
      where $3::date + day_offset between $4::date and ($4::date + 27)
    ), slots as (
      select tick at time zone $5 as starts_at, tick as local_start
      from days
      join pt_weekly_availability availability on availability.trainer_id = $1
        and availability.weekday = extract(isodow from days.day)
      cross join lateral generate_series(days.day + availability.opens_at,
        days.day + availability.closes_at - interval '1 hour', interval '1 hour') tick
    )
    select starts_at as "startsAt", starts_at + interval '1 hour' as "endsAt"
    from slots
    where starts_at > now() and ($6::timestamptz is null or starts_at = $6)
      and starts_at at time zone $5 = local_start
      and not exists (
        select 1 from pt_bookings booking
        where booking.trainer_id = $1 and booking.status = 'confirmed'
          and booking.starts_at > slots.starts_at - interval '1 hour'
          and booking.starts_at < slots.starts_at + interval '1 hour'
      )
      and not exists (
        select 1 from pt_bookings booking
        where booking.client_id = $2 and booking.status in ('pending', 'confirmed')
          and booking.starts_at > slots.starts_at - interval '1 hour'
          and booking.starts_at < slots.starts_at + interval '1 hour'
      )
    order by starts_at
  `, [coach.trainerId, clientId, week, today, coach.timeZone, at ?? null]);
  return result.rows;
}

export async function getPtBookingWeek(user: AuthUser, role: PtBookingRole, date?: string, gymId?: string): Promise<PtBookingWeek> {
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
  const availability = role === "trainer" && gym ? query<PtAvailability>(`
    select weekday, left(opens_at::text, 5) as "opensAt", left(closes_at::text, 5) as "closesAt"
    from pt_weekly_availability where trainer_id = $1 order by weekday
  `, [user.trainerId]) : null;
  const slots = coach ? getSlots(coach, user.id, week, today) : null;
  const bookings = gym || role === "client" ? query<PtAppointment>(`
    select ${appointmentFields}
    from pt_bookings booking
    join users member on member.id = booking.client_id
    join trainers trainer on trainer.id = booking.trainer_id
    join users trainer_user on trainer_user.id = trainer.user_id
    where booking.starts_at >= ($1::date::timestamp at time zone $3)
      and booking.starts_at < ($2::date::timestamp at time zone $3)
      and ${role === "client" ? "booking.client_id = $4"
        : role === "trainer" ? "booking.trainer_id = $4 and member.assigned_trainer_id = $4 and member.status = 'active' and member.primary_role = 'client' and member.gym_id = booking.gym_id and trainer.gym_id = booking.gym_id"
        : "booking.gym_id = $4"}
    order by booking.starts_at, booking.id
  `, [week, shiftPtDate(week, 7), gym?.timeZone ?? "Asia/Kuala_Lumpur", role === "client" ? user.id : role === "trainer" ? user.trainerId : gym?.id]) : null;
  const [savedAvailability, availableSlots, schedule] = await Promise.all([availability, slots, bookings]);
  return {
    enabled: true, gym, gyms, week, today, trainerId: coach?.trainerId, trainerName: coach?.trainerName,
    availability: savedAvailability?.rows, slots: availableSlots ?? undefined, bookings: schedule?.rows ?? []
  };
}

export function savePtAvailability(user: AuthUser, availability: PtAvailability[]) {
  return inTransaction(async () => {
    if (!await trainerGym(user, true)) throw bookingError(403, "An active trainer profile is required.");
    await query("delete from pt_weekly_availability where trainer_id = $1", [user.trainerId]);
    await query(`
      insert into pt_weekly_availability (trainer_id, weekday, opens_at, closes_at)
      select $1, day.weekday, day.opens_at, day.closes_at
      from unnest($2::smallint[], $3::time[], $4::time[]) as day(weekday, opens_at, closes_at)
    `, [user.trainerId, availability.map((item) => item.weekday), availability.map((item) => item.opensAt), availability.map((item) => item.closesAt)]);
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
    const [slot] = await getSlots(coach, user.id, ptWeekStart(startDate), today, startsAt);
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

export async function changePtBooking(user: AuthUser, role: Participant, bookingId: string, action: PtBookingAction) {
  const target = ({ confirm: "confirmed", decline: "declined", cancel: "cancelled" } as const)[action];
  try {
    return await inTransaction(async () => {
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
      const result = await query<{ status: string; future: boolean }>(`
        select status, starts_at > now() as future from pt_bookings where id = $1
        and ${role === "client" ? "client_id" : "trainer_id"} = $2 for update
      `, [bookingId, role === "client" ? user.id : user.trainerId]);
      const booking = result.rows[0];
      if (!booking) throw bookingError(404, "This booking was not found.");
      if (booking.status === target) return;
      if (!booking.future || (booking.status !== "pending" && !(action === "cancel" && booking.status === "confirmed"))) {
        throw bookingError(409, "This booking has changed or the time has passed. Refresh to see its current status.");
      }
      await query("update pt_bookings set status = $2, updated_at = now() where id = $1", [bookingId, target]);
      if (action === "confirm") {
        await query(`
          update pt_bookings other set status = 'declined', updated_at = now()
          from pt_bookings confirmed
          where confirmed.id = $1 and other.trainer_id = confirmed.trainer_id and other.status = 'pending'
            and other.starts_at < confirmed.ends_at and other.ends_at > confirmed.starts_at
        `, [bookingId]);
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23P01") {
      throw bookingError(409, "This time overlaps a confirmed booking.");
    }
    throw error;
  }
}
