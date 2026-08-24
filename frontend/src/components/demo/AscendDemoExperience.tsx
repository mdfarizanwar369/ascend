"use client";

import {
  Activity,
  ArrowRight,
  Award,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  MessageCircle,
  Pause,
  Play,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Video,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { getMarketingDemoFrame, MARKETING_DEMO_SCENE_DURATIONS_MS, type WorkoutDebriefView } from "@ascend/shared";
import { BrandMark } from "@/components/BrandMark";
import { CoachZoeWorkoutDebrief } from "@/components/coach/CoachZoeWorkoutDebrief";

type DemoSceneKind = "image" | "debrief" | "journey" | "body-scan" | "trainer" | "owner";

type DemoSceneDefinition = {
  label: string;
  kind: DemoSceneKind;
  image?: string;
  eyebrow: string;
  title: string;
  copy: string;
  chips: string[];
};

const demoScenes: DemoSceneDefinition[] = [
  {
    label: "Today",
    kind: "image",
    image: "/demo/member-today.png",
    eyebrow: "Today's Essentials",
    title: "One clear next action, built around your real day.",
    copy: "Fuel, Move and Recover turn daily check-ins into a calm plan that keeps Momentum understandable.",
    chips: ["Fuel · Move · Recover", "Today's focus", "Momentum"]
  },
  {
    label: "Food",
    kind: "image",
    image: "/demo/meal-log-current.png",
    eyebrow: "Food Logging",
    title: "Log a meal the way real life happens.",
    copy: "Take a photo, choose one from your gallery, or type what you ate. Ascend prepares the nutrition estimate for review.",
    chips: ["Photo AI", "Quick manual entry", "Review before save"]
  },
  {
    label: "Zoe",
    kind: "image",
    image: "/demo/coach-zoe-current.png",
    eyebrow: "Coach Zoe",
    title: "Coaching that starts with your actual history.",
    copy: "Ask about progress, consistency, meals or today's workout and get one practical next step shaped by recent data.",
    chips: ["Progress analysis", "Meal advice", "Consistency support"]
  },
  {
    label: "Workout",
    kind: "image",
    image: "/demo/workout-builder-current.png",
    eyebrow: "Workout Builder",
    title: "A workout for the time, place and equipment you have.",
    copy: "Coach Zoe uses profile details and recent training to create a concise session, then lets every exercise be checked off.",
    chips: ["Profile-aware", "History-aware", "Complete and save"]
  },
  {
    label: "Review",
    kind: "debrief",
    eyebrow: "Workout Debrief",
    title: "A saved workout becomes useful coaching evidence.",
    copy: "Zoe identifies what the session achieved, what was notable, and the most sensible consideration for next time.",
    chips: ["Evidence-led", "Recovery context", "Next-session guidance"]
  },
  {
    label: "Journey",
    kind: "journey",
    eyebrow: "Your Journey",
    title: "Progress becomes a story worth remembering and sharing.",
    copy: "Real milestones, memories, reflections and progress photos build a personal timeline instead of another statistics page.",
    chips: ["Real milestones", "Progress memories", "Share Your Ascent"]
  },
  {
    label: "Scan",
    kind: "body-scan",
    eyebrow: "Body Scan",
    title: "Body-composition reports become understandable.",
    copy: "Ascend confirms the evidence first, saves a trustworthy baseline, then compares only compatible future scans.",
    chips: ["Confirmed baseline", "Comparable scans", "Plain-language guidance"]
  },
  {
    label: "Trainer",
    kind: "trainer",
    eyebrow: "Trainer Workspace",
    title: "Every coaching day begins with who needs attention.",
    copy: "Between-session activity is summarized into priorities and clear actions, so trainers spend less time hunting for context.",
    chips: ["Needs attention", "Suggested action", "Coaching timeline"]
  },
  {
    label: "Owner",
    kind: "owner",
    eyebrow: "Owner Command Center",
    title: "Owners see what needs action today.",
    copy: "Member activity, trainer follow-up and outstanding actions become a concise business picture instead of a wall of analytics.",
    chips: ["Business picture", "Today's priorities", "Club performance"]
  }
];

const sampleDebrief: WorkoutDebriefView = {
  enabled: true,
  workoutEventId: "demo-workout",
  status: "generated",
  text:
    "Four chest-focused exercises gave you a clear push-session baseline. Your controlled lowering on machine chest press added useful time under tension. Next time, keep the same loads and aim for equally clean final reps before adding weight.",
  fallbackText: null,
  source: "ai",
  cached: true
};

const totalDurationMs = MARKETING_DEMO_SCENE_DURATIONS_MS.reduce((total, duration) => total + duration, 0);

function sceneStartMs(sceneIndex: number) {
  return MARKETING_DEMO_SCENE_DURATIONS_MS.slice(0, sceneIndex).reduce((total, duration) => total + duration, 0);
}

function ProductPanel({ children }: { children: ReactNode }) {
  return <div className="ascend-public-dark-band h-full overflow-hidden bg-[#101827] p-4 text-white">{children}</div>;
}

function SceneHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-300">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-semibold leading-tight">{title}</h3>
    </div>
  );
}

function ProductSceneFooter({ scene }: { scene: DemoSceneDefinition }) {
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-white/10 bg-[#080b12]/92 p-3 shadow-xl backdrop-blur-md">
      <p className="text-xs leading-5 text-zinc-200">{scene.copy}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {scene.chips.map((chip) => (
          <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-zinc-300">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function DebriefScene({ scene }: { scene: DemoSceneDefinition }) {
  return (
    <ProductPanel>
      <SceneHeading eyebrow="Workout saved" title="Push Strength · 45 min" />
      <div className="relative h-36 overflow-hidden rounded-2xl border border-teal-300/20">
        <Image src="/workouts/goal-strength.jpg" alt="Strength workout" fill sizes="380px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-lime text-ink"><CheckCircle2 size={22} /></span>
          <div><p className="text-sm font-semibold">Workout complete</p><p className="text-xs text-zinc-300">4 confirmed exercises · ~326 kcal</p></div>
        </div>
      </div>
      <CoachZoeWorkoutDebrief debrief={sampleDebrief} />
      <div className="mt-3 rounded-xl border border-purple-300/20 bg-purple-400/10 p-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-purple-200"><TrendingUp size={15} /> Progress intelligence</div>
        <p className="mt-2 text-sm font-semibold">Your detailed performance baseline is saved.</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">Future sessions can now be compared with evidence, not guesswork.</p>
      </div>
      <ProductSceneFooter scene={scene} />
    </ProductPanel>
  );
}

function JourneyScene({ scene }: { scene: DemoSceneDefinition }) {
  const events = [
    { icon: Dumbbell, title: "Workout reviewed by Zoe", detail: "A new push-session baseline was saved." },
    { icon: Award, title: "12-day consistency streak", detail: "Your longest rhythm so far." },
    { icon: Camera, title: "Progress photo added", detail: "A visual memory from this chapter." }
  ];
  return (
    <ProductPanel>
      <SceneHeading eyebrow="Your story" title="You're building something that lasts." />
      <div className="rounded-2xl border border-purple-300/20 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.22),transparent_45%),#0a0d14] p-4">
        <div className="flex items-center justify-between"><div><p className="text-xs text-zinc-400">Biggest achievement</p><p className="mt-1 text-2xl font-semibold">12-day streak</p></div><Award className="text-purple-300" size={34} /></div>
        <p className="mt-3 text-xs leading-5 text-zinc-300">Small check-ins became your most consistent stretch yet.</p>
      </div>
      <div className="mt-3 space-y-2">
        {events.map(({ icon: Icon, title, detail }) => (
          <div key={title} className="flex gap-3 rounded-xl border border-white/8 bg-[#080b12] p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-400/12 text-purple-300"><Icon size={17} /></span>
            <div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-zinc-400">{detail}</p></div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-lime/20 bg-lime/8 p-3">
        <div><p className="text-sm font-semibold">Share Your Ascent</p><p className="text-xs text-zinc-400">Create a story from your progress.</p></div>
        <span className="grid h-10 w-10 place-items-center rounded-full bg-lime text-ink"><Share2 size={18} /></span>
      </div>
      <ProductSceneFooter scene={scene} />
    </ProductPanel>
  );
}

function BodyScanScene({ scene }: { scene: DemoSceneDefinition }) {
  return (
    <ProductPanel>
      <SceneHeading eyebrow="Ascend DNA" title="Your body-composition baseline" />
      <div className="rounded-2xl border border-purple-300/25 bg-[radial-gradient(circle_at_top_right,rgba(53,242,208,0.14),transparent_42%),#090d14] p-4">
        <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-400">Body progress score</p><p className="mt-2 text-lg font-semibold">Baseline saved</p></div><span className="grid h-20 w-20 place-items-center rounded-full border-4 border-lime/70 text-2xl font-semibold">95</span></div>
        <p className="mt-3 text-xs leading-5 text-zinc-400">Confirmed from the uploaded report. No change claims are made until a compatible follow-up scan exists.</p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[["Weight", "73.9 kg"], ["Body fat", "15.4%"], ["Muscle", "34.9 kg"]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/8 bg-[#080b12] p-3"><p className="text-[10px] text-zinc-500">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p><p className="mt-2 text-[9px] text-lime">Confirmed</p></div>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-white/8 bg-[#080b12] p-3">
        <div className="flex items-center gap-2"><Activity className="text-lime" size={17} /><p className="text-sm font-semibold">Comparison intelligence</p></div>
        <p className="mt-2 text-xs leading-5 text-zinc-400">Your next comparable scan will show meaningful changes in fat, muscle and weight.</p>
      </div>
      <ProductSceneFooter scene={scene} />
    </ProductPanel>
  );
}

function TrainerScene({ scene }: { scene: DemoSceneDefinition }) {
  const clients = [
    { initials: "SM", name: "Samira", signal: "No movement for 5 days", action: "Send a check-in" },
    { initials: "MK", name: "Marcus", signal: "Protein below target for 3 days", action: "Review meals" },
    { initials: "EL", name: "Elena", signal: "Goal milestone reached", action: "Send praise" }
  ];
  return (
    <ProductPanel>
      <SceneHeading eyebrow="Today's priorities" title="3 clients need attention" />
      <div className="grid grid-cols-3 gap-2">
        {[["Clients", "17"], ["Check-ins", "3"], ["Wins", "2"]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/8 bg-[#080b12] p-3"><p className="text-xl font-semibold">{value}</p><p className="text-[10px] text-zinc-500">{label}</p></div>)}
      </div>
      <div className="mt-3 space-y-2">
        {clients.map((client, index) => (
          <div key={client.name} className={`rounded-xl border p-3 ${index === 0 ? "border-amber-300/30 bg-amber-300/8" : "border-white/8 bg-[#080b12]"}`}>
            <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-400/15 text-xs font-semibold text-purple-200">{client.initials}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{client.name}</p><span className="text-[10px] text-zinc-500">Today</span></div><p className="mt-1 text-xs text-zinc-300">{client.signal}</p><p className="mt-2 flex items-center gap-1 text-xs font-semibold text-lime">{client.action} <ArrowRight size={12} /></p></div></div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-purple-300/20 bg-purple-400/8 p-3"><MessageCircle className="text-purple-300" size={20} /><div><p className="text-sm font-semibold">Between-session briefing</p><p className="text-xs text-zinc-400">Nutrition, hydration, workouts and Zoe interventions, summarized.</p></div></div>
      <ProductSceneFooter scene={scene} />
    </ProductPanel>
  );
}

function OwnerScene({ scene }: { scene: DemoSceneDefinition }) {
  return (
    <ProductPanel>
      <SceneHeading eyebrow="Today's business brief" title="Owner Command Center" />
      <div className="rounded-2xl border border-purple-300/25 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.22),transparent_45%),#0a0d14] p-4">
        <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-xl bg-purple-400/15 text-purple-200"><Building2 size={23} /></span><div><p className="text-sm font-semibold">Business picture: Good</p><p className="text-xs text-zinc-400">Member activity is steady. Three follow-ups need action.</p></div></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { icon: Users, label: "Members active", value: "12 / 14", tone: "text-lime" },
          { icon: HeartPulse, label: "Trainer follow-up", value: "11 / 14", tone: "text-teal-300" },
          { icon: Target, label: "Outstanding", value: "3", tone: "text-amber-300" },
          { icon: BarChart3, label: "Club health", value: "Good", tone: "text-purple-300" }
        ].map(({ icon: Icon, label, value, tone }) => <div key={label} className="rounded-xl border border-white/8 bg-[#080b12] p-3"><Icon className={tone} size={17} /><p className={`mt-2 text-lg font-semibold ${tone}`}>{value}</p><p className="text-[10px] text-zinc-500">{label}</p></div>)}
      </div>
      <div className="mt-3 rounded-xl border border-white/8 bg-[#080b12] p-3">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-400">Today's priorities</p>
        <div className="mt-2 flex items-center justify-between border-b border-white/8 py-2"><span className="text-sm">3 member follow-ups</span><ArrowRight size={15} className="text-lime" /></div>
        <div className="flex items-center justify-between py-2"><span className="text-sm">1 trainer approval</span><ArrowRight size={15} className="text-lime" /></div>
      </div>
      <ProductSceneFooter scene={scene} />
    </ProductPanel>
  );
}

function DemoScene({ sceneIndex, sceneProgress }: { sceneIndex: number; sceneProgress: number }) {
  const scene = demoScenes[sceneIndex] ?? demoScenes[0];

  if (scene.kind !== "image") {
    const customScene = {
      debrief: <DebriefScene scene={scene} />,
      journey: <JourneyScene scene={scene} />,
      "body-scan": <BodyScanScene scene={scene} />,
      trainer: <TrainerScene scene={scene} />,
      owner: <OwnerScene scene={scene} />
    }[scene.kind];
    return <div className="ascend-demo-enter relative h-full overflow-hidden rounded-[32px] border border-line bg-[#090c12]">{customScene}</div>;
  }

  const zoom = 1 + sceneProgress * 0.025;
  const shiftY = (sceneProgress - 0.5) * -14;

  return (
    <div className="ascend-demo-enter relative h-full overflow-hidden rounded-[32px] border border-line bg-[#090c12]">
      <div className="absolute inset-0"><Image src={scene.image!} alt={scene.title} fill priority={sceneIndex < 2} sizes="(max-width: 768px) 100vw, 420px" className="object-contain object-top transition-transform duration-700 ease-out" style={{ transform: `translateY(${shiftY}px) scale(${zoom})` }} /></div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/90 via-black/55 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-60 bg-gradient-to-t from-black via-black/80 to-transparent" />
      <div className="absolute inset-x-4 top-4 rounded-2xl border border-white/10 bg-black/48 px-4 py-3 backdrop-blur-md"><p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-lime">{scene.eyebrow}</p><h2 className="mt-2 text-2xl font-semibold leading-tight text-white">{scene.title}</h2></div>
      <div className="absolute inset-x-4 bottom-4 rounded-[24px] border border-white/10 bg-black/68 p-4 backdrop-blur-md"><p className="text-sm leading-6 text-zinc-200">{scene.copy}</p><div className="mt-3 flex flex-wrap gap-2">{scene.chips.map((chip) => <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-zinc-200">{chip}</span>)}</div></div>
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
    <main className={`ascend-public-dark-band min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_top,rgba(53,242,208,0.08),transparent_25%),linear-gradient(180deg,#06080d,#080b10_45%,#05070b)] text-white ${recordingMode ? "grid place-items-center" : ""}`}>
      {!recordingMode && (
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-7">
          <Link href="https://www.getascend.fit" className="flex items-center gap-3" aria-label="Ascend home"><BrandMark size="sm" /><span className="text-lg font-semibold">Ascend</span></Link>
          <div className="flex items-center gap-2"><Link href="/demo?record=1" className="hidden h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-zinc-200 sm:flex"><Video size={16} /> Recording view</Link><Link href="https://www.getascend.fit/login" className="flex h-11 items-center rounded-lg border border-line px-3 text-xs font-semibold text-zinc-200">Open Ascend</Link></div>
        </header>
      )}

      <div className={`${recordingMode ? "h-[100dvh] w-full max-w-[430px]" : "mx-auto grid min-h-[calc(100dvh-72px)] w-full max-w-7xl items-center gap-10 px-4 pb-5 sm:px-7 lg:grid-cols-[0.82fr_1.18fr]"}`}>
        {!recordingMode && (
          <section className="mx-auto hidden w-full max-w-lg py-3 lg:block lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime">Ascend live product tour</p>
            <h1 className="mt-3 text-4xl font-semibold uppercase leading-tight sm:text-5xl">See how Ascend turns daily actions into better coaching.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-zinc-300">A current walkthrough of the member journey, Coach Zoe intelligence, and the clear actions Ascend gives trainers and owners.</p>
            <div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">54-second tour</span><span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">Current product views</span><span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-zinc-300">Member to owner story</span></div>
            <div className="mt-6 flex flex-wrap gap-2"><button type="button" onClick={() => setPlaying((value) => !value)} className="flex h-11 items-center gap-2 rounded-xl bg-lime px-4 text-sm font-bold text-ink">{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? "Pause" : "Play"}</button><button type="button" onClick={replay} className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-zinc-200"><RefreshCw size={17} /> Replay</button></div>
            <div className="mt-6 grid grid-cols-9 gap-2" aria-label="Demo scenes">{demoScenes.map((scene, index) => <button key={scene.label} type="button" onClick={() => jumpTo(index)} title={`Show ${scene.label}`} aria-label={`Show ${scene.label} scene`} className={`h-2 rounded-full transition-colors ${frame.sceneIndex === index ? "bg-lime" : "bg-line hover:bg-zinc-500"}`} />)}</div>
            <div className="mt-3 flex justify-between text-xs text-zinc-500"><span>{demoScenes[frame.sceneIndex]?.label}</span><span>{Math.max(1, Math.ceil((totalDurationMs - elapsedMs) / 1000))}s</span></div>
          </section>
        )}

        <section className={`relative mx-auto w-full ${recordingMode ? "h-full" : "max-w-[800px]"}`} aria-live="polite">
          <div className={`${recordingMode ? "h-full" : "relative aspect-[9/16] max-h-[820px] min-h-[660px] overflow-hidden rounded-[34px] border border-line bg-[#080b10] shadow-2xl shadow-black/60 sm:aspect-[9/15]"}`}>
            <div className="absolute inset-x-0 top-0 z-20 h-1 bg-line"><div className="h-full bg-lime transition-[width] duration-100" style={{ width: `${frame.totalProgress * 100}%` }} /></div>
            <div className="flex h-full flex-col px-5 pb-5 pt-6 sm:px-7">
              <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><BrandMark size="sm" /><div><p className="text-sm font-semibold">Ascend</p><p className="text-[10px] text-zinc-500">Current product walkthrough</p></div></div><span className="rounded-lg border border-line bg-surface px-2 py-1 text-[10px] font-semibold text-zinc-400">{frame.sceneIndex + 1} / {demoScenes.length}</span></div>
              <div key={`${frame.sceneIndex}-${Math.floor(frame.sceneProgress * 3)}`} className="min-h-0 flex-1"><DemoScene sceneIndex={frame.sceneIndex} sceneProgress={frame.sceneProgress} /></div>
              <div className="mt-4 flex items-center justify-between"><button type="button" onClick={() => move(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-zinc-300" aria-label="Previous scene"><ChevronLeft size={19} /></button><button type="button" onClick={() => setPlaying((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full bg-white text-ink" aria-label={playing ? "Pause demo" : "Play demo"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button><button type="button" onClick={() => move(1)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface text-zinc-300" aria-label="Next scene"><ChevronRight size={19} /></button></div>
            </div>
          </div>

          {showIntro && !recordingMode && (
            <div className="absolute inset-0 z-30 grid place-items-center rounded-[34px] bg-black/75 p-6 backdrop-blur-sm">
              <div className="max-w-sm rounded-2xl border border-line bg-surface p-5 text-center shadow-2xl"><button type="button" onClick={() => setShowIntro(false)} className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-line text-zinc-400" aria-label="Close introduction"><X size={16} /></button><Sparkles className="mx-auto mt-1 text-lime" size={28} /><h2 className="mt-3 text-2xl font-semibold">See the Ascend experience as it works today.</h2><p className="mt-2 text-sm leading-6 text-zinc-300">From the member's next action to Zoe's workout review, the trainer's priorities, and the owner's business picture.</p><button type="button" onClick={replay} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-bold text-ink"><Play size={18} /> Start demo</button></div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
