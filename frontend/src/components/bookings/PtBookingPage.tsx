"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, CalendarCheck, CalendarClock, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell,
  SlidersHorizontal
} from "lucide-react";
import {
  ptLocalDate, ptWeekStart, shiftPtDate, type PtAppointment, type PtAvailability, type PtBookingAction,
  type PtBookingRole, type PtBookingSlot, type PtBookingWeek
} from "@ascend/shared";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { getPtBookingWeek, requestPtBooking, savePtAvailability, updatePtBooking } from "@/lib/ascendApi";
import { ptBookingEnabled } from "@/lib/ptBookingFlag";
import { trainerSessionCaptureEnabled } from "@/lib/trainerSessionFlag";

const panel = "rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5";
const outlineButton = "ascend-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold hover:border-calm/50 disabled:opacity-50";
const secondary = `${outlineButton} border-line bg-ink text-zinc-200`;
const selectedButton = `${outlineButton} border-calm/65 bg-calm/15 text-white`;
const primary = "ascend-pressable inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-lime px-4 text-sm font-bold text-ink disabled:opacity-45";
const dayFull = new Intl.DateTimeFormat("en-SG", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const dayShort = new Intl.DateTimeFormat("en-SG", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const monthDay = new Intl.DateTimeFormat("en-SG", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-SG", { weekday: "short", timeZone: "UTC" });
const dayDate = (day: string) => new Date(`${day}T00:00:00Z`);
const statusStyle: Record<PtAppointment["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "border-amber/25 bg-amber/10 text-amber" },
  confirmed: { label: "Confirmed", className: "border-lime/25 bg-lime/10 text-lime" },
  declined: { label: "Declined", className: "border-line bg-ink text-zinc-300" },
  cancelled: { label: "Cancelled", className: "border-line bg-ink text-zinc-300" },
  expired: { label: "Expired", className: "border-line bg-ink text-zinc-400" }
};
const roleCopy = {
  client: { title: "Book a PT session", eyebrow: "Personal training", shell: "client", roles: ["client"] },
  trainer: { title: "Your PT schedule", eyebrow: "Trainer workspace", shell: "trainer", roles: ["trainer"] },
  manager: { title: "Gym PT schedule", eyebrow: "Gym operations", shell: "admin", roles: ["admin", "owner"] }
} as const;

export function PtBookingPage({ role }: { role: PtBookingRole }) {
  const copy = roleCopy[role];
  return (
    <AppShell active={copy.shell} showQuickCapture={false}>
      <RoleGate allowedRoles={[...copy.roles]} fallbackTitle="Schedule access required" fallbackMessage="Open the schedule from the Ascend account for your role.">
        {ptBookingEnabled ? <BookingCalendar role={role} /> : <p className={`${panel} mt-4 text-sm text-zinc-400`}>PT booking is currently unavailable.</p>}
      </RoleGate>
    </AppShell>
  );
}

function BookingCalendar({ role }: { role: PtBookingRole }) {
  const [schedule, setSchedule] = useState<PtBookingWeek>();
  const [week, setWeek] = useState<string>();
  const [gymId, setGymId] = useState<string>();
  const [selectedDay, setSelectedDay] = useState<string>();
  const [selectedTime, setSelectedTime] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [editAvailability, setEditAvailability] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    getPtBookingWeek(role, week, gymId).then((next) => {
      if (!current) return;
      setSchedule(next);
    }).catch((error: unknown) => {
      if (current) setLoadError(error instanceof Error ? error.message : "Could not load the schedule.");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [role, week, gymId, refresh]);

  async function change(work: () => Promise<unknown>, success: string, onSuccess?: () => void) {
    setBusy(true);
    setNotice("");
    setActionError("");
    try {
      await work();
      onSuccess?.();
      setNotice(success);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "This could not be saved. Try again.");
    } finally {
      setLoading(true);
      setRefresh((value) => value + 1);
      setBusy(false);
    }
  }

  const copy = roleCopy[role];
  const timeZone = schedule?.gym?.timeZone ?? "Asia/Kuala_Lumpur";
  const timeZoneLabel = new Intl.DateTimeFormat("en-SG", { timeZone, timeZoneName: "short" })
    .formatToParts().find((part) => part.type === "timeZoneName")?.value;
  const dateFor = (value: string) => ptLocalDate(new Date(value), timeZone);
  const timeFormatter = new Intl.DateTimeFormat("en-SG", {
    timeZone, hour: "numeric", minute: "2-digit", hour12: true
  });
  const timeFor = (value: string) => timeFormatter.format(new Date(value)).toUpperCase();
  const days = schedule ? Array.from({ length: 7 }, (_, index) => shiftPtDate(schedule.week, index)) : [];
  const slots = schedule?.slots ?? [];
  const bookings = schedule?.bookings ?? [];
  const pending = bookings.filter((booking) => booking.status === "pending");
  const confirmed = bookings.filter((booking) => booking.status === "confirmed");
  const datesWithEntries = new Set((role === "client" ? slots : [...pending, ...confirmed]).map((item) => dateFor(item.startsAt)));
  const firstSlotDay = slots[0] && dateFor(slots[0].startsAt);
  const day = selectedDay ?? (role === "client" ? firstSlotDay ?? (days.includes(schedule?.today ?? "") ? schedule?.today : days[0]) : undefined);
  const visibleSlots = slots.filter((slot) => day === dateFor(slot.startsAt));
  const selectedSlot = visibleSlots.find((slot) => slot.startsAt === selectedTime);
  const visiblePending = pending.filter((booking) => !day || dateFor(booking.startsAt) === day);
  const visibleConfirmed = confirmed.filter((booking) => !day || dateFor(booking.startsAt) === day);
  const disabled = loading || busy || Boolean(loadError);
  const activeWeek = schedule && ptWeekStart(schedule.today);
  const thisWeek = !day && schedule?.week === activeWeek;

  function selectDay(nextDay?: string) {
    setSelectedDay(nextDay);
    setSelectedTime(undefined);
  }

  function selectWeek(nextWeek: string) {
    setLoading(true);
    setWeek(nextWeek);
    selectDay();
  }

  function update(booking: PtAppointment, action: PtBookingAction) {
    if (role === "manager") return;
    if (action === "cancel" && !window.confirm("Cancel this PT booking?")) return;
    const message = { confirm: "Booking confirmed.", decline: "Request declined.", cancel: "Booking cancelled." };
    void change(() => updatePtBooking(role, booking.id, action), message[action]);
  }

  function renderBooking(booking: PtAppointment) {
    const date = dateFor(booking.startsAt);
    const future = Date.parse(booking.startsAt) > Date.now();
    const canCancel = role !== "manager" && future && (booking.status === "confirmed" || booking.status === "pending");
    const canConfirm = role === "trainer" && future && booking.status === "pending";
    const canOpenWorksheet = role === "trainer" && trainerSessionCaptureEnabled() && booking.status === "confirmed" && date === schedule?.today;
    const state = statusStyle[booking.status];
    return (
      <li key={booking.id} className="rounded-2xl border border-line bg-ink/55 p-3.5">
        <div className="flex items-start gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${booking.status === "pending" ? "bg-amber/10 text-amber" : "bg-lime/10 text-lime"}`}>
            {booking.status === "pending" ? <CalendarClock size={18} aria-hidden="true" /> : <CalendarCheck size={18} aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{role === "client" ? booking.trainerName : booking.clientName}</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">{dayShort.format(dayDate(date))} · {timeFor(booking.startsAt)}</p>
            {role === "manager" && <p className="text-xs leading-5 text-zinc-400">PT {booking.trainerName}</p>}
          </div>
          <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${state.className}`}>{state.label}</span>
        </div>
        {canConfirm && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={primary} disabled={disabled} onClick={() => update(booking, "confirm")}><Check size={16} /> Confirm</button>
          <button type="button" className={secondary} disabled={disabled} onClick={() => update(booking, "decline")}>Decline</button>
        </div>}
        {!canConfirm && (canCancel || canOpenWorksheet) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4">
              {canOpenWorksheet &&
                <Link prefetch={false} href={`/trainer/clients/${booking.clientId}/session`} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-lime">
                  Open worksheet <ArrowRight size={14} aria-hidden="true" />
                </Link>}
              {canCancel && <button type="button" className="min-h-11 text-xs font-semibold text-zinc-300 underline-offset-4 hover:underline disabled:opacity-50" disabled={disabled} onClick={() => update(booking, "cancel")}>
                {booking.status === "pending" ? "Withdraw request" : "Cancel booking"}
              </button>}
            </div>
        )}
      </li>
    );
  }

  const requestSlot = (slot: PtBookingSlot) => {
    if (!schedule?.trainerId) return;
    const trainerId = schedule.trainerId;
    void change(() => requestPtBooking(trainerId, slot.startsAt), "Request sent. Your trainer will confirm the time.", () => setSelectedTime(undefined));
  };

  return (
    <div className="mx-auto mt-4 grid w-full min-w-0 max-w-5xl gap-4">
      <header className="relative isolate overflow-hidden rounded-[1.65rem] border border-calm/20 bg-surface px-5 py-5 sm:px-7 sm:py-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(53,242,208,0.17),transparent_53%),radial-gradient(ellipse_at_bottom_left,rgba(139,92,246,0.14),transparent_62%)]" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-calm">{copy.eyebrow}</p>
            <h1 className="mt-2 text-[1.8rem] font-semibold leading-tight tracking-tight sm:text-[2.2rem]">{copy.title}</h1>
            {schedule?.gym && <p className="mt-1.5 text-sm text-zinc-300">{role === "client" ? `With ${schedule.trainerName} · ` : ""}{schedule.gym.name}</p>}
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-calm/25 bg-calm/10 text-calm"><CalendarDays size={24} aria-hidden="true" /></span>
        </div>
        {role === "trainer" && schedule?.gym && (
          <button type="button" onClick={() => setEditAvailability((value) => !value)} className={`${secondary} mt-4`} aria-expanded={editAvailability}>
            <SlidersHorizontal size={16} aria-hidden="true" /> {editAvailability ? "Close availability" : "Edit availability"}
          </button>
        )}
        {role === "manager" && Boolean(schedule?.gyms.length && schedule.gyms.length > 1) && (
          <label className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-300">Gym
            <select value={schedule?.gym?.id} onChange={(event) => {
              setWeek(undefined);
              setGymId(event.target.value);
              setLoading(true);
              selectDay();
            }} className={`${secondary} max-w-full`} disabled={disabled}>
              {schedule?.gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
            </select>
          </label>
        )}
      </header>
      {notice && <p role="status" className="rounded-xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm text-lime">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-amber/25 bg-amber/10 px-4 py-3 text-sm text-amber">{actionError}</p>}
      {loadError && <div role="alert" className={panel}><p className="text-sm text-zinc-300">{loadError}</p><button type="button" className={`${secondary} mt-3`} onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {!schedule && !loadError && <p role="status" className={`${panel} text-sm text-zinc-400`}>Loading PT schedule…</p>}
      {schedule && !schedule.gym && <p className={`${panel} text-sm text-zinc-300`}>{role === "client" ? "You need an assigned PT to request a session." : "There’s no active gym schedule for this account."}</p>}
      {schedule?.gym && editAvailability && role === "trainer" && <AvailabilityEditor initial={schedule.availability ?? []} disabled={disabled}
        onSave={(availability) => change(() => savePtAvailability(availability), "Availability saved.", () => setEditAvailability(false))} />}
      {schedule && (schedule.gym || (role === "client" && bookings.length > 0)) && (
        <>
          <section className={panel} aria-label="Calendar week" aria-busy={loading}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-base font-semibold sm:text-lg">{monthDay.format(dayDate(schedule.week))} – {monthDay.format(dayDate(days[6]))}</h2>
                <p className="mt-0.5 text-xs text-zinc-400">{timeZoneLabel ? `${timeZoneLabel} · ` : ""}Gym local time</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Previous week" className={`${secondary} w-11 px-0`}
                  disabled={disabled || schedule.week <= shiftPtDate(activeWeek ?? schedule.week, role === "client" ? 0 : -28)}
                  onClick={() => selectWeek(shiftPtDate(schedule.week, -7))}><ChevronLeft size={18} /></button>
                <button type="button" aria-label="Next week" className={`${secondary} w-11 px-0`}
                  disabled={disabled || schedule.week >= ptWeekStart(shiftPtDate(schedule.today, 27))}
                  onClick={() => selectWeek(shiftPtDate(schedule.week, 7))}><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
              {days.map((date) => {
                return (
                  <button type="button" key={date} aria-label={`${dayFull.format(dayDate(date))}${date === schedule.today ? ", today" : ""}`}
                    aria-pressed={day === date} disabled={disabled} onClick={() => selectDay(date)}
                    className={`ascend-pressable relative flex min-h-[57px] min-w-0 flex-col items-center justify-center rounded-xl border pb-1 text-xs ${day === date ? "border-calm/55 bg-calm/10 text-calm" : "border-line bg-ink/55 text-zinc-300"}`}>
                    <span className="text-[10px]">{weekdayFormat.format(dayDate(date))}</span>
                    <strong className="text-sm tabular-nums">{Number(date.slice(-2))}</strong>
                    <span aria-hidden="true" className={`absolute bottom-1.5 h-1 w-1 rounded-full ${datesWithEntries.has(date) ? "bg-calm" : "bg-transparent"}`} />
                  </button>
                );
              })}
            </div>
            {role !== "client" && <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" aria-pressed={day === schedule.today} disabled={disabled} className={day === schedule.today ? selectedButton : secondary} onClick={() => {
                if (schedule.week !== activeWeek && activeWeek) selectWeek(activeWeek);
                selectDay(schedule.today);
              }}>Today</button>
              <button type="button" aria-pressed={thisWeek} disabled={disabled} className={thisWeek ? selectedButton : secondary} onClick={() => {
                if (schedule.week !== activeWeek && activeWeek) selectWeek(activeWeek);
                else selectDay();
              }}>This week</button>
            </div>}
          </section>
          {role === "client" ? (
            <>
              {schedule.gym && <section className={panel} aria-labelledby="booking-slots-title">
                <div className="flex items-center gap-2"><Clock3 size={18} className="text-calm" aria-hidden="true" /><h2 id="booking-slots-title" className="text-lg font-semibold">Available times</h2></div>
                {day && <p className="mt-1 text-xs text-zinc-400">{dayFull.format(dayDate(day))} · 60 min</p>}
                {visibleSlots.length ? <div className="mt-3 grid grid-cols-2 gap-2 min-[370px]:grid-cols-3 sm:grid-cols-4">
                  {visibleSlots.map((slot) => <button key={slot.startsAt} type="button" aria-pressed={slot.startsAt === selectedTime}
                    className={slot.startsAt === selectedTime ? selectedButton : secondary} disabled={disabled}
                    onClick={() => setSelectedTime(slot.startsAt)}>{timeFor(slot.startsAt)}</button>)}
                </div> : <p className="mt-3 text-sm text-zinc-400">No slots for this day. Try another date.</p>}
                {visibleSlots.length > 0 && <button type="button" className={`${primary} mt-4 w-full`} disabled={disabled || !selectedSlot}
                  onClick={() => { if (selectedSlot) requestSlot(selectedSlot); }}>Request session <ArrowRight size={16} aria-hidden="true" /></button>}
              </section>}
              <section className={panel} aria-labelledby="my-bookings-title">
                <h2 id="my-bookings-title" className="text-lg font-semibold">My bookings</h2>
                {bookings.length ? <ul className="mt-3 grid gap-2">{bookings.map(renderBooking)}</ul> : <p className="mt-1 text-sm text-zinc-400">No PT bookings this week.</p>}
              </section>
            </>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
              <section className={panel} aria-labelledby="booking-requests-title">
                <div className="flex items-center gap-2"><CalendarClock size={19} className="text-amber" aria-hidden="true" /><h2 id="booking-requests-title" className="text-lg font-semibold">Needs confirmation</h2>
                  <span className="ml-auto rounded-full border border-amber/25 bg-amber/10 px-2.5 py-1 text-xs font-bold text-amber">{visiblePending.length}</span>
                </div>
                {visiblePending.length ? <ul className="mt-3 grid gap-2">{visiblePending.map(renderBooking)}</ul>
                  : <p className="mt-2 text-sm text-zinc-400">No pending requests {day ? "on this day" : "this week"}.</p>}
              </section>
              <section className={panel} aria-labelledby="confirmed-bookings-title">
                <div className="flex items-center gap-2"><Dumbbell size={19} className="text-lime" aria-hidden="true" /><h2 id="confirmed-bookings-title" className="text-lg font-semibold">Confirmed sessions</h2></div>
                {day && <p className="mt-1 text-xs text-zinc-400">{dayFull.format(dayDate(day))}</p>}
                {visibleConfirmed.length ? <ul className="mt-3 grid gap-2">{visibleConfirmed.map(renderBooking)}</ul>
                  : <p className="mt-2 text-sm text-zinc-400">No confirmed sessions {day ? "on this day" : "this week"}.</p>}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AvailabilityEditor({ initial, disabled, onSave }: {
  initial: PtAvailability[];
  disabled: boolean;
  onSave: (availability: PtAvailability[]) => Promise<void>;
}) {
  const [windows, setWindows] = useState(initial);
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <form className={panel} onSubmit={(event) => { event.preventDefault(); void onSave(windows); }}>
      <h2 className="text-lg font-semibold">Weekly availability</h2>
      <p className="mt-1 text-sm text-zinc-400">Choose your bookable hours. Clients can request 60-minute sessions in gym local time.</p>
      <div className="mt-3 divide-y divide-white/10">
        {labels.map((label, index) => {
          const weekday = index + 1;
          const entry = windows.find((item) => item.weekday === weekday);
          return (
            <div key={label} className="grid gap-1 py-2 sm:grid-cols-[8rem_1fr] sm:items-center">
              <label className="flex min-h-9 items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={Boolean(entry)} disabled={disabled} className="size-4 accent-lime"
                  onChange={(event) => setWindows(event.target.checked
                    ? [...windows, { weekday, opensAt: "09:00", closesAt: "17:00" }]
                    : windows.filter((item) => item.weekday !== weekday))} /> {label}
              </label>
              {entry && <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pl-6 sm:pl-0">
                <input type="time" aria-label={`${label} start`} required className={`${secondary} w-full min-w-0`} disabled={disabled} value={entry.opensAt}
                  onChange={(event) => setWindows(windows.map((item) => item.weekday === weekday ? { ...item, opensAt: event.target.value } : item))} />
                <span className="text-xs text-zinc-400">to</span>
                <input type="time" aria-label={`${label} end`} required className={`${secondary} w-full min-w-0`} disabled={disabled} value={entry.closesAt}
                  onChange={(event) => setWindows(windows.map((item) => item.weekday === weekday ? { ...item, closesAt: event.target.value } : item))} />
              </div>}
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={disabled} className={`${primary} mt-3`}>Save availability</button>
    </form>
  );
}
