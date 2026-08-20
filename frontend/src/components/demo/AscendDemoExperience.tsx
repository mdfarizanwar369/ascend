"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play, RefreshCw, Sparkles, Video, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS } from "@ascend/shared";
import { BrandMark } from "@/components/BrandMark";

const demoScenes = [
  {
    label: "Home",
    image: "/demo/member-home.png",
    eyebrow: "Member Home",
    title: "Members know what to do today.",
    copy: "Next Best Move keeps the day calm, focused, and easy to act on.",
    chips: ["Daily priorities", "Quick actions", "Momentum"]
  },
  {
    label: "Food",
    image: "/demo/food-log.png",
    eyebrow: "Meal Logging",
    title: "Meals can be logged in under 10 seconds.",
    copy: "Photo or quick manual entry both flow into calories, protein, carbs, and fat.",
    chips: ["Photo AI", "Manual entry", "Save and review"]
  },
  {
    label: "Workout",
    image: "/demo/workout-plan.jpg",
    eyebrow: "Coach Zoe Workout Planner",
    title: "A real workout for the day you actually have.",
    copy: "Coach Zoe adapts to time, goal, equipment, and recent activity instead of showing a static template.",
    chips: ["Goal-aware", "Time-aware", "Recovery-aware"]
  },
  {
    label: "Saved",
    image: "/demo/workout-complete.jpg",
    eyebrow: "Workout Completion",
    title: "Finished workouts become usable coaching history.",
    copy: "Saved sessions update activity, estimated burn, momentum, and what Coach Zoe suggests next.",
    chips: ["Save workout", "Estimated calories", "Workout memory"]
  },
  {
    label: "DNA",
    image: "/demo/body-scan.jpg",
    eyebrow: "Athlete Mode",
    title: "Body Scan turns data into coaching direction.",
    copy: "Ascend DNA gives trainers a simple progress signal instead of another data dump.",
    chips: ["Ascend DNA", "Coach view", "Dynamic nutrition"]
  },
  {
    label: "Trainer",
    image: "/demo/trainer-dashboard.jpg",
    eyebrow: "Trainer Dashboard",
    title: "Every coaching day starts with priorities.",
    copy: "The trainer sees who needs attention, what happened between sessions, and what action to take next.",
    chips: ["Needs attention", "Quick actions", "Between-session visibility"]
  },
  {
    label: "Owner",
    image: "/demo/owner-dashboard.jpg",
    eyebrow: "Owner Command Center",
    title: "Owners see business actions, not just analytics.",
    copy: "Revenue, retention, trainer follow-up, and member health all surface in plain language.",
    chips: ["Business brief", "Retention watch", "Upgrade opportunities"]
  },
  {
    label: "Ascend",
    image: null,
    eyebrow: "The Other 166 Hours",
    title: "Ascend extends coaching between sessions.",
    copy: "Members stay accountable. Trainers stay informed. Owners stay in control.",
    chips: ["Members", "Trainers", "Owners"]
  }
] as const;

const totalDurationMs = MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0);

function sceneStartMs(sceneIndex: number) {
  return MARKETING_DEMO_SCENE_DURATIONS_MS.slice(0, sceneIndex).reduce((total, duration) => total + duration, 0);
}

function DemoScene({ sceneIndex, sceneProgress }: { sceneIndex: number; sceneProgress: number }) {
  const scene = demoScenes[sceneIndex] ?? demoScenes[0];

  if (!scene.image) {
    return (
      <div className="ascend-demo-enter grid h-full place-items-center px-2 text-center">
        <div className="w-full max-w-md">
          <div className="grid grid-cols-3 gap-3">
            {demoScenes.slice(0, 6).map((item, index) => (
              <div key={item.label} className={`overflow-hidden rounded-2xl border border-line bg-[#0c1018] ${index === 1 ? "translate-y-5" : ""}`}>
                <div className="relative aspect-[9/16]">
                  <Image src={item.image!} alt={item.title} fill sizes="25vw" className="object-cover object-top opacity-90" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-3xl border border-lime/20 bg-[radial-gradient(circle_at_top,rgba(53,242,208,0.16),transparent_45%),rgba(11,14,20,0.92)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-lime">{scene.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-white">{scene.title}</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-zinc-300">{scene.copy}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {scene.chips.map((chip) => (
                <span key={chip} className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-medium text-zinc-300">
                  {chip}
                </span>
              ))}
            </div>
            <Link href="https://www.getascend.fit/login" className="mx-auto mt-6 flex h-12 max-w-xs items-center justify-center gap-2 rounded-xl bg-lime px-5 font-bold text-ink">
              Open Ascend <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const zoom = 1 + sceneProgress * 0.03;
  const shiftY = (sceneProgress - 0.5) * -18;

  return (
    <div className="ascend-demo-enter relative h-full overflow-hidden rounded-[32px] border border-line bg-[#090c12]">
      <div className="absolute inset-0">
        <Image
          src={scene.image}
          alt={scene.title}
          fill
          priority={sceneIndex < 2}
          sizes="(max-width: 768px) 100vw, 420px"
          className="object-contain object-top transition-transform duration-700 ease-out"
          style={{ transform: `translateY(${shiftY}px) scale(${zoom})` }}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black via-black/65 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black via-black/82 to-transparent" />
      <div className="absolute inset-x-4 top-4 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur-md">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-lime">{scene.eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{scene.title}</h2>
      </div>
      <div className="absolute inset-x-4 bottom-4 rounded-[28px] border border-white/10 bg-black/58 p-4 backdrop-blur-md">
        <p className="text-sm leading-6 text-zinc-200">{scene.copy}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {scene.chips.map((chip) => (
            <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-200">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AscendDemoExperience() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recordingMode, setRecordingMode] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const startedAtRef = useRef(0);
  const elapsedAtPlayRef = useRef(0);
  const elapsedRef = useRef(0);
  const frame = getMarketingDemoFrame(elapsedMs);

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

  const jumpTo = (sceneIndex: number) => {
    const nextElapsedMs = sceneStartMs(sceneIndex);
    setElapsedMs(nextElapsedMs);
    elapsedRef.current = nextElapsedMs;
    elapsedAtPlayRef.current = nextElapsedMs;
    startedAtRef.current = Date.now();
    setShowIntro(false);
  };

  const move = (direction: number) => jumpTo((frame.sceneIndex + direction + demoScenes.length) % demoScenes.length);
  const replay = () => {
    elapsedRef.current = 0;
    setElapsedMs(0);
    setPlaying(true);
    setShowIntro(false);
  };

  return (
    <main className={`min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(53,242,208,0.08),transparent_25%),linear-gradient(180deg,#06080d,#080b10_45%,#05070b)] text-white ${recordingMode ? "grid place-items-center" : ""}`}>
      {!recordingMode && (
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-7">
          <Link href="https://www.getascend.fit" className="flex items-center gap-3" aria-label="Ascend home">
            <BrandMark size="sm" />
            <span className="text-lg font-semibold">Ascend</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/demo?record=1" className="hidden h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-zinc-200 sm:flex">
              <Video size={16} /> Recording view
            </Link>
            <Link href="https://www.getascend.fit/login" className="flex h-11 items-center rounded-lg border border-line px-3 text-xs font-semibold text-zinc-200">
              Open Ascend
            </Link>
          </div>
        </header>
      )}

      <div className={`${recordingMode ? "h-[100dvh] w-full max-w-[430px]" : "mx-auto grid min-h-[calc(100dvh-72px)] w-full max-w-7xl items-center gap-10 px-4 pb-5 sm:px-7 lg:grid-cols-[0.82fr_1.18fr]"}`}>
        {!recordingMode && (
          <section className="mx-auto hidden w-full max-w-lg py-3 lg:block lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime">Ascend live product tour</p>
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-tight sm:text-5xl">Closer to the real product. Long enough to actually see it.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-zinc-300">
              This version uses real app captures and gives each screen more breathing room, so the demo feels like a guided product walkthrough instead of a quick teaser.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">48-second tour</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">Real screenshots</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">Member to owner story</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" onClick={() => setPlaying((value) => !value)} className="flex h-11 items-center gap-2 rounded-xl bg-lime px-4 text-sm font-bold text-ink">
                {playing ? <Pause size={17} /> : <Play size={17} />}
                {playing ? "Pause" : "Play"}
              </button>
              <button type="button" onClick={replay} className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-zinc-200">
                <RefreshCw size={17} /> Replay
              </button>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Demo scenes">
              {demoScenes.map((scene, index) => (
                <button
                  key={scene.label}
                  type="button"
                  onClick={() => jumpTo(index)}
                  title={`Show ${scene.label}`}
                  aria-label={`Show ${scene.label} scene`}
                  className={`h-2 rounded-full transition-colors ${frame.sceneIndex === index ? "bg-lime" : "bg-line hover:bg-zinc-500"}`}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-xs text-zinc-500">
              <span>{demoScenes[frame.sceneIndex]?.label}</span>
              <span>{Math.max(1, Math.ceil((totalDurationMs - elapsedMs) / 1000))}s</span>
            </div>
          </section>
        )}

        <section className={`relative mx-auto w-full ${recordingMode ? "h-full" : "max-w-[800px]"}`} aria-live="polite">
          <div className={`${recordingMode ? "h-full" : "relative aspect-[9/16] max-h-[820px] min-h-[660px] overflow-hidden rounded-[34px] border border-line bg-[#080b10] shadow-2xl shadow-black/60 sm:aspect-[9/15]"}`}>
            <div className="absolute inset-x-0 top-0 z-20 h-1 bg-line">
              <div className="h-full bg-lime transition-[width] duration-100" style={{ width: `${frame.totalProgress * 100}%` }} />
            </div>
            <div className="flex h-full flex-col px-5 pb-5 pt-6 sm:px-7">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrandMark size="sm" />
                  <div>
                    <p className="text-sm font-semibold">Ascend</p>
                    <p className="text-[10px] text-zinc-500">Real product screenshots</p>
                  </div>
                </div>
                <span className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-zinc-400">
                  {frame.sceneIndex + 1} / {demoScenes.length}
                </span>
              </div>
              <div key={`${frame.sceneIndex}-${Math.floor(frame.sceneProgress * 3)}`} className="min-h-0 flex-1">
                <DemoScene sceneIndex={frame.sceneIndex} sceneProgress={frame.sceneProgress} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={() => move(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-zinc-300" aria-label="Previous scene">
                  <ChevronLeft size={19} />
                </button>
                <button type="button" onClick={() => setPlaying((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={playing ? "Pause demo" : "Play demo"}>
                  {playing ? <Pause size={17} /> : <Play size={17} />}
                </button>
                <button type="button" onClick={() => move(1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-zinc-300" aria-label="Next scene">
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
          </div>

          {showIntro && !recordingMode && (
            <div className="absolute inset-0 z-30 grid place-items-center rounded-[34px] bg-black/75 p-6 backdrop-blur-sm">
              <div className="max-w-sm rounded-2xl border border-line bg-surface p-5 text-center shadow-2xl">
                <button type="button" onClick={() => setShowIntro(false)} className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-line text-zinc-400" aria-label="Close introduction">
                  <X size={16} />
                </button>
                <Sparkles className="mx-auto mt-1 text-lime" size={28} />
                <h2 className="mt-3 text-2xl font-semibold">A longer, more faithful product tour.</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  This cut uses real Ascend screens and a slower pace so people can actually understand what members, trainers, and owners see.
                </p>
                <button type="button" onClick={replay} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-bold text-ink">
                  <Play size={18} /> Start demo
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
