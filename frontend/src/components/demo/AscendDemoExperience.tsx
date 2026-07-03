"use client";

import {
  ArrowRight,
  Brain,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Utensils,
  Video,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS } from "@ascend/shared";
import { BrandMark } from "@/components/BrandMark";

const sceneLabels = ["Today", "Food", "Workout", "Saved", "DNA", "Trainer", "Owner", "Ascend"] as const;
const totalDurationMs = MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0);

function sceneStartMs(sceneIndex: number) {
  return MARKETING_DEMO_SCENE_DURATIONS_MS.slice(0, sceneIndex).reduce((total, duration) => total + duration, 0);
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-lime/40 bg-lime/10" : "border-line bg-ink"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-lime" : "text-white"}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-zinc-400">{detail}</p>
    </div>
  );
}

function MiniAvatar({ initials, tone = "lime" }: { initials: string; tone?: "lime" | "violet" | "amber" }) {
  const color = tone === "violet" ? "bg-violet text-white" : tone === "amber" ? "bg-amber text-ink" : "bg-lime text-ink";
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${color}`}>{initials}</span>;
}

function SceneHeader({ eyebrow, title, icon }: { eyebrow: string; title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-calm">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold leading-tight text-white">{title}</h2>
      </div>
      {icon ? <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-lime/30 bg-lime/10 text-lime">{icon}</span> : null}
    </div>
  );
}

function ProgressPill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${active ? "border-lime/40 bg-lime/10 text-lime" : "border-line bg-surface text-zinc-400"}`}>
      {label}
    </span>
  );
}

function TodayScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-4">
      <SceneHeader eyebrow="Good morning, Sarah" title="What should I do today?" icon={<Target size={21} />} />
      <div className="rounded-lg border border-violet/40 bg-[radial-gradient(circle_at_top_right,rgba(133,95,255,0.24),transparent_42%),linear-gradient(135deg,rgba(21,35,43,0.98),rgba(20,12,38,0.98))] p-4 shadow-[0_0_40px_rgba(133,95,255,0.12)]">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-ink">
            <Sparkles size={23} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-purple-200">Next Best Move</p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight text-white">Log lunch in under 10 seconds.</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-300">One honest log keeps today moving.</p>
          </div>
        </div>
        <button type="button" className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-bold text-ink">
          <Utensils size={18} /> Log meal
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Momentum" value="74" detail="building" accent />
        <Metric label="Water" value="1.8L" detail="700ml left" />
        <Metric label="Steps" value="8.4k" detail="synced" />
      </div>
      <div className="mt-auto rounded-lg border border-line bg-ink p-3 text-xs leading-5 text-zinc-300">
        Health Connect quietly adds activity context, while Coach Zoe keeps the next action simple.
      </div>
    </div>
  );
}

function FoodScene({ progress }: { progress: number }) {
  const ready = progress > 0.48;
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Food logging" title={ready ? "Meal estimate ready" : "Photo or text works"} icon={<Camera size={21} />} />
      <div className="grid gap-2">
        <div className="relative min-h-40 overflow-hidden rounded-lg border border-line bg-[#101722] p-4">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.04)_50%,transparent_51%),linear-gradient(transparent_49%,rgba(255,255,255,0.04)_50%,transparent_51%)] bg-[size:40px_40px]" />
          <div className="relative mx-auto grid h-28 w-28 place-items-center rounded-full border-8 border-zinc-700 bg-[#efe3c1] shadow-2xl shadow-black/40">
            <div className="absolute h-14 w-16 rounded-full bg-[#e9c984]" />
            <div className="absolute -translate-x-6 translate-y-4 rounded-lg bg-[#c8893f] px-2 py-1 text-[10px] font-bold text-white">Chicken</div>
            <div className="absolute translate-x-5 -translate-y-4 rounded-full bg-[#4b963f] px-2 py-1 text-[9px] font-bold text-white">Rice</div>
          </div>
          {!ready && <div className="ascend-demo-scan absolute inset-x-4 h-px bg-lime shadow-[0_0_16px_3px_rgba(53,242,208,0.55)]" />}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-line bg-ink/90 px-3 py-2 text-xs text-zinc-200">
            {ready ? <CheckCircle2 className="text-lime" size={15} /> : <ScanLine className="text-calm" size={15} />}
            {ready ? "AI estimate complete" : "Reading meal"}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-ink p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-purple-200">Forgot the photo?</p>
          <p className="mt-2 rounded-lg bg-surface px-3 py-3 text-sm text-zinc-200">Chicken rice + iced coffee</p>
        </div>
      </div>
      <div className={`rounded-lg border p-3 transition-all ${ready ? "border-lime/40 bg-lime/10 opacity-100" : "border-line bg-surface opacity-60"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-white">Chicken rice</p>
            <p className="mt-1 text-xs text-zinc-400">P 32g / C 72g / F 20g</p>
          </div>
          <p className="text-xl font-bold text-lime">610 kcal</p>
        </div>
      </div>
    </div>
  );
}

function WorkoutPlannerScene({ progress }: { progress: number }) {
  const generated = progress > 0.52;
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Coach Zoe" title={generated ? "Today's workout is ready" : "A workout for where you are"} icon={<Dumbbell size={21} />} />
      {!generated ? (
        <div className="space-y-3 rounded-lg border border-line bg-ink p-4">
          <p className="text-sm font-semibold text-white">Coach Zoe asks four quick questions.</p>
          <div className="grid grid-cols-2 gap-2">
            <ProgressPill label="Home" active />
            <ProgressPill label="45 min" active />
            <ProgressPill label="Strength" active />
            <ProgressPill label="Dumbbells" active />
          </div>
          <div className="rounded-lg border border-lime/30 bg-lime/10 p-3 text-xs leading-5 text-zinc-200">
            Based on your recent activity, we will avoid repeating yesterday's lower body session.
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-lime/35 bg-[linear-gradient(135deg,rgba(53,242,208,0.14),rgba(133,95,255,0.14))] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-lime">Today's workout</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Upper Body Strength</h3>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric label="Time" value="45" detail="minutes" />
            <Metric label="Focus" value="Upper" detail="push + pull" />
            <Metric label="Effort" value="Mod" detail="coach-led" />
          </div>
          <div className="mt-4 space-y-2">
            {["DB press - 3 x 10", "One-arm row - 3 x 12", "Band pull-aparts - 2 x 15"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-xs text-zinc-200">
                <CheckCircle2 className="text-lime" size={15} /> {item}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-auto rounded-lg border border-line bg-surface p-3 text-xs leading-5 text-zinc-300">
        Coach Zoe helps members decide what to do today. It does not replace the trainer.
      </div>
    </div>
  );
}

function WorkoutSavedScene({ progress }: { progress: number }) {
  const saved = progress > 0.46;
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-4">
      <SceneHeader eyebrow="Workout completion" title={saved ? "Workout saved to history" : "Check off each exercise"} icon={<Check size={21} />} />
      <div className="space-y-2">
        {["DB press", "One-arm row", "Lateral raise", "Farmer carry", "Cool down"].map((item, index) => {
          const complete = saved || index < 4;
          return (
            <div key={item} className={`flex items-center gap-3 rounded-lg border p-3 ${complete ? "border-lime/35 bg-lime/10" : "border-line bg-ink"}`}>
              <span className={`grid h-8 w-8 place-items-center rounded-full ${complete ? "bg-lime text-ink" : "bg-surface text-zinc-500"}`}>{complete ? <Check size={16} /> : index + 1}</span>
              <p className="font-semibold text-white">{item}</p>
            </div>
          );
        })}
      </div>
      <div className={`rounded-lg border p-4 transition-all ${saved ? "border-lime/40 bg-lime/10" : "border-line bg-surface"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-white">{saved ? "Workout Saved" : "Complete & Save Workout"}</p>
            <p className="mt-1 text-xs text-zinc-400">Estimated Calories Burned</p>
          </div>
          <p className="text-2xl font-bold text-lime">~285</p>
        </div>
        {saved ? <p className="ascend-demo-pop mt-3 text-xs leading-5 text-zinc-200">Coach Zoe remembers this session and guides tomorrow around recovery and variety.</p> : null}
      </div>
    </div>
  );
}

function DnaScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Athlete Mode" title="Body Scan becomes coaching intelligence" icon={<Brain size={21} />} />
      <div className="rounded-lg border border-white/70 bg-ink p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-300">Ascend DNA</p>
        <div className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-white">Body Progress Score</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Professional progress signal from confirmed scan data.</p>
          </div>
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-[6px] border-lime text-3xl font-bold text-white">95</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Body fat" value="15.4%" detail="-2.1 vs last scan" accent />
        <Metric label="Lean mass" value="68kg" detail="stable" />
        <Metric label="Calories" value="2,757" detail="scan-powered" />
        <Metric label="Protein" value="143g" detail="lean-mass based" />
      </div>
      <div className="rounded-lg border border-purple-400/35 bg-purple-500/10 p-3 text-xs leading-5 text-zinc-200">
        <strong className="text-white">Coach Insight:</strong> Maintain protein and recovery. Body composition is trending in the right direction.
      </div>
    </div>
  );
}

function TrainerScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Trainer Home" title="The day starts with priorities" icon={<MessageCircle size={21} />} />
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Premium attention" value="7" detail="need check-in" />
        <Metric label="Athlete attention" value="2" detail="coach intelligence" accent />
      </div>
      <div className="rounded-lg border border-amber/35 bg-amber/10 p-3">
        <div className="flex items-start gap-3">
          <MiniAvatar initials="R" tone="violet" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-white">Riz <span className="rounded-full border border-purple-300 px-2 py-0.5 text-[10px] text-purple-200">Athlete</span></p>
            <p className="mt-1 text-sm font-semibold text-white">Muscle loss detected</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">Suggested action: review protein and resistance training.</p>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-line bg-ink p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-purple-200">Between sessions</p>
        <div className="mt-3 space-y-2 text-xs text-zinc-300">
          <p><span className="text-lime">Nutrition Summary:</span> 3 meals, 1,780 kcal, protein still needs attention.</p>
          <p><span className="text-lime">Workout Completed:</span> Upper Body Strength, 45 min, ~285 kcal.</p>
          <p><span className="text-lime">Coach Zoe:</span> recovery and protein recommended.</p>
        </div>
      </div>
    </div>
  );
}

function OwnerScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Owner Command Center" title="Business actions, not raw dashboards" icon={<ShieldCheck size={21} />} />
      <div className="rounded-lg border border-purple-400/35 bg-[radial-gradient(circle_at_top_right,rgba(133,95,255,0.24),transparent_45%),rgba(19,17,31,0.95)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-purple-200">Today's business brief</p>
        <p className="mt-3 text-sm leading-6 text-zinc-200">
          Member activity is improving. Focus today on trainer follow-ups and Athlete upgrades.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Revenue opp." value="RM 549" detail="Athlete upgrades" accent />
        <Metric label="Retention" value="Watch" detail="3 members need attention" />
        <Metric label="Trainer action" value="9" detail="follow-ups due" />
        <Metric label="Body scans" value="12" detail="overdue" />
      </div>
      <div className="rounded-lg border border-line bg-ink p-3">
        <div className="flex items-center justify-between text-xs text-zinc-300"><span>Members staying active</span><span className="font-semibold text-white">+14%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface"><div className="ascend-demo-grow h-full rounded-full bg-lime" style={{ width: "82%" }} /></div>
      </div>
      <div className="rounded-lg border border-line bg-surface p-3 text-xs leading-5 text-zinc-300">
        Owners see retention signals, trainer behavior, referrals, and revenue opportunities in plain language.
      </div>
    </div>
  );
}

function ClosingScene() {
  return (
    <div className="ascend-demo-enter grid h-full place-items-center text-center">
      <div>
        <BrandMark size="lg" showWordmark />
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-lime">The other 166 hours</p>
        <h2 className="mx-auto mt-5 max-w-sm text-3xl font-semibold uppercase leading-tight text-white">Ascend extends coaching.</h2>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-zinc-300">
          Members stay accountable. Trainers stay informed. Owners stay in control.
        </p>
        <Link href="https://www.getascend.fit/#waitlist" className="mx-auto mt-6 flex h-12 max-w-xs items-center justify-center gap-2 rounded-lg bg-lime px-5 font-bold text-ink">
          Explore Ascend <ArrowRight size={18} />
        </Link>
      </div>
    </div>
  );
}

function DemoScene({ sceneIndex, sceneProgress }: { sceneIndex: number; sceneProgress: number }) {
  if (sceneIndex === 0) return <TodayScene />;
  if (sceneIndex === 1) return <FoodScene progress={sceneProgress} />;
  if (sceneIndex === 2) return <WorkoutPlannerScene progress={sceneProgress} />;
  if (sceneIndex === 3) return <WorkoutSavedScene progress={sceneProgress} />;
  if (sceneIndex === 4) return <DnaScene />;
  if (sceneIndex === 5) return <TrainerScene />;
  if (sceneIndex === 6) return <OwnerScene />;
  return <ClosingScene />;
}

export function AscendDemoExperience() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recordingMode, setRecordingMode] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const startedAtRef = useRef(0);
  const elapsedAtPlayRef = useRef(0);
  const elapsedRef = useRef(0);
  const frame = useMemo(() => getMarketingDemoFrame(elapsedMs), [elapsedMs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const record = params.get("record") === "1";
    setRecordingMode(record);
    setShowIntro(!record);
    setPlaying(record && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (!playing) return;
    startedAtRef.current = Date.now();
    elapsedAtPlayRef.current = elapsedRef.current;
    let animationFrame = 0;
    const tick = () => {
      const nextElapsedMs = (elapsedAtPlayRef.current + Date.now() - startedAtRef.current) % totalDurationMs;
      elapsedRef.current = nextElapsedMs;
      setElapsedMs(nextElapsedMs);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [playing]);

  const jumpTo = useCallback((sceneIndex: number) => {
    const nextElapsedMs = sceneStartMs(sceneIndex);
    setElapsedMs(nextElapsedMs);
    elapsedRef.current = nextElapsedMs;
    elapsedAtPlayRef.current = nextElapsedMs;
    startedAtRef.current = Date.now();
    setShowIntro(false);
  }, []);

  const move = (direction: number) => jumpTo((frame.sceneIndex + direction + sceneLabels.length) % sceneLabels.length);
  const replay = () => { elapsedRef.current = 0; setElapsedMs(0); setPlaying(true); setShowIntro(false); };

  return (
    <main className={`min-h-[100dvh] overflow-hidden bg-[#07090d] text-white ${recordingMode ? "grid place-items-center" : ""}`}>
      {!recordingMode && (
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-7">
          <Link href="https://www.getascend.fit" className="flex items-center gap-3" aria-label="Ascend home"><BrandMark size="sm" /><span className="text-lg font-semibold">Ascend</span></Link>
          <div className="flex items-center gap-2">
            <Link href="/demo?record=1" className="hidden h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-zinc-200 sm:flex"><Video size={16} /> Recording view</Link>
            <Link href="https://www.getascend.fit/login" className="flex h-10 items-center rounded-lg border border-line px-3 text-xs font-semibold text-zinc-200">Open Ascend</Link>
          </div>
        </header>
      )}

      <div className={`${recordingMode ? "h-[100dvh] w-full max-w-[430px]" : "mx-auto grid min-h-[calc(100dvh-72px)] w-full max-w-7xl items-center gap-8 px-4 pb-5 sm:px-7 lg:grid-cols-[0.8fr_1.2fr]"}`}>
        {!recordingMode && (
          <section className="mx-auto hidden w-full max-w-lg py-3 lg:block lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime">Ascend in 30 seconds</p>
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-tight sm:text-5xl">The trainer coaches for one hour. Ascend covers the other 166.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-zinc-300">
              Watch how food logging, Coach Zoe workouts, Body Scan intelligence, trainer priorities, and owner signals connect into one accountability system.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setPlaying((value) => !value)} className="flex h-11 items-center gap-2 rounded-lg bg-lime px-4 text-sm font-bold text-ink">{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? "Pause" : "Play"}</button>
              <button type="button" onClick={replay} className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-zinc-200"><RefreshCw size={17} /> Replay</button>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Demo scenes">
              {sceneLabels.map((label, index) => <button key={label} type="button" onClick={() => jumpTo(index)} title={`Show ${label}`} aria-label={`Show ${label} scene`} className={`h-2 rounded-full transition-colors ${frame.sceneIndex === index ? "bg-lime" : "bg-line hover:bg-zinc-500"}`} />)}
            </div>
            <div className="mt-3 flex justify-between text-xs text-zinc-500"><span>{sceneLabels[frame.sceneIndex]}</span><span>{Math.max(1, Math.ceil((totalDurationMs - elapsedMs) / 1000))}s</span></div>
          </section>
        )}

        <section className={`relative mx-auto w-full ${recordingMode ? "h-full" : "max-w-[780px]"}`} aria-live="polite">
          <div className={`${recordingMode ? "h-full" : "relative aspect-[9/16] max-h-[760px] min-h-[620px] overflow-hidden rounded-lg border border-line bg-[#0a0d13] shadow-2xl shadow-black/60 sm:aspect-[9/15]"}`}>
            <div className="absolute inset-x-0 top-0 z-20 h-1 bg-line"><div className="h-full bg-lime transition-[width] duration-100" style={{ width: `${frame.totalProgress * 100}%` }} /></div>
            <div className="flex h-full flex-col px-5 pb-5 pt-6 sm:px-7">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2"><BrandMark size="sm" /><div><p className="text-sm font-semibold">Ascend</p><p className="text-[10px] text-zinc-500">Live product story</p></div></div>
                <span className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-zinc-400">{frame.sceneIndex + 1} / {sceneLabels.length}</span>
              </div>
              <div key={`${frame.sceneIndex}-${Math.floor(frame.sceneProgress * 2)}`} className="min-h-0 flex-1"><DemoScene sceneIndex={frame.sceneIndex} sceneProgress={frame.sceneProgress} /></div>
              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={() => move(-1)} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-zinc-300" aria-label="Previous scene"><ChevronLeft size={19} /></button>
                <button type="button" onClick={() => setPlaying((value) => !value)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink" aria-label={playing ? "Pause demo" : "Play demo"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
                <button type="button" onClick={() => move(1)} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-zinc-300" aria-label="Next scene"><ChevronRight size={19} /></button>
              </div>
            </div>
          </div>

          {showIntro && !recordingMode && (
            <div className="absolute inset-0 z-30 grid place-items-center rounded-lg bg-black/75 p-6 backdrop-blur-sm">
              <div className="max-w-sm rounded-lg border border-line bg-surface p-5 text-center shadow-2xl">
                <button type="button" onClick={() => setShowIntro(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-line text-zinc-400" aria-label="Close introduction"><X size={16} /></button>
                <Sparkles className="mx-auto mt-1 text-lime" size={28} />
                <h2 className="mt-3 text-2xl font-semibold">One member. One trainer. One owner view.</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">The story plays automatically in 30 seconds and now includes Coach Zoe workouts, Body Scan intelligence, and the owner command center.</p>
                <button type="button" onClick={replay} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-bold text-ink"><Play size={18} /> Start demo</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
