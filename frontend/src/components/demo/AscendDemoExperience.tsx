"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Heart,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  ScanLine,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Video,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS } from "@ascend/shared";
import { BrandMark } from "@/components/BrandMark";

const sceneLabels = ["Today", "Food", "Momentum", "Trainer", "Mission", "Progress", "Gym", "Ascend"] as const;
const totalDurationMs = MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0);

function sceneStartMs(sceneIndex: number) {
  return MARKETING_DEMO_SCENE_DURATIONS_MS.slice(0, sceneIndex).reduce((total, duration) => total + duration, 0);
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-lime/40 bg-lime/10" : "border-line bg-ink"}`}>
      <p className="text-[10px] font-semibold uppercase text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ? "text-lime" : "text-white"}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-zinc-400">{detail}</p>
    </div>
  );
}

function MiniAvatar({ initials, tone = "lime" }: { initials: string; tone?: "lime" | "violet" | "amber" }) {
  const color = tone === "violet" ? "bg-violet text-white" : tone === "amber" ? "bg-amber text-ink" : "bg-lime text-ink";
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${color}`}>{initials}</span>;
}

function SceneHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-calm">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold leading-tight text-white">{title}</h2>
    </div>
  );
}

function TodayScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <SceneHeader eyebrow="Good morning, Sarah" title="Your next best action" />
        <span className="grid h-11 w-11 place-items-center rounded-full border border-lime/30 bg-lime/10 text-lime"><Target size={21} /></span>
      </div>
      <div className="rounded-lg border border-lime/35 bg-lime/10 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 shrink-0 text-lime" size={19} />
          <div>
            <p className="font-semibold text-white">Log lunch and drink 500ml water.</p>
            <p className="mt-1 text-xs leading-5 text-zinc-300">One small action keeps today moving forward.</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Calories left" value="620" detail="of 1,850 kcal" />
        <Metric label="Protein left" value="48g" detail="of 125g target" />
      </div>
      <div className="mt-auto grid grid-cols-4 gap-2">
        {[Camera, Activity, Heart, Flame].map((Icon, index) => (
          <div key={index} className={`grid aspect-square place-items-center rounded-lg border ${index === 0 ? "border-lime/40 bg-lime/10 text-lime" : "border-line bg-ink text-zinc-400"}`}>
            <Icon size={20} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FoodScene({ progress }: { progress: number }) {
  const ready = progress > 0.48;
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="AI food logging" title={ready ? "Estimate ready" : "Looking at your meal"} />
      <div className="relative flex min-h-52 flex-1 items-center justify-center overflow-hidden rounded-lg border border-line bg-[#101722]">
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_49%,rgba(255,255,255,0.04)_50%,transparent_51%),linear-gradient(transparent_49%,rgba(255,255,255,0.04)_50%,transparent_51%)] bg-[size:42px_42px]" />
        <div className="relative grid h-36 w-36 place-items-center rounded-full border-8 border-zinc-700 bg-[#efe3c1] shadow-2xl shadow-black/40">
          <div className="absolute h-20 w-20 rounded-full bg-[#e9c984]" />
          <div className="absolute -translate-x-6 translate-y-6 rounded-lg bg-[#c8893f] px-3 py-2 text-xs font-bold text-white">Chicken</div>
          <div className="absolute translate-x-7 -translate-y-5 rounded-full bg-[#4b963f] px-3 py-1 text-[10px] font-bold text-white">Rice</div>
        </div>
        {!ready && <div className="ascend-demo-scan absolute inset-x-4 h-px bg-lime shadow-[0_0_16px_3px_rgba(53,242,208,0.55)]" />}
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-line bg-ink/90 px-3 py-2 text-xs text-zinc-200">
          {ready ? <CheckCircle2 className="text-lime" size={15} /> : <ScanLine className="text-calm" size={15} />}
          {ready ? "Local food matched" : "Checking food and portion"}
        </div>
      </div>
      <div className={`rounded-lg border p-3 transition-all ${ready ? "border-lime/40 bg-lime/10 opacity-100" : "border-line bg-surface opacity-60"}`}>
        <div className="flex items-center justify-between">
          <div><p className="font-semibold text-white">Hainanese chicken rice</p><p className="mt-1 text-xs text-zinc-400">Editable before saving</p></div>
          <p className="text-xl font-bold text-lime">610 kcal</p>
        </div>
        <p className="mt-2 text-xs text-zinc-300">P 32g · C 72g · F 20g</p>
      </div>
    </div>
  );
}

function MomentumScene({ progress }: { progress: number }) {
  const score = Math.round(63 + progress * 9);
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-4">
      <SceneHeader eyebrow="Food log saved" title="Today is moving forward" />
      <div className="grid flex-1 place-items-center">
        <div className="relative grid h-44 w-44 place-items-center rounded-full border-[7px] border-lime bg-lime/5 shadow-[0_0_40px_rgba(53,242,208,0.12)]">
          <div className="text-center"><p className="text-5xl font-bold text-white">{score}</p><p className="mt-1 text-xs font-semibold text-lime">Momentum</p></div>
          <TrendingUp className="absolute -right-2 top-5 rounded-full bg-violet p-2 text-white" size={38} />
        </div>
      </div>
      <div className="rounded-lg border border-line bg-ink p-4">
        <p className="font-semibold text-white">Nice work. Lunch is logged.</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">Your trainer sees the update without needing another spreadsheet or check-in form.</p>
      </div>
    </div>
  );
}

function TrainerScene() {
  const clients = [
    { initials: "SA", name: "Sarah", note: "Protein below target", tone: "amber" as const, score: "72" },
    { initials: "AL", name: "Ali", note: "5-day consistency streak", tone: "lime" as const, score: "84" },
    { initials: "JN", name: "John", note: "All good today", tone: "violet" as const, score: "79" }
  ];
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Trainer dashboard" title="Who needs attention today?" />
      <div className="rounded-lg border border-amber/35 bg-amber/10 p-3 text-xs text-amber">
        <div className="flex items-center gap-2"><AlertTriangle size={16} /><span className="font-semibold">1 client needs a quick check-in</span></div>
      </div>
      <div className="space-y-2">
        {clients.map((client, index) => (
          <div key={client.name} className={`flex items-center gap-3 rounded-lg border p-3 ${index === 0 ? "border-amber/40 bg-amber/5" : "border-line bg-ink"}`}>
            <MiniAvatar initials={client.initials} tone={client.tone} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-white">{client.name}</p><p className="truncate text-xs text-zinc-400">{client.note}</p></div>
            <span className="text-lg font-bold text-white">{client.score}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-lg border border-line bg-surface p-3 text-xs leading-5 text-zinc-300">The trainer sees the signal, not another wall of data.</div>
    </div>
  );
}

function MissionScene({ progress }: { progress: number }) {
  const sent = progress > 0.48;
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-4">
      <SceneHeader eyebrow="One-tap coach action" title={sent ? "Sarah has her next step" : "Send a simple mission"} />
      <div className="flex items-center gap-3 rounded-lg border border-line bg-ink p-3">
        <MiniAvatar initials="SA" tone="amber" />
        <div><p className="font-semibold text-white">Sarah</p><p className="text-xs text-zinc-400">Momentum 72 · Fat loss</p></div>
      </div>
      <div className={`rounded-lg border p-4 transition-all ${sent ? "border-lime/40 bg-lime/10" : "border-calm/40 bg-calm/10"}`}>
        <div className="flex items-start gap-3">
          {sent ? <CheckCircle2 className="text-lime" size={22} /> : <Target className="text-calm" size={22} />}
          <div><p className="font-semibold text-white">Add protein to your next meal</p><p className="mt-1 text-xs leading-5 text-zinc-300">Choose chicken, eggs, tofu, fish, or Greek yoghurt.</p></div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="rounded-lg border border-line bg-surface py-3 text-sm font-semibold text-zinc-300">Send praise</button>
        <button type="button" className={`rounded-lg py-3 text-sm font-bold transition-colors ${sent ? "bg-lime text-ink" : "bg-calm text-white"}`}>{sent ? "Mission sent" : "Send mission"}</button>
      </div>
      {sent && <div className="ascend-demo-pop mt-auto flex items-center gap-2 rounded-lg bg-lime px-3 py-3 text-sm font-bold text-ink"><Check size={17} /> Tiny effort for the trainer. Clear direction for Sarah.</div>}
    </div>
  );
}

function ProgressScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Five days later" title="Consistency becomes visible" />
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Momentum" value="81" detail="up 18 points" accent />
        <Metric label="Current streak" value="5 days" detail="small wins repeated" />
      </div>
      <div className="rounded-lg border border-line bg-ink p-4">
        <div className="flex items-center justify-between"><p className="font-semibold text-white">Weekly progress</p><Trophy className="text-amber" size={20} /></div>
        <div className="mt-4 space-y-3">
          {[{ label: "Food logging", value: 86 }, { label: "Protein consistency", value: 74 }, { label: "Daily habits", value: 92 }].map((item) => (
            <div key={item.label}><div className="mb-1 flex justify-between text-xs text-zinc-300"><span>{item.label}</span><span>{item.value}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface"><div className="ascend-demo-grow h-full rounded-full bg-lime" style={{ width: `${item.value}%` }} /></div></div>
          ))}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-3 rounded-lg border border-calm/35 bg-calm/10 p-3"><MessageCircle className="text-calm" size={20} /><p className="text-xs leading-5 text-zinc-200"><strong className="text-white">Jason noticed your progress.</strong><br />Great consistency this week, Sarah.</p></div>
    </div>
  );
}

function GymScene() {
  return (
    <div className="ascend-demo-enter flex h-full flex-col gap-3">
      <SceneHeader eyebrow="Owner dashboard" title="Accountability becomes a business signal" />
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Active members" value="42" detail="up 8 this month" accent />
        <Metric label="Avg momentum" value="76" detail="across active clients" />
        <Metric label="Trainer response" value="91%" detail="signals acknowledged" />
        <Metric label="At-risk clients" value="3" detail="visible early" />
      </div>
      <div className="flex flex-1 items-end gap-2 rounded-lg border border-line bg-ink p-4" aria-label="Member engagement trend rising over six weeks">
        {[38, 46, 43, 59, 68, 82].map((height, index) => <div key={index} className="flex flex-1 flex-col items-center justify-end gap-2"><div className={`ascend-demo-bar w-full rounded-t-sm ${index === 5 ? "bg-lime" : "bg-calm/60"}`} style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }} /><span className="text-[9px] text-zinc-600">W{index + 1}</span></div>)}
      </div>
      <p className="text-center text-xs leading-5 text-zinc-400">Better visibility supports earlier intervention, stronger retention, and more client success.</p>
    </div>
  );
}

function ClosingScene() {
  return (
    <div className="ascend-demo-enter grid h-full place-items-center text-center">
      <div>
        <BrandMark size="lg" showWordmark />
        <p className="mt-1 text-xs font-semibold uppercase text-lime">Train. Elevate. Become.</p>
        <h2 className="mx-auto mt-5 max-w-sm text-3xl font-semibold uppercase leading-tight text-white">The missing link between training and results.</h2>
        <p className="mx-auto mt-4 max-w-xs text-sm leading-6 text-zinc-300">One ecosystem for members, trainers, and gyms. Built for the hours between sessions.</p>
        <Link href="https://www.getascend.fit/#waitlist" className="mx-auto mt-6 flex h-12 max-w-xs items-center justify-center gap-2 rounded-lg bg-lime px-5 font-bold text-ink">Join the pilot <ArrowRight size={18} /></Link>
      </div>
    </div>
  );
}

function DemoScene({ sceneIndex, sceneProgress }: { sceneIndex: number; sceneProgress: number }) {
  if (sceneIndex === 0) return <TodayScene />;
  if (sceneIndex === 1) return <FoodScene progress={sceneProgress} />;
  if (sceneIndex === 2) return <MomentumScene progress={sceneProgress} />;
  if (sceneIndex === 3) return <TrainerScene />;
  if (sceneIndex === 4) return <MissionScene progress={sceneProgress} />;
  if (sceneIndex === 5) return <ProgressScene />;
  if (sceneIndex === 6) return <GymScene />;
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
    setElapsedMs(sceneStartMs(sceneIndex));
    elapsedRef.current = sceneStartMs(sceneIndex);
    elapsedAtPlayRef.current = sceneStartMs(sceneIndex);
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
            <p className="text-xs font-semibold uppercase text-lime">Ascend in 30 seconds</p>
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-tight sm:text-5xl">See accountability in motion.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-zinc-300">Follow one action from a member, through the trainer, to the gym. No login. No setup. Just the real Ascend workflow.</p>
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
                <h2 className="mt-3 text-2xl font-semibold">One client. One action. One connected ecosystem.</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">The story plays automatically in 30 seconds. Tap any scene to explore it yourself.</p>
                <button type="button" onClick={replay} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-bold text-ink"><Play size={18} /> Start demo</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
