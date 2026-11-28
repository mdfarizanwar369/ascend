"use client";

import { CalendarDays, Check, ChevronLeft, Flag, LockKeyhole, Trophy } from "lucide-react";
import { useState } from "react";
import { challengeTemplates, shiftPtDate, type ChallengeList, type ChallengeRules, type ChallengeTemplate } from "@ascend/shared";
import { challengeDays, field, panel, primary, secondary, templates } from "./challengeDesign";

export type ChallengeDraft = {
  gymId: string;
  rules: ChallengeRules;
  edit?: { id: string; version: number };
};

export function ChallengeBuilder({ initial, gyms, audience, busy, back, save }: {
  initial: ChallengeDraft;
  gyms: ChallengeList["gyms"];
  audience: "trainer" | "gym";
  busy: boolean;
  back: () => void;
  save: (draft: ChallengeDraft, publish: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const { rules } = draft;
  const [validation, setValidation] = useState("");
  const duration = challengeDays(rules.startsOn, rules.endsOn);
  const update = (values: Partial<ChallengeRules>) => setDraft((current) => ({ ...current, rules: { ...current.rules, ...values } }));
  const selectedGym = gyms.find((gym) => gym.id === draft.gymId);

  function choose(template: ChallengeTemplate) {
    const item = templates[template];
    const title = rules.title === templates[rules.template].title ? item.title : rules.title;
    update({ template, title, actions: [template], requiredActions: 1, goalDays: Math.min(item.goal, Math.max(1, duration || 31)) });
  }

  function toggleAction(template: ChallengeTemplate) {
    const actions = rules.actions.includes(template) ? rules.actions.filter((value) => value !== template) : [...rules.actions, template];
    if (actions.length) update({ actions, requiredActions: Math.min(rules.requiredActions, actions.length) });
  }

  function submit(publish: boolean) {
    if (!rules.title.trim() || !selectedGym || !Number.isInteger(rules.goalDays) || rules.goalDays < 1
      || !Number.isFinite(duration) || duration < rules.goalDays || duration > 31) {
      setValidation("Enter a name and choose a goal that fits within a challenge of 1 to 31 days.");
      return;
    }
    setValidation("");
    save(draft, publish);
  }

  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
    <form className={`${panel} grid gap-6 p-4 sm:p-6`} onSubmit={(event) => { event.preventDefault(); submit(true); }}>
      <div>
        <button type="button" onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-calm"><ChevronLeft size={16} /> Challenges</button>
        <h2 className="text-2xl font-bold">{draft.edit ? "Edit challenge" : "Create a challenge"}</h2>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Start from a template</legend>
        <div className="grid grid-cols-3 gap-2">
          {challengeTemplates.map((key) => {
            const item = templates[key];
            return <button key={key} type="button" aria-pressed={rules.template === key} onClick={() => choose(key)}
              className="relative grid min-h-[5.1rem] content-center justify-items-center gap-2 rounded-2xl border border-line bg-ink p-2 text-center text-xs font-semibold text-zinc-200 aria-pressed:border-lime/60 aria-pressed:bg-lime/5 sm:text-sm">
              <item.Icon size={19} className={item.tone.split(" ")[0]} />
              {item.name}
              {rules.template === key && <Check size={13} className="absolute right-2 top-2 text-lime" aria-hidden />}
            </button>;
          })}
        </div>
      </fieldset>
      <div className="grid gap-3">
        <label className="text-sm font-semibold">Challenge name<input className={field} value={rules.title} maxLength={64} required onChange={(event) => update({ title: event.target.value })} /></label>
        {audience === "gym" && gyms.length > 1 && <label className="text-sm font-semibold">Gym<select className={field} value={draft.gymId} disabled={Boolean(draft.edit)} onChange={(event) => setDraft({ ...draft, gymId: event.target.value })}>
          {gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}
        </select></label>}
        <div className="grid grid-cols-2 gap-3">
          <label className="min-w-0 text-sm font-semibold">Starts<input type="date" className={field} value={rules.startsOn} required onChange={(event) => update({ startsOn: event.target.value })} /></label>
          <label className="min-w-0 text-sm font-semibold">Ends<input type="date" className={field} value={rules.endsOn} min={rules.startsOn || undefined} max={rules.startsOn ? shiftPtDate(rules.startsOn, 30) : undefined} required onChange={(event) => update({ endsOn: event.target.value })} /></label>
        </div>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">What counts toward a point</legend>
        <div className="grid gap-2">
          {challengeTemplates.map((key) => <label className="flex items-center gap-3 rounded-xl border border-line bg-ink/75 px-3 py-2.5" key={key}>
            <input type="checkbox" className="size-4 shrink-0 accent-lime" checked={rules.actions.includes(key)} disabled={rules.actions.length === 1 && rules.actions[0] === key} onChange={() => toggleAction(key)} />
            <span className="text-sm font-medium">{templates[key].rule}</span>
          </label>)}
        </div>
        {rules.actions.length > 1 && <label className="mt-3 block text-sm font-semibold">Actions needed each day<select className={field} value={rules.requiredActions} onChange={(event) => update({ requiredActions: Number(event.target.value) })}>
          {rules.actions.map((_, index) => <option key={index} value={index + 1}>{index + 1} of {rules.actions.length}</option>)}
        </select></label>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <label className="text-sm font-semibold">Points to finish<input type="number" className={field} min={1} max={Math.max(1, Math.min(31, duration || 31))} required value={rules.goalDays || ""} onChange={(event) => update({ goalDays: Number(event.target.value) })} /></label>
        <label className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-ink px-3 py-2.5"><input type="checkbox" className="size-4 shrink-0 accent-lime" checked={rules.leaderboard} onChange={(event) => update({ leaderboard: event.target.checked })} /><span className="text-sm font-semibold">Offer an opt-in leaderboard</span></label>
      </div>
      <div className="border-t border-line pt-4">
        {validation && <p className="mb-3 text-sm text-amber" role="alert">{validation}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={secondary} disabled={busy} onClick={() => submit(false)}>Save draft</button>
          <button type="submit" className={primary} disabled={busy}><Flag size={16} /> Publish</button>
        </div>
      </div>
    </form>
    <aside className={`${panel} overflow-hidden`}>
      <div className="border-b border-lime/20 bg-gradient-to-br from-lime/15 to-surface p-5">
        <span className="grid size-10 place-items-center rounded-xl border border-lime/25 bg-lime/10 text-lime"><Trophy size={20} /></span>
        <h3 className="mt-4 text-lg font-bold">{rules.title.trim() || "Your challenge"}</h3>
        <p className="mt-1 text-sm text-zinc-300">{audience === "trainer" ? "Your assigned clients" : `All members of ${selectedGym?.name ?? "your gym"}`}</p>
      </div>
      <div className="grid gap-3 p-5 text-sm text-zinc-300">
        <p className="flex items-center gap-2"><CalendarDays size={16} className="shrink-0 text-calm" /> {Number.isFinite(duration) && duration > 0 ? `${duration} days · ` : ""}One point per qualifying day</p>
        <p className="flex items-center gap-2"><Flag size={16} className="shrink-0 text-lime" /> {rules.goalDays || "—"} points to finish</p>
        <p className="flex items-start gap-2"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-amber" /> Rules are locked when you publish.</p>
      </div>
    </aside>
  </div>;
}
