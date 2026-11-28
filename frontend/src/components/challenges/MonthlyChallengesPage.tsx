"use client";

import { ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, Copy, LockKeyhole, Plus, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type ChallengeDetail, type ChallengeList, type ChallengeRole, type MonthlyChallenge } from "@ascend/shared";
import { AppShell } from "@/components/AppShell";
import { confirmChallengeMealDay, getMonthlyChallenge, listMonthlyChallenges, saveMonthlyChallenge, setMonthlyChallengeMembership } from "@/lib/ascendApi";
import { ChallengeBuilder, type ChallengeDraft } from "./ChallengeBuilder";
import { challengeDateRange, challengeDays, field, newChallengeRules, nextChallengeMonth, panel, primary, secondary, statusLabels, templates } from "./challengeDesign";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Ascend couldn’t update the challenge.";
}

function ChallengeTile({ challenge, selected, select }: { challenge: MonthlyChallenge; selected: boolean; select: () => void }) {
  const t = templates[challenge.template];
  return <button type="button" aria-pressed={selected} onClick={select}
    className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-line bg-ink/75 p-3.5 text-left transition hover:border-calm/45 aria-pressed:border-lime/50 aria-pressed:bg-lime/5">
    <span className={`grid size-11 shrink-0 place-items-center rounded-xl border ${t.tone}`}><t.Icon size={20} /></span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-bold text-white">{challenge.title}</span>
      <span className="mt-1 block text-xs text-zinc-400">{challengeDateRange(challenge.startsOn, challenge.endsOn)} · {statusLabels[challenge.status]}{challenge.joined ? " · Joined" : ""}</span>
    </span>
    <ChevronRight size={17} className={selected ? "shrink-0 text-lime" : "shrink-0 text-zinc-500"} />
  </button>;
}

function ChallengeLeaderboard({ detail }: { detail: ChallengeDetail }) {
  if (!detail.challenge.leaderboard) return null;
  return <section className="border-t border-line pt-5" aria-label="Leaderboard">
    <h3 className="flex items-center gap-2 text-lg font-bold"><Trophy size={18} className="text-amber" /> Leaderboard</h3>
    {detail.leaderboard.length ? <ol className="mt-3 grid gap-2">
      {detail.leaderboard.map((person, index) => <li key={index} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${person.isMe ? "border-lime/45 bg-lime/5" : "border-line bg-ink/75"}`}>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${person.rank === 1 ? "bg-amber/15 text-amber" : "bg-surface text-zinc-300"}`}>{person.rank}</span>
        <span className="min-w-0 flex-1 break-words text-sm font-semibold">{person.name}{person.isMe ? " (you)" : ""}</span>
        <span className="shrink-0 text-sm font-semibold text-lime">{person.score} pt{person.score === 1 ? "" : "s"}</span>
      </li>)}
    </ol> : <p className="mt-2 text-sm leading-6 text-zinc-400">Scores appear here when members opt in and earn their first point.</p>}
  </section>;
}

function ChallengeOverview({ detail, role, busy, edit, duplicate, changeMembership, finishMeal }: {
  detail: ChallengeDetail;
  role: ChallengeRole;
  busy: boolean;
  edit: () => void;
  duplicate: () => void;
  changeMembership: (membership: { displayName: string | null } | null) => void;
  finishMeal: () => void;
}) {
  const { challenge, membership } = detail;
  const active = challenge.status === "live";
  const finished = challenge.status === "finished";
  const [showConsent, setShowConsent] = useState(false);
  const [name, setName] = useState("");
  const info = templates[challenge.template];
  const milestone = membership ? Math.min(challenge.goalDays, membership.score) : 0;
  const dayHasPoint = Boolean(membership && membership.todayActions.length >= challenge.requiredActions);

  function join() {
    changeMembership({ displayName: showConsent && name.trim() ? name.trim() : null });
  }

  return <article className={`${panel} overflow-hidden`}>
    <div className="border-b border-line bg-[radial-gradient(ellipse_at_top_right,rgba(198,239,79,0.18),transparent_67%)] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <span className={`grid size-12 place-items-center rounded-2xl border ${info.tone}`}><info.Icon size={23} /></span>
        <span className="rounded-full border border-line bg-ink/85 px-3 py-1.5 text-xs font-semibold text-zinc-200">{statusLabels[challenge.status]}</span>
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{challenge.title}</h2>
      <p className="mt-1 text-sm text-zinc-300">{challenge.organizer} · {challengeDateRange(challenge.startsOn, challenge.endsOn)}</p>
    </div>
    <div className="grid gap-5 p-5 sm:p-6">
      {role === "member" && membership && <section aria-label="Your progress">
        <div className="flex items-end justify-between gap-2">
          <div><h3 className="text-sm font-semibold text-zinc-300">Your progress</h3><p className="mt-1 text-3xl font-bold text-white">{membership.score}<span className="text-base font-medium text-zinc-400"> / {challenge.goalDays} points</span></p></div>
          {milestone === challenge.goalDays && <span className="rounded-lg bg-lime/10 px-2 py-1 text-xs font-bold text-lime">Goal reached</span>}
        </div>
        <div className="mt-3 flex gap-1.5" role="progressbar" aria-label="Challenge points" aria-valuenow={milestone} aria-valuemax={challenge.goalDays}>
          {Array.from({ length: challenge.goalDays }, (_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${index < milestone ? "bg-lime" : "bg-line"}`} />)}
        </div>
      </section>}
      {role !== "member" && challenge.status !== "draft" && <div className="grid grid-cols-2 gap-3" aria-label="Participation">
        <div className="rounded-2xl border border-line bg-ink p-3.5"><p className="text-xs font-semibold text-zinc-400">Members joined</p><strong className="mt-1 block text-2xl">{detail.joinedCount}</strong></div>
        <div className="rounded-2xl border border-lime/20 bg-lime/5 p-3.5"><p className="text-xs font-semibold text-zinc-300">Reached the goal</p><strong className="mt-1 block text-2xl text-lime">{detail.completedCount}</strong></div>
      </div>}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold">{role === "member" && active && membership ? "Today’s actions" : "How to earn a point"}</h3>
          {active && dayHasPoint && <span className="text-xs font-semibold text-lime">Today’s point earned</span>}
        </div>
        <p className="mt-1 text-sm text-zinc-400">Complete {challenge.requiredActions} of {challenge.actions.length} {challenge.actions.length === 1 ? "action" : "actions"} for one point that day.</p>
        <ul className="mt-3 grid gap-2">
          {challenge.actions.map((key) => {
            const item = templates[key];
            const done = active && membership?.todayActions.includes(key);
            return <li key={key} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-ink/70 px-3 py-2.5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${done ? "border-lime/35 bg-lime/10 text-lime" : item.tone}`}>
                {done ? <Check size={17} aria-label="Complete" /> : <item.Icon size={16} />}
              </span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.rule}</p>
                {key === "hydration" && membership?.waterTargetMl && <p className="mt-0.5 text-xs text-zinc-400">Your challenge target is {(membership.waterTargetMl / 1000).toLocaleString()} L</p>}
              </div>
              {key === "meals" && active && membership && !done && (membership.mealLogAvailable
                ? <button type="button" className={secondary} disabled={busy} onClick={finishMeal}>Done logging today</button>
                : <Link className="text-sm font-semibold text-calm" href="/food-log">Log a meal <ArrowRight className="ml-0.5 inline" size={13} /></Link>)}
            </li>;
          })}
        </ul>
      </section>
      {role === "member" && !finished && (!membership || (challenge.leaderboard && !membership.displayName)) && <section className="grid gap-3 border-t border-line pt-4">
        {!membership && <p className="flex items-start gap-2 text-xs leading-5 text-zinc-400"><LockKeyhole size={15} className="mt-0.5 shrink-0 text-calm" /> Your diary stays private. The organiser sees participation and completion totals.</p>}
        {challenge.leaderboard && <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4 accent-lime" checked={showConsent} onChange={(event) => setShowConsent(event.target.checked)} /> Show my display name and points on the leaderboard</label>}
        {showConsent && <label className="text-sm font-semibold">Leaderboard name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={28} className={field} placeholder="Choose a nickname" /></label>}
        {(!membership || showConsent) && <button type="button" onClick={join} disabled={busy || (showConsent && !name.trim())} className={primary}>{membership ? "Show my score" : "Join challenge"} <ArrowRight size={16} /></button>}
      </section>}
      {(role !== "member" || membership) && <ChallengeLeaderboard detail={detail} />}
      {role === "member" && membership && <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4 text-xs font-semibold">
        {membership.displayName && <button type="button" disabled={busy} onClick={() => { setShowConsent(false); changeMembership({ displayName: null }); }} className="text-calm">Hide my leaderboard entry</button>}
        <button type="button" disabled={busy} onClick={() => { if (window.confirm("Leave this challenge and remove your score?")) changeMembership(null); }} className="text-zinc-400 hover:text-white">Leave challenge</button>
      </div>}
      {role !== "member" && <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {challenge.status === "draft" && <button type="button" className={primary} onClick={edit}>Edit draft <ArrowRight size={16} /></button>}
        <button type="button" className={secondary} onClick={duplicate}><Copy size={15} /> Duplicate for next month</button>
      </div>}
    </div>
  </article>;
}

export function MonthlyChallengesPage({ role }: { role: ChallengeRole }) {
  const [data, setData] = useState<ChallengeList>();
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<ChallengeDetail>();
  const [draft, setDraft] = useState<ChallengeDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [reload, setReload] = useState(0);
  const staff = role !== "member";
  const activeDetail = detail?.challenge.id === selected ? detail : undefined;
  const gym = data?.gyms[0];

  useEffect(() => {
    let active = true;
    listMonthlyChallenges(role).then((response) => {
      if (!active) return;
      setData(response);
      setSelected((current) => response.challenges.some((item) => item.id === current) ? current
        : (response.challenges.find((item) => item.status === "live") ?? response.challenges[0])?.id);
    }).catch((failure: unknown) => { if (active) setError(errorText(failure)); });
    return () => { active = false; };
  }, [role, reload]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    getMonthlyChallenge(role, selected).then((value) => {
      if (active) setDetail(value);
    }).catch((failure: unknown) => { if (active) setError(errorText(failure)); });
    return () => { active = false; };
  }, [role, selected, reload]);

  async function perform(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await operation();
      setStatus(message);
      setReload((value) => value + 1);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  function openDraft(challenge?: MonthlyChallenge, duplicate = false) {
    if (!gym) return;
    setError("");
    setStatus("");
    if (!challenge) { setDraft({ gymId: gym.id, rules: newChallengeRules(gym.timeZone) }); return; }
    const { title, template, actions, goalDays, requiredActions, leaderboard } = challenge;
    const dates = duplicate ? nextChallengeMonth(challenge.endsOn, challenge.timeZone) : { startsOn: challenge.startsOn, endsOn: challenge.endsOn };
    setDraft({
      gymId: challenge.gymId,
      rules: { title, template, actions, requiredActions, leaderboard, ...dates, goalDays: Math.min(goalDays, challengeDays(dates.startsOn, dates.endsOn)) },
      edit: duplicate ? undefined : { id: challenge.id, version: challenge.version }
    });
  }

  return <AppShell active={role === "gym" ? "admin" : role === "trainer" ? "trainer" : "client"} showQuickCapture={false}>
    <div className="mx-auto grid w-full max-w-5xl gap-5 pb-8 text-white">
      <header className="relative overflow-hidden rounded-[1.7rem] border border-lime/25 bg-[radial-gradient(ellipse_at_top_right,rgba(202,245,72,0.25),transparent_66%),linear-gradient(135deg,#18251f,#161c28_73%)] p-5 sm:p-7">
        <Trophy size={132} strokeWidth={0.65} aria-hidden className="pointer-events-none absolute -right-4 -top-5 rotate-12 text-lime/15 sm:right-7 sm:top-0" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-lime"><Trophy size={15} /> {role === "trainer" ? "Trainer workspace" : role === "gym" ? gym?.name ?? "Gym workspace" : gym?.name ?? "Member activities"}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{role === "trainer" ? "Client challenges" : role === "gym" ? "Gym challenges" : "Challenges"}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-300">{role === "trainer" ? "Run monthly challenges for your assigned clients." : role === "gym" ? "Run challenges for all your gym members, including members without a PT." : "Join a challenge and earn points from the habits you log."}</p>
          </div>
          {staff && gym && !draft && <button type="button" className={primary} onClick={() => openDraft()}><Plus size={17} /> New challenge</button>}
        </div>
      </header>
      {status && <p className="rounded-xl border border-lime/25 bg-lime/5 px-4 py-3 text-sm font-semibold text-lime" role="status">{status}</p>}
      {error && <p className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber" role="alert">{error}</p>}
      {!data && !error && <p className="text-sm text-zinc-400" role="status">Loading challenges…</p>}
      {draft && staff && data ? <ChallengeBuilder initial={draft} audience={role} gyms={data.gyms} busy={busy}
        back={() => setDraft(undefined)} save={(value, publish) => void perform(async () => {
          const result = await saveMonthlyChallenge(role, { ...value.rules, gymId: value.gymId, publish }, value.edit);
          setSelected(result.id);
          setDraft(undefined);
        }, publish ? "Challenge published." : "Draft saved.")} /> : data && <div className="grid items-start gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <section className={`${panel} grid gap-3 p-4 sm:p-5 ${role === "member" && activeDetail?.membership ? "order-last md:order-none" : ""}`}>
          <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarDays size={18} className="text-calm" /> {role === "member" ? "Available challenges" : "Your challenges"}</h2>
          {data.challenges.length ? data.challenges.map((challenge) => <ChallengeTile key={challenge.id} challenge={challenge} selected={selected === challenge.id} select={() => { setSelected(challenge.id); setStatus(""); setError(""); }} />)
            : <p className="rounded-xl border border-dashed border-line p-4 text-sm leading-6 text-zinc-400">{!gym ? (staff ? "An active gym workspace is required to create challenges." : "Your gym’s challenges will appear here when your membership is connected.")
              : staff ? "Create a challenge or choose a template to get a draft started." : "There are no challenges available right now."}</p>}
        </section>
        {activeDetail ? <ChallengeOverview key={activeDetail.challenge.id} role={role} detail={activeDetail} busy={busy}
          edit={() => openDraft(activeDetail.challenge)} duplicate={() => openDraft(activeDetail.challenge, true)}
          changeMembership={(membership) => void perform(() => setMonthlyChallengeMembership(activeDetail.challenge.id, membership),
            membership ? activeDetail.membership ? "Leaderboard preference saved." : "You joined the challenge." : "You left the challenge.")}
          finishMeal={() => void perform(() => confirmChallengeMealDay(activeDetail.challenge.id, activeDetail.today), "Today’s meal check-in saved.")} />
          : selected && !error ? <p className="text-sm text-zinc-400" role="status">Opening challenge…</p> : !selected && <p className={`${panel} flex gap-2.5 p-5 text-sm leading-6 text-zinc-400`}>
            {staff ? <Users size={18} className="mt-0.5 shrink-0 text-calm" /> : <CircleHelp size={18} className="mt-0.5 shrink-0 text-calm" />}
            {staff ? "Published challenges will appear for eligible members to join." : "You choose whether to join and whether to appear on the leaderboard."}
          </p>}
      </div>}
    </div>
  </AppShell>;
}
