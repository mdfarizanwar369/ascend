"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarHeart, ChevronLeft, ChevronRight, LockKeyhole, Trash2 } from "lucide-react";
import { ptLocalDate, ptWeekStart } from "@ascend/shared";
import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import {
  cycleEnergy, cycleFlows, cycleStorageKey, cycleSymptoms, emptyCycleEntry, hasCycleEntry,
  readCycleEntries, writeCycleEntry, type CycleEntry
} from "@/lib/cycleLog";

const panel = "rounded-[1.4rem] border border-line bg-surface p-4 sm:p-5";
const pill = "min-h-10 rounded-xl border border-line bg-ink px-3 text-sm font-semibold text-zinc-200 aria-pressed:border-calm/60 aria-pressed:bg-calm/15 aria-pressed:text-white disabled:opacity-45";
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);
const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dateLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function moveMonth(date: string, offset: number) {
  const month = asDate(`${date.slice(0, 7)}-01`);
  month.setUTCMonth(month.getUTCMonth() + offset);
  return month.toISOString().slice(0, 10);
}

function ChoiceRow<T extends string>({ label, options, selected, onSelect }: {
  label: string; options: readonly T[]; selected: readonly T[]; onSelect: (value: T) => void;
}) {
  return <fieldset className="grid gap-2">
    <legend className="mb-1 text-sm font-semibold">{label}</legend>
    <div className="flex flex-wrap gap-2">{options.map((option) => (
      <button key={option} type="button" className={`${pill} capitalize`} aria-pressed={selected.includes(option)} onClick={() => onSelect(option)}>
        {option}
      </button>
    ))}</div>
  </fieldset>;
}

export function CycleTracker() {
  return <AppShell active="client" showQuickCapture={false}>
    <RoleGate allowedRoles={["client"]} fallbackTitle="Client access required" fallbackMessage="Open cycle tracking from your client account.">
      <CycleAccount />
    </RoleGate>
  </AppShell>;
}

function CycleAccount() {
  const [accountId, setAccountId] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    waitForFirebasePersistence().then(() => {
      if (active) unsubscribe = onAuthStateChanged(getFirebaseClientAuth(), (user) => setAccountId(user?.uid));
    })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  if (loadFailed) return <p role="alert" className={`${panel} m-4`}>Ascend couldn’t open the tracker. Reload to try again.</p>;
  if (!accountId) return <p role="status" className={`${panel} m-4`}>Opening your tracker…</p>;
  return <CycleCalendar key={accountId} accountId={accountId} />;
}

export function CycleCalendar({ accountId }: { accountId: string }) {
  const today = ptLocalDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [selected, setSelected] = useState(today);
  const [entries, setEntries] = useState<ReturnType<typeof readCycleEntries>>({});
  const [draft, setDraft] = useState(emptyCycleEntry);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const previous = readCycleEntries(localStorage, accountId);
      setEntries(previous);
      setDraft(previous[today] ?? emptyCycleEntry);
      setReady(true);
    } catch {
      setError("Ascend couldn’t open your cycle log on this device.");
    }
  }, [accountId, today]);

  const firstDay = `${selected.slice(0, 7)}-01`;
  const lastDay = asDate(moveMonth(firstDay, 1)).getTime() - 86_400_000;
  const days = Array.from({ length: new Date(lastDay).getUTCDate() }, (_, index) => `${firstDay.slice(0, 8)}${String(index + 1).padStart(2, "0")}`);
  const offset = Math.round((asDate(firstDay).getTime() - asDate(ptWeekStart(firstDay)).getTime()) / 86_400_000);

  function selectDay(day: string) {
    setSelected(day);
    setDraft(entries[day] ?? emptyCycleEntry);
    setMessage("");
    setError("");
  }

  function save(entry: CycleEntry) {
    try {
      setEntries(writeCycleEntry(localStorage, accountId, selected, entry));
      setDraft(entry);
      setError("");
      setMessage(hasCycleEntry(entry) ? "Saved on this device." : "Entry removed.");
    } catch {
      setMessage("");
      setError("Ascend couldn’t save your entry on this device.");
    }
  }

  function clearLog() {
    if (!window.confirm("Delete all cycle entries saved on this device?")) return;
    try {
      localStorage.removeItem(cycleStorageKey(accountId));
      setEntries({});
      setDraft(emptyCycleEntry);
      setReady(true);
      setError("");
      setMessage("Cycle log cleared.");
    } catch {
      setError("Ascend couldn’t clear the log on this device.");
    }
  }

  return <div className="mx-auto mt-4 grid w-full max-w-4xl gap-4">
    <header className="rounded-[1.65rem] border border-calm/20 bg-[radial-gradient(ellipse_at_top_right,rgba(53,242,208,0.16),transparent_65%)] bg-surface p-5 sm:p-6">
      <Link href="/profile" className="text-sm font-semibold text-calm">Back to profile</Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cycle tracker</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-zinc-300"><LockKeyhole size={15} aria-hidden="true" /> Your log stays on this device.</p>
        </div>
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-calm/25 bg-calm/10 text-calm"><CalendarHeart size={23} aria-hidden="true" /></span>
      </div>
    </header>
    {message && <p role="status" className="rounded-xl border border-lime/25 bg-lime/10 px-4 py-3 text-sm text-lime">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-amber/25 bg-amber/10 px-4 py-3 text-sm text-amber">{error}</p>}
    <div className="grid items-start gap-4 md:grid-cols-2">
      <section className={panel} aria-label="Cycle calendar">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={`${pill} grid size-10 place-items-center px-0`} aria-label="Previous month"
            onClick={() => selectDay(moveMonth(firstDay, -1))}><ChevronLeft size={19} /></button>
          <h2 className="font-semibold">{monthLabel.format(asDate(firstDay))}</h2>
          <button type="button" className={`${pill} grid size-10 place-items-center px-0`} aria-label="Next month"
            disabled={firstDay.slice(0, 7) >= today.slice(0, 7)} onClick={() => selectDay(moveMonth(firstDay, 1))}><ChevronRight size={19} /></button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center">
          {daysOfWeek.map((day) => <span key={day} aria-hidden="true" className="pb-2 text-[11px] text-zinc-400">{day}</span>)}
          {days.map((day, index) => {
            const entry = entries[day];
            const mark = entry?.period || entry?.flow ? "Period or spotting" : entry ? "Wellbeing logged" : "";
            return <button key={day} type="button" style={index === 0 ? { gridColumnStart: offset + 1 } : undefined}
              className={`${pill} flex min-w-0 flex-col items-center justify-center gap-1 px-0`}
              aria-label={`${dateLabel.format(asDate(day))}${mark ? `, ${mark}` : ""}`}
              aria-current={day === today ? "date" : undefined} aria-pressed={day === selected} disabled={day > today} onClick={() => selectDay(day)}>
              {Number(day.slice(-2))}
              <span aria-hidden="true" className={`size-1 rounded-full ${mark === "Period or spotting" ? "bg-rose-400" : mark ? "bg-calm" : "bg-transparent"}`} />
            </button>;
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-300">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-rose-400" /> Period or spotting</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-calm" /> Wellbeing</span>
          <button type="button" className="ml-auto min-h-9 font-semibold text-calm" onClick={() => selectDay(today)}>Today</button>
        </div>
      </section>
      <form className={`${panel} grid gap-4`} onSubmit={(event) => { event.preventDefault(); if (ready) save(draft); }}>
        <h2 className="text-lg font-semibold">{dateLabel.format(asDate(selected))}</h2>
        <label className="flex min-h-10 items-center gap-3 rounded-xl border border-line bg-ink px-3 py-2 text-sm font-semibold">
          <input type="checkbox" className="size-4 accent-calm" checked={draft.period} onChange={(event) => {
            const period = event.target.checked;
            setDraft({ ...draft, period, flow: period || draft.flow === "spotting" ? draft.flow : null });
          }} />
          Period day
        </label>
        <ChoiceRow label="Flow · optional" options={cycleFlows} selected={draft.flow ? [draft.flow] : []}
          onSelect={(option) => {
            const flow = draft.flow === option ? null : option;
            setDraft({ ...draft, flow, period: draft.period || Boolean(flow && flow !== "spotting") });
          }} />
        <ChoiceRow label="Symptoms · optional" options={cycleSymptoms} selected={draft.symptoms}
          onSelect={(option) => setDraft({ ...draft, symptoms: draft.symptoms.includes(option) ? draft.symptoms.filter((symptom) => symptom !== option) : [...draft.symptoms, option] })} />
        <ChoiceRow label="Energy · optional" options={cycleEnergy} selected={draft.energy ? [draft.energy] : []}
          onSelect={(option) => setDraft({ ...draft, energy: draft.energy === option ? null : option })} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="min-h-11 rounded-xl bg-lime px-4 text-sm font-bold text-ink disabled:opacity-45"
            disabled={!ready || !hasCycleEntry(draft)}>Save entry</button>
          {entries[selected] && <button type="button" className={pill} onClick={() => save(emptyCycleEntry)}>Delete entry</button>}
        </div>
      </form>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-400">
      <p>Each device has its own log.</p>
      {(Object.keys(entries).length > 0 || !ready && error) && <button type="button" className="inline-flex min-h-11 items-center gap-2 font-semibold text-zinc-300"
        onClick={clearLog}><Trash2 size={14} aria-hidden="true" /> Delete this device’s log</button>}
    </div>
  </div>;
}
