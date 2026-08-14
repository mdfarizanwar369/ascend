import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Camera,
  Check,
  Dumbbell,
  Play,
  Sparkles,
  Target,
  TrendingUp,
  Users
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export const metadata: Metadata = {
  title: "Ascend | Fitness accountability between sessions",
  description:
    "Ascend turns meals, movement, recovery, and progress into one clear next action, with Coach Zoe and optional trainer support.",
  alternates: { canonical: "/" }
};

const dailySteps = [
  {
    icon: Camera,
    title: "Check in quickly",
    detail: "Photograph a meal, log movement, or record recovery in seconds."
  },
  {
    icon: Brain,
    title: "Understand what matters",
    detail: "Ascend reads the pattern and turns it into one useful next step."
  },
  {
    icon: TrendingUp,
    title: "See progress become a story",
    detail: "Small actions build Momentum, milestones, and a journey you can actually see."
  }
];

const memberOutcomes = [
  "A calm Today screen instead of another data-heavy dashboard",
  "Fast meal estimates from a photo or a short description",
  "Workouts adapted to your time, goal, equipment, and recent activity",
  "Progress that connects daily actions to the bigger picture"
];

const businessOutcomes = [
  {
    icon: Users,
    title: "Trainers start with context",
    detail: "See who needs attention and what happened between sessions before the next conversation begins."
  },
  {
    icon: Target,
    title: "Members stay connected",
    detail: "Clear daily actions help coaching continue after the gym session ends."
  },
  {
    icon: TrendingUp,
    title: "Owners see where to act",
    detail: "Member engagement, trainer follow-up, and growth opportunities surface in plain language."
  }
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-ink text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-lg font-semibold">Ascend</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-300 lg:flex" aria-label="Website navigation">
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#for-members" className="transition-colors hover:text-white">For members</a>
            <a href="#for-gyms" className="transition-colors hover:text-white">For gyms</a>
            <Link href="/demo" className="transition-colors hover:text-white">Product tour</Link>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle className="!h-11 !w-11" />
            <Link href="/login" className="ascend-pressable flex min-h-11 items-center rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-zinc-100 sm:px-4">
              Open Ascend
            </Link>
          </div>
        </div>
      </header>

      <section className="ascend-public-hero relative isolate min-h-[calc(100svh-9rem)] overflow-hidden border-b border-white/[0.07]">
        <Image
          src="/workouts/location-gym.jpg"
          alt="A member strength training in a modern gym"
          fill
          priority
          sizes="100vw"
          className="-z-30 object-cover object-[62%_center]"
        />
        <div className="ascend-public-hero-overlay-x absolute inset-0 -z-20 bg-[linear-gradient(90deg,rgba(7,10,15,0.98)_0%,rgba(7,10,15,0.9)_47%,rgba(7,10,15,0.38)_100%)]" />
        <div className="ascend-public-hero-overlay-y absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,10,15,0.08),rgba(7,10,15,0.2)_65%,#0f161f_100%)]" />

        <div className="mx-auto grid min-h-[calc(100svh-9rem)] w-full max-w-7xl items-center px-5 py-12 sm:px-8 lg:grid-cols-[1fr_0.72fr] lg:gap-10 lg:py-16">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-calm sm:text-sm">Fitness accountability that follows through</p>
            <h1 className="mt-4 text-5xl font-semibold leading-none text-white sm:text-7xl">Ascend</h1>
            <p className="mt-5 max-w-2xl text-3xl font-semibold leading-[1.08] text-white sm:text-5xl">
              Know what to do today. Keep going tomorrow.
            </p>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
              Ascend turns meals, movement, recovery, and progress into one clear next action. Coach Zoe supports you between sessions, and your trainer stays connected when you have one.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="ascend-pressable flex min-h-14 items-center justify-center gap-2 rounded-xl bg-lime px-6 font-bold text-ink shadow-[0_18px_40px_rgba(53,242,208,0.2)]">
                Start free <ArrowRight size={19} />
              </Link>
              <Link href="/demo" className="ascend-pressable flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/35 px-6 font-semibold text-white backdrop-blur">
                <Play size={18} /> See the real product
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-zinc-300 sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><Check className="text-lime" size={15} /> Free to start</span>
              <span className="inline-flex items-center gap-1.5"><Check className="text-lime" size={15} /> No credit card required</span>
              <span className="inline-flex items-center gap-1.5"><Check className="text-lime" size={15} /> Web and Android</span>
            </div>
          </div>

          <div className="relative hidden h-[560px] items-end justify-center lg:flex" aria-label="Coach Zoe coaching preview">
            <div className="absolute h-[530px] w-[298px] overflow-hidden rounded-[2.25rem] border border-white/25 bg-[#0b1018] shadow-[0_34px_90px_rgba(0,0,0,0.62)] ring-1 ring-black/30">
              <Image
                src="/marketing/coach.png"
                alt="Coach Zoe giving a focused daily insight and practical coaching actions"
                fill
                sizes="298px"
                className="object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="ascend-public-dark-band border-b border-line bg-[#101822] px-5 py-14 sm:px-8 sm:py-20" aria-labelledby="hours-heading">
        <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-7xl font-semibold leading-none text-calm sm:text-8xl">166</p>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">hours outside a weekly PT session</p>
          </div>
          <div>
            <h2 id="hours-heading" className="text-3xl font-semibold leading-tight sm:text-5xl">The session starts the plan. Daily life decides the result.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
              Ascend keeps the next useful action visible between workouts, without replacing the trainer or demanding perfect tracking.
            </p>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">How it works</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight sm:text-5xl">One clear next step, built from your real day.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {dailySteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="border-t border-line pt-5">
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-calm/12 text-calm"><Icon size={21} /></span>
                    <span className="text-sm font-semibold text-zinc-600">0{index + 1}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{step.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="for-members" className="border-y border-line bg-surface/35 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div className="relative mx-auto h-[520px] w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-line bg-ink shadow-[0_30px_70px_rgba(0,0,0,0.35)] sm:h-[620px]">
            <Image src="/marketing/meal.png" alt="Ascend meal logging screen with camera-based food estimation" fill sizes="(max-width: 640px) 90vw, 360px" className="object-cover object-top" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">For everyday members</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">Fitness tracking that gives something useful back.</h2>
            <p className="mt-5 text-base leading-7 text-zinc-400 sm:text-lg">
              Log what actually happened. Ascend handles the interpretation and keeps the next action practical.
            </p>
            <ul className="mt-7 space-y-4">
              {memberOutcomes.map((outcome) => (
                <li key={outcome} className="flex gap-3 text-sm leading-6 text-zinc-300 sm:text-base">
                  <Check className="mt-1 shrink-0 text-lime" size={17} /> {outcome}
                </li>
              ))}
            </ul>
            <Link href="/login" className="ascend-pressable mt-8 inline-flex min-h-12 items-center gap-2 rounded-xl bg-lime px-5 font-semibold text-ink">
              Create your account <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 sm:py-24" aria-labelledby="zoe-heading">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Coach Zoe</p>
            <h2 id="zoe-heading" className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">Useful coaching, shaped by what you have actually done.</h2>
            <p className="mt-5 text-base leading-7 text-zinc-400 sm:text-lg">
              Ask a question, understand your progress, or generate a workout that fits your available time and equipment.
            </p>
          </div>
          <div className="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0">
            <figure className="w-[82vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-line bg-surface shadow-soft sm:w-auto">
              <div className="relative aspect-[4/5]"><Image src="/marketing/coach.png" alt="Coach Zoe quick coaching actions" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover object-top" /></div>
              <figcaption className="border-t border-line px-5 py-4 text-sm text-zinc-400"><Sparkles className="mr-2 inline text-calm" size={16} /> One coaching insight at a time.</figcaption>
            </figure>
            <figure className="w-[82vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-line bg-surface shadow-soft sm:w-auto">
              <div className="relative aspect-[4/5]"><Image src="/marketing/workout.png" alt="A personalized workout generated by Coach Zoe" fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover object-top" /></div>
              <figcaption className="border-t border-line px-5 py-4 text-sm text-zinc-400"><Dumbbell className="mr-2 inline text-lime" size={16} /> A workout for today, not a generic library.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section id="for-gyms" className="ascend-public-dark-band border-y border-line bg-[#101822] px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">For trainers and gyms</p>
          <h2 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight sm:text-5xl">Every coaching session can begin with evidence instead of guesswork.</h2>
          <div className="-mx-5 mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 lg:mx-0 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:overflow-visible lg:px-0 lg:pb-0">
            <div className="relative h-[420px] w-[82vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-line bg-ink lg:h-auto lg:min-h-[480px] lg:w-auto">
              <Image src="/marketing/trainer.png" alt="Ascend trainer dashboard highlighting clients who need attention" fill sizes="(max-width: 1024px) 100vw, 56vw" className="object-cover object-top" />
            </div>
            <div className="relative h-[420px] w-[82vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-line bg-ink lg:h-auto lg:min-h-[480px] lg:w-auto">
              <Image src="/marketing/owner.png" alt="Ascend owner command center showing business priorities" fill sizes="(max-width: 1024px) 100vw, 44vw" className="object-cover object-top" />
            </div>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {businessOutcomes.map((outcome) => {
              const Icon = outcome.icon;
              return (
                <article key={outcome.title} className="border-t border-white/10 pt-5">
                  <Icon className="text-calm" size={22} />
                  <h3 className="mt-4 text-lg font-semibold">{outcome.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{outcome.detail}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-line bg-surface/35 px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime">Choose your next step</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-5xl">Start for yourself or bring Ascend to your gym.</h2>
            <p className="mt-5 text-base leading-7 text-zinc-400">
              Members can begin immediately. Trainers and gym owners can request a focused product conversation for their team.
            </p>
            <Link href="/login" className="ascend-pressable mt-7 inline-flex min-h-14 items-center gap-2 rounded-xl bg-lime px-6 font-bold text-ink">
              Start free <ArrowRight size={19} />
            </Link>
          </div>
          <WaitlistForm />
        </div>
      </section>

      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <PublicFooter />
      </div>
    </main>
  );
}
