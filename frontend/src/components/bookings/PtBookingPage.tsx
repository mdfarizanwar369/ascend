"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, CalendarCheck, CalendarClock, CalendarDays, CalendarMinus, Check, ChevronLeft, ChevronRight, Clock3, Dumbbell
} from "lucide-react";
import {
  ptLocalDate, ptWeekStart, shiftPtDate, type PtAppointment, type PtBookingAction,
  type PtBookingRole, type PtBookingSlot, type PtBookingUpdate, type PtBookingWeek, type PtCalendarBlock,
  type PtCalendarBlockInput, type PtTrainerOpenings
} from "@ascend/shared";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import {
  addPtCalendarBlock, bookPtForClient, dismissPtBookingUpdate, getPtBookingWeek, getTrainerPtOpenings,
  removePtCalendarBlock, requestPtBooking, updatePtBooking
} from "@/lib/ascendApi";
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
const blockClock = new Intl.DateTimeFormat("en-SG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" });
type BookingEditor = { clientId: string; move?: PtAppointment };
type NotificationTarget = { day: string; booking: string };
type BookingCalendarProps = { role: PtBookingRole; bookingClientId?: string; notificationTarget?: NotificationTarget };

function blockFallsOn(block: PtCalendarBlock, date: string) {
  if (date < block.startsOn) return false;
  if (block.repeat === "none") return date <= block.endsOn;
  return block.repeat === "daily" || dayDate(date).getUTCDay() === dayDate(block.startsOn).getUTCDay();
}

function formatAppointmentTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
  }).format(new Date(value));
}
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

export function PtBookingPage({ role, bookingClientId, notificationTarget }: BookingCalendarProps) {
  const copy = roleCopy[role];
  return (
    <AppShell active={copy.shell} showQuickCapture={false}>
      <RoleGate allowedRoles={[...copy.roles]} fallbackTitle="Schedule access required" fallbackMessage="Open the schedule from the Ascend account for your role.">
        {ptBookingEnabled ? <BookingCalendar key={bookingClientId ?? notificationTarget?.booking ?? role}
          role={role} bookingClientId={bookingClientId} notificationTarget={notificationTarget} />
          : <p className={`${panel} mt-4 text-sm text-zinc-400`}>PT booking is currently unavailable.</p>}
      </RoleGate>
    </AppShell>
  );
}

function BookingCalendar({ role, bookingClientId, notificationTarget }: BookingCalendarProps) {
  const [schedule, setSchedule] = useState<PtBookingWeek>();
  const [week, setWeek] = useState<string | undefined>(notificationTarget?.day);
  const [gymId, setGymId] = useState<string>();
  const [selectedDay, setSelectedDay] = useState<string>();
  const [selectedTime, setSelectedTime] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [editBlocks, setEditBlocks] = useState(false);
  const [editor, setEditor] = useState<BookingEditor | undefined>(bookingClientId ? { clientId: bookingClientId } : undefined);
  const [focusBookings, setFocusBookings] = useState(false);
  const focusTarget = useRef(notificationTarget?.booking);
  const [rebookingLimit, setRebookingLimit] = useState(12);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setLoadError("");
    getPtBookingWeek(role, week, gymId).then((next) => {
      if (!current) return;
      setSchedule(next);
    }).catch((error: unknown) => {
      if (!current) return;
      if (focusTarget.current && week === notificationTarget?.day) {
        focusTarget.current = undefined;
        setWeek(undefined);
      } else {
        setLoadError(error instanceof Error ? error.message : "Could not load the schedule.");
      }
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [role, week, gymId, refresh, notificationTarget?.day]);

  useEffect(() => {
    if (!focusBookings || loading) return;
    document.getElementById("my-bookings-title")?.focus();
    setFocusBookings(false);
  }, [focusBookings, loading]);

  useEffect(() => {
    if (!focusTarget.current || loading || !schedule) return;
    document.getElementById(`pt-booking-${focusTarget.current}`)?.focus();
    focusTarget.current = undefined;
  }, [loading, schedule]);

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
  const blocks = schedule?.blocks;
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

  function closeEditor() {
    setEditor(undefined);
    setRefresh((value) => value + 1);
    if (bookingClientId) window.history.replaceState(null, "", "/trainer/schedule");
  }

  function viewUpdate(update: PtBookingUpdate) {
    void change(() => dismissPtBookingUpdate(update.id), "", () => {
      selectWeek(ptWeekStart(dateFor(update.startsAt)));
      setFocusBookings(true);
    });
  }

  function update(booking: PtAppointment, action: PtBookingAction) {
    if (role === "manager") return;
    if (action === "cancel" && !window.confirm("Cancel this PT booking?")) return;
    const message = { confirm: "Booking confirmed.", decline: "Request declined.", cancel: "Booking cancelled." };
    void change(() => updatePtBooking(role, booking.id, action, booking.version), message[action]);
  }

  function renderBooking(booking: PtAppointment) {
    const date = dateFor(booking.startsAt);
    const future = Date.parse(booking.startsAt) > Date.now();
    const canCancel = role !== "manager" && future && (booking.status === "confirmed" || booking.status === "pending");
    const canConfirm = role === "trainer" && future && booking.status === "pending";
    const canOpenWorksheet = role === "trainer" && trainerSessionCaptureEnabled() && booking.status === "confirmed" && date === schedule?.today;
    const canMove = role === "trainer" && future && booking.status === "confirmed";
    const state = statusStyle[booking.status];
    return (
      <li key={booking.id} id={`pt-booking-${booking.id}`} tabIndex={-1}
        className="scroll-mt-24 rounded-2xl border border-line bg-ink/55 p-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-calm">
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
        {!canConfirm && (canCancel || canOpenWorksheet || canMove) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-4">
              {canOpenWorksheet &&
                <Link prefetch={false} href={`/trainer/clients/${booking.clientId}/session`} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-lime">
                  Open worksheet <ArrowRight size={14} aria-hidden="true" />
                </Link>}
              {canMove && <button type="button" className="min-h-11 text-xs font-semibold text-calm hover:underline" disabled={disabled}
                onClick={() => { setEditBlocks(false); setEditor({ clientId: booking.clientId, move: booking }); }}>Move booking</button>}
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
        {role === "trainer" && blocks && !editor && (
          <button type="button" onClick={() => setEditBlocks((value) => !value)} className={`${secondary} mt-4`} aria-expanded={editBlocks}>
            <CalendarMinus size={16} aria-hidden="true" /> {editBlocks ? "Close calendar blocks" : "Block time"}
          </button>
        )}
        {role === "manager" && Boolean(schedule?.gyms.length && schedule.gyms.length > 1) && (
          <label className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-300">Gym
            <select value={schedule?.gym?.id} onChange={(event) => {
              setWeek(undefined);
              setGymId(event.target.value);
              setRebookingLimit(12);
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
      {editor && <TrainerBookingEditor key={editor.move?.id ?? editor.clientId} editor={editor} onClose={closeEditor}
        onMove={(move) => setEditor({ clientId: move.clientId, move })}
        onSaved={(startsAt, zone) => {
          const nextWeek = ptWeekStart(ptLocalDate(new Date(startsAt), zone));
          closeEditor();
          selectWeek(nextWeek);
          setNotice(editor.move ? "Booking moved. Your client has an update in Ascend." : "Session booked. Your client has an update in Ascend.");
        }} />}
      {loadError && <div role="alert" className={panel}><p className="text-sm text-zinc-300">{loadError}</p><button type="button" className={`${secondary} mt-3`} onClick={() => setRefresh((value) => value + 1)}>Try again</button></div>}
      {!schedule && !loadError && <p role="status" className={`${panel} text-sm text-zinc-400`}>Loading PT schedule…</p>}
      {schedule && !schedule.gym && <p className={`${panel} text-sm text-zinc-300`}>{role === "client" ? "You need an assigned PT to request a session." : "There’s no active gym schedule for this account."}</p>}
      {schedule && blocks && editBlocks && role === "trainer" && <CalendarBlocksEditor
        startDate={day && day >= schedule.today ? day : schedule.today} today={schedule.today} blocks={blocks} disabled={disabled}
        onSave={(block) => change(() => addPtCalendarBlock(block), "Time blocked.")}
        onRemove={(id) => change(() => removePtCalendarBlock(id), "Block removed.")} />}
      {role === "client" && Boolean(schedule?.updates?.length) && <section className={panel} aria-labelledby="pt-updates-title">
        <h2 id="pt-updates-title" className="text-lg font-semibold">Booking updates</h2>
        <ul className="mt-3 grid gap-2">
          {schedule?.updates?.map((update) => <li key={update.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-lime/25 bg-lime/5 px-3 py-2">
            <div><p className="text-sm font-semibold text-lime">{update.kind === "moved" ? "Your PT booking moved" : "Your PT booking is confirmed"}</p>
              <p className="mt-1 text-xs text-zinc-300">{formatAppointmentTime(update.startsAt, update.timeZone)}</p></div>
            <button type="button" className={secondary} disabled={disabled} onClick={() => viewUpdate(update)}>View booking</button>
          </li>)}
        </ul>
      </section>}
      {!editor && schedule && (schedule.gym || (role === "client" && bookings.length > 0)) && (
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
                const hasBlock = blocks?.some((block) => blockFallsOn(block, date));
                return (
                  <button type="button" key={date} aria-label={`${dayFull.format(dayDate(date))}${date === schedule.today ? ", today" : ""}${hasBlock ? ", blocked time" : ""}`}
                    aria-pressed={day === date} disabled={disabled} onClick={() => selectDay(date)}
                    className={`ascend-pressable relative flex min-h-[57px] min-w-0 flex-col items-center justify-center rounded-xl border pb-1 text-xs ${day === date ? "border-calm/55 bg-calm/10 text-calm" : "border-line bg-ink/55 text-zinc-300"}`}>
                    <span className="text-[10px]">{weekdayFormat.format(dayDate(date))}</span>
                    <strong className="text-sm tabular-nums">{Number(date.slice(-2))}</strong>
                    <span aria-hidden="true" className="absolute bottom-1.5 flex gap-1">
                      {datesWithEntries.has(date) && <span className="size-1 rounded-full bg-calm" />}
                      {hasBlock && <span className="size-1 rounded-full bg-amber" />}
                    </span>
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
                <h2 id="my-bookings-title" tabIndex={-1} className="scroll-mt-24 text-lg font-semibold">My bookings</h2>
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
          {role === "manager" && schedule.needsRebooking && <section className={panel} aria-labelledby="rebooking-title">
            <div className="flex items-center gap-2"><CalendarClock size={19} className="text-calm" aria-hidden="true" />
              <h2 id="rebooking-title" className="text-lg font-semibold">Needs rebooking</h2></div>
            <p className="mt-1 text-sm text-zinc-400">Clients coached in the last 14 days with no upcoming booking or request.</p>
            {schedule.needsRebooking.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {schedule.needsRebooking.slice(0, rebookingLimit).map((client) => <li key={client.clientId} className="rounded-xl border border-line bg-ink/55 p-3">
                <p className="font-semibold">{client.clientName}</p>
                <p className="mt-1 text-xs text-zinc-300">PT {client.trainerName} · Last coached {dayShort.format(dayDate(dateFor(client.lastSessionAt)))}</p>
              </li>)}
            </ul> : <p className="mt-3 text-sm text-zinc-300">No clients need rebooking.</p>}
            {schedule.needsRebooking.length > rebookingLimit && <button type="button" className={`${secondary} mt-3`}
              onClick={() => setRebookingLimit((limit) => limit + 12)}>Show more clients</button>}
          </section>}
        </>
      )}
    </div>
  );
}

function TrainerBookingEditor({ editor, onClose, onMove, onSaved }: {
  editor: BookingEditor;
  onClose: () => void;
  onMove: (booking: PtAppointment) => void;
  onSaved: (startsAt: string, timeZone: string) => void;
}) {
  const [openings, setOpenings] = useState<PtTrainerOpenings>();
  const [week, setWeek] = useState<string>();
  const [day, setDay] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    getTrainerPtOpenings(editor.clientId, week, editor.move?.id).then((result) => {
      if (current) setOpenings(result);
    }).catch((error: unknown) => {
      if (current) {
        setOpenings(undefined);
        setError(error instanceof Error ? error.message : "Could not load available times.");
      }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [editor.clientId, editor.move?.id, week, refresh]);

  const timeZone = openings?.timeZone ?? "Asia/Kuala_Lumpur";
  const dateFor = (startsAt: string) => ptLocalDate(new Date(startsAt), timeZone);
  const slots = (openings?.slots ?? []).filter((slot) => !editor.move || Date.parse(slot.startsAt) !== Date.parse(editor.move.startsAt));
  const dates = [...new Set(slots.map((slot) => dateFor(slot.startsAt)))];
  const selectedDay = day ?? dates[0];
  const currentSlots = slots.filter((slot) => dateFor(slot.startsAt) === selectedDay);
  const timeFormat = new Intl.DateTimeFormat("en-SG", { timeZone, hour: "numeric", minute: "2-digit", hour12: true });
  const disabled = loading || saving;

  function changeWeek(next: string) {
    setLoading(true);
    setError("");
    setSelected(undefined);
    setDay(undefined);
    setWeek(next);
  }

  async function save() {
    if (!selected || disabled) return;
    setSaving(true);
    setError("");
    try {
      await bookPtForClient(editor.clientId, selected, editor.move ? { id: editor.move.id, version: editor.move.version } : undefined);
      onSaved(selected, timeZone);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save this booking.");
      setSelected(undefined);
      setDay(undefined);
      setRefresh((value) => value + 1);
    } finally { setSaving(false); }
  }

  return <section className={panel} aria-labelledby="trainer-booking-editor-title">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="trainer-booking-editor-title" className="text-xl font-semibold">{editor.move ? "Move PT booking" : "Book next session"}</h2>
        {openings && <p className="mt-1 text-sm text-zinc-400">{openings.clientName} · 60 min · Gym local time</p>}
      </div>
      <button type="button" className={secondary} disabled={saving} onClick={onClose}>Close</button>
    </div>
    {editor.move && openings && <p className="mt-3 text-sm text-zinc-300">Current time · {formatAppointmentTime(editor.move.startsAt, timeZone)}</p>}
    {!editor.move && openings?.nextBooking && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-calm/25 bg-calm/5 p-3">
      <p className="text-sm text-zinc-300">Already booked · {formatAppointmentTime(openings.nextBooking.startsAt, timeZone)}</p>
      <button type="button" className={secondary} disabled={disabled} onClick={() => { if (openings.nextBooking) onMove(openings.nextBooking); }}>Move that session</button>
    </div>}
    {error && <p role="alert" className="mt-3 rounded-xl border border-amber/25 bg-amber/10 p-3 text-sm text-amber">{error}</p>}
    {loading && !openings && <p role="status" className="mt-3 text-sm text-zinc-400">Loading available times…</p>}
    {openings && <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{monthDay.format(dayDate(openings.week))} – {monthDay.format(dayDate(shiftPtDate(openings.week, 6)))}</p>
        <div className="flex gap-2">
          <button type="button" className={`${secondary} w-11 px-0`} aria-label="Previous available week"
            disabled={disabled || openings.week <= ptWeekStart(openings.today)} onClick={() => changeWeek(shiftPtDate(openings.week, -7))}><ChevronLeft size={18} /></button>
          <button type="button" className={`${secondary} w-11 px-0`} aria-label="Next available week"
            disabled={disabled || openings.week >= ptWeekStart(shiftPtDate(openings.today, 27))} onClick={() => changeWeek(shiftPtDate(openings.week, 7))}><ChevronRight size={18} /></button>
        </div>
      </div>
      {dates.length ? <>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Available days">
          {dates.map((date) => <button type="button" key={date} aria-pressed={selectedDay === date} disabled={disabled}
            className={selectedDay === date ? selectedButton : secondary} onClick={() => { setDay(date); setSelected(undefined); }}>
            {dayShort.format(dayDate(date))}
          </button>)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 min-[370px]:grid-cols-3 sm:grid-cols-4" aria-label="Available times">
          {currentSlots.map((slot) => <button type="button" key={slot.startsAt} aria-pressed={selected === slot.startsAt} disabled={disabled}
            className={selected === slot.startsAt ? selectedButton : secondary} onClick={() => setSelected(slot.startsAt)}>
            {timeFormat.format(new Date(slot.startsAt)).toUpperCase()}
          </button>)}
        </div>
        <button type="button" disabled={disabled || !selected} className={`${primary} mt-4 w-full sm:w-auto`} onClick={() => void save()}>
          <Check size={17} aria-hidden="true" /> {editor.move ? "Confirm new time" : "Confirm booking"}
        </button>
      </> : <p className="mt-3 text-sm text-zinc-400">No openings this week. Try the next week or check your calendar blocks.</p>}
    </>}
  </section>;
}

function CalendarBlocksEditor({ today, startDate, blocks, disabled, onSave, onRemove }: {
  today: string;
  startDate: string;
  blocks: PtCalendarBlock[];
  disabled: boolean;
  onSave: (block: PtCalendarBlockInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [startsOn, setStartsOn] = useState(startDate);
  const [endsOn, setEndsOn] = useState(startDate);
  const [startsAt, setStartsAt] = useState("12:00");
  const [endsAt, setEndsAt] = useState("13:00");
  const [repeat, setRepeat] = useState<PtCalendarBlockInput["repeat"]>("none");
  const [allDay, setAllDay] = useState(false);
  const showEndDate = allDay && repeat === "none";
  const field = "grid min-w-0 gap-1 text-xs font-semibold text-zinc-300";
  const control = `${secondary} w-full min-w-0`;
  return (
    <section className={panel} aria-labelledby="pt-calendar-blocks-title">
      <h2 id="pt-calendar-blocks-title" className="text-lg font-semibold">Block your calendar</h2>
      <p className="mt-1 text-sm text-zinc-400">Clients can request any open hour. Blocking time hides it from clients and declines any pending requests that overlap.</p>
      <form className="mt-4" onSubmit={(event) => {
        event.preventDefault();
        void onSave({
          startsOn, endsOn: showEndDate ? endsOn : startsOn, repeat,
          startsAt: allDay ? null : startsAt, endsAt: allDay ? null : endsAt
        });
      }}>
        <fieldset disabled={disabled} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={field}>{repeat === "none" ? "Date" : "Starts on"}
              <input type="date" required min={today} value={startsOn} className={control} onChange={(event) => {
                setStartsOn(event.target.value);
                if (event.target.value > endsOn) setEndsOn(event.target.value);
              }} />
            </label>
            <label className={field}>Repeats
              <select value={repeat} className={control} onChange={(event) => setRepeat(event.target.value as typeof repeat)}>
                <option value="none">Once</option>
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
              </select>
            </label>
          </div>
          <label className="flex min-h-9 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={allDay} className="size-4 accent-lime" onChange={(event) => setAllDay(event.target.checked)} /> All day
          </label>
          {showEndDate && <label className={`${field} max-w-xs`}>Last day
            <input type="date" required min={startsOn} value={endsOn} className={control} onChange={(event) => setEndsOn(event.target.value)} />
          </label>}
          {!allDay && <div className="grid grid-cols-2 gap-3">
            <label className={field}>Start time
              <input type="time" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={control} />
            </label>
            <label className={field}>End time
              <input type="time" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={control} />
            </label>
          </div>}
          {repeat === "daily" && allDay && <p className="text-xs text-zinc-300">Every day from this date will be unavailable until you remove the block.</p>}
          <button type="submit" className={`${primary} justify-self-start`}>Save block</button>
        </fieldset>
      </form>
      {blocks.length > 0 && <div className="mt-5 border-t border-white/10 pt-4">
        <h3 className="text-sm font-semibold">Saved blocks</h3>
        <ul className="mt-2 grid gap-2">
          {blocks.map((block) => {
            const start = dayShort.format(dayDate(block.startsOn));
            const timing = block.startsAt && block.endsAt
              ? [block.startsAt, block.endsAt].map((time) => blockClock.format(new Date(`2000-01-01T${time}Z`))).join(" – ")
              : "All day";
            const dates = block.startsOn === block.endsOn ? start : `${start} – ${dayShort.format(dayDate(block.endsOn))}`;
            const repeatLabel = { none: "", daily: "Daily from ", weekly: "Weekly from " }[block.repeat];
            return <li key={block.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ink/55 px-3 py-2">
              <div><p className="text-sm font-semibold">{repeatLabel}{dates}</p><p className="mt-0.5 text-xs text-zinc-300">{timing}</p></div>
              <button type="button" className={secondary} aria-label={`Remove block for ${dates}, ${timing}`} disabled={disabled}
                onClick={() => void onRemove(block.id)}>Remove</button>
            </li>;
          })}
        </ul>
      </div>}
    </section>
  );
}
