"use client";

import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import { ptSessionFeelings, ptSessionPreferences, type PtSessionWellbeing } from "@ascend/shared";

const feelings: Record<NonNullable<PtSessionWellbeing["feeling"]>, string> = {
  good: "Feeling good", low_energy: "Low energy", sore: "Sore", uncomfortable: "Uncomfortable"
};
const preferences: Record<NonNullable<PtSessionWellbeing["preference"]>, string> = {
  lighter: "Take it lighter", talk_first: "Talk before we start"
};
const option = "inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-ink px-3 text-xs font-semibold text-zinc-200 aria-pressed:border-calm/55 aria-pressed:bg-calm/15 disabled:opacity-50";

export function PtWellbeingSummary({ value, trainer }: { value: PtSessionWellbeing; trainer?: boolean }) {
  return <div className="rounded-xl border border-calm/25 bg-calm/5 px-3 py-2.5">
    <p className="flex items-center gap-2 text-xs font-semibold text-calm">
      <HeartHandshake size={15} aria-hidden="true" /> {trainer ? "Client’s check-in" : "Shared with your PT"}
    </p>
    <p className="mt-1 text-sm text-zinc-200">
      {[value.feeling && feelings[value.feeling], value.preference && preferences[value.preference]].filter(Boolean).join(" · ")}
    </p>
  </div>;
}

export function PtWellbeingCheckIn({ bookingId, trainerName, value, canShare, disabled, onSave }: {
  bookingId: string;
  trainerName: string;
  value: PtSessionWellbeing | null;
  canShare: boolean;
  disabled: boolean;
  onSave: (wellbeing: PtSessionWellbeing | null, onSaved: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<PtSessionWellbeing>({ feeling: null, preference: null });
  const formId = `pt-check-in-${bookingId}`;
  return <section className="mt-3 space-y-2 border-t border-line/70 pt-3" aria-label="Pre-session check-in">
    {value && <PtWellbeingSummary value={value} />}
    <div className="flex flex-wrap items-center gap-2">
      {canShare && <button type="button" className={option} disabled={disabled} aria-expanded={open} aria-controls={open ? formId : undefined}
        onClick={() => {
          setChoice(value ?? { feeling: null, preference: null });
          setOpen(!open);
        }}>
        {open ? "Close check-in" : value ? "Edit check-in" : "Share how I feel"}
      </button>}
      {value && <button type="button" className={option} disabled={disabled}
        onClick={() => onSave(null, () => setOpen(false))}>Stop sharing</button>}
    </div>
    {open && canShare && <form id={formId} className="grid gap-3 rounded-xl border border-line bg-surface p-3" onSubmit={(event) => {
      event.preventDefault();
      if (choice.feeling || choice.preference) onSave(choice, () => setOpen(false));
    }}>
      <p className="text-xs leading-5 text-zinc-300">Only {trainerName} can see your selections for this session. You can stop sharing any time. The check-in expires when the session ends.</p>
      <fieldset disabled={disabled}>
        <legend className="mb-1.5 text-xs font-semibold">How are you feeling?</legend>
        <div className="flex flex-wrap gap-2">{ptSessionFeelings.map((item) =>
          <button key={item} type="button" className={option} aria-pressed={choice.feeling === item}
            onClick={() => setChoice({ ...choice, feeling: choice.feeling === item ? null : item })}>{feelings[item]}</button>
        )}</div>
      </fieldset>
      <fieldset disabled={disabled}>
        <legend className="mb-1.5 text-xs font-semibold">What would help?</legend>
        <div className="flex flex-wrap gap-2">{ptSessionPreferences.map((item) =>
          <button key={item} type="button" className={option} aria-pressed={choice.preference === item}
            onClick={() => setChoice({ ...choice, preference: choice.preference === item ? null : item })}>{preferences[item]}</button>
        )}</div>
      </fieldset>
      <button type="submit" className="min-h-11 justify-self-start rounded-xl bg-lime px-4 text-sm font-bold text-ink disabled:opacity-45"
        disabled={disabled || !(choice.feeling || choice.preference)}>Send to my PT</button>
    </form>}
  </section>;
}
