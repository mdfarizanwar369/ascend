import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  Dumbbell,
  Flame,
  HeartPulse,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function HomePage() {
  const problemCards = [
    {
      title: "Members lose momentum",
      text: "Meals, water, habits, and progress slip when nobody is guiding the hours outside the gym."
    },
    {
      title: "Trainers lose visibility",
      text: "A trainer can care deeply and still not know which client is drifting until it is too late."
    },
    {
      title: "Gyms lose follow-through",
      text: "Engagement drops when members feel alone after the session ends."
    }
  ];

  const supportLevels = [
    {
      icon: CheckCircle2,
      title: "Self-Coached",
      label: "Start simple",
      text: "Daily targets, food logs, weight, water, habits, activity, and progress tracking."
    },
    {
      icon: Bot,
      title: "AI Coach",
      label: "Get guidance",
      text: "Food estimates, meal guidance, weekly summaries, and next best actions between sessions."
    },
    {
      icon: Dumbbell,
      title: "Human Coach",
      label: "Stay connected",
      text: "A real trainer can see progress, spot risk, send praise, and check in when it matters."
    }
  ];

  const trainerSignals = ["Clients needing attention today", "Momentum drops and missed logs", "Nutrition and progress visibility", "Quick praise, missions, and check-ins"];

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(53,242,208,0.14),transparent_34rem),radial-gradient(circle_at_15%_28%,rgba(139,92,246,0.15),transparent_26rem)]" />
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:py-7">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold tracking-tight">Ascend</span>
          </Link>
          <Link href="/login" className="rounded-lg border border-line bg-surface/80 px-4 py-2 text-sm font-semibold text-zinc-100 shadow-lg shadow-black/20">
            Login
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <div>
            <p className="inline-flex rounded-full border border-calm/30 bg-calm/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-calm">
              Accountability between workouts
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold uppercase leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              The missing link between training and results.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
              People do not fail during workouts. They lose momentum between sessions. Ascend keeps the plan alive with daily actions, AI support, and trainer connection.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="flex h-14 items-center justify-center gap-2 rounded-lg bg-calm px-5 font-bold text-ink shadow-xl shadow-calm/20">
                Start Ascend
                <ArrowRight size={20} />
              </Link>
              <div className="flex min-h-14 items-center justify-center rounded-lg border border-line bg-surface/85 px-5 text-center text-sm font-semibold text-zinc-200">
                Self-coached, AI-supported, or trainer-connected
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-sm lg:max-w-md">
            <div className="absolute inset-8 rounded-full bg-calm/10 blur-3xl" />
            <div className="relative rounded-lg border border-line bg-surface/80 p-5 shadow-2xl shadow-black/30">
              <BrandMark size="lg" showWordmark />
              <div className="mt-5 rounded-lg border border-calm/30 bg-calm/10 p-4">
                <div className="flex items-start gap-3">
                  <HeartPulse className="mt-1 shrink-0 text-calm" size={22} />
                  <div>
                    <p className="text-sm font-semibold text-calm">Today&apos;s next best action</p>
                    <p className="mt-1 text-xl font-semibold text-white">Log lunch and drink 500ml water.</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  ["620", "cal left"],
                  ["48g", "protein left"],
                  ["4 days", "streak"]
                ].map(([value, label]) => (
                  <div key={label} className="rounded-lg bg-ink p-3 text-center">
                    <p className="text-lg font-semibold text-white">{value}</p>
                    <p className="mt-1 text-xs text-zinc-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="pb-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">The workout is only the beginning</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">Results are won when someone stays consistent after leaving the gym.</h2>
          </div>
          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            {problemCards.map((item) => (
              <article key={item.title} className="rounded-lg border border-line bg-surface/90 p-5">
                <Flame className="text-lime" size={22} />
                <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 pb-10 lg:grid-cols-[0.88fr_1.12fr]">
          <article className="rounded-lg border border-calm/30 bg-calm/10 p-5 sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-calm">What Ascend does</p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight">It turns daily effort into visible accountability.</h2>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Members know what to do next. Trainers know who needs attention. Gym owners see whether support is turning into engagement and retention.
            </p>
          </article>

          <div className="grid gap-3 sm:grid-cols-3">
            {supportLevels.map((item) => {
              const Icon = item.icon;
              const featured = item.title === "Human Coach";
              return (
                <article key={item.title} className={`rounded-lg border p-5 ${featured ? "border-lime/40 bg-lime/10" : "border-line bg-surface/90"}`}>
                  <Icon className={featured ? "text-lime" : "text-calm"} size={24} />
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{item.label}</p>
                  <h3 className="mt-1 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 pb-10 lg:grid-cols-2">
          <article className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-lime" size={24} />
              <h2 className="text-2xl font-semibold">Trainers see who needs attention today.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              No more guessing who is slipping. Ascend turns client activity into simple coaching signals, so trainers can act fast without creating more admin work.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {trainerSignals.map((text) => (
                <div key={text} className="flex items-start gap-2 rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-300">
                  <Sparkles className="mt-1 shrink-0 text-lime" size={16} />
                  {text}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Building2 className="text-calm" size={24} />
              <h2 className="text-2xl font-semibold">Gyms see engagement before members disappear.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Owners get visibility into active members, trainer impact, referral performance, subscriptions, and the signals that show whether accountability is working.
            </p>
            <div className="mt-5 rounded-lg border border-line bg-ink p-4">
              <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
                <span className="text-sm text-zinc-400">Member engagement</span>
                <span className="text-sm font-semibold text-calm">Visible daily</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-line py-3">
                <span className="text-sm text-zinc-400">Trainer attribution</span>
                <span className="text-sm font-semibold text-lime">Tracked</span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-3">
                <span className="text-sm text-zinc-400">Recurring revenue</span>
                <span className="text-sm font-semibold text-white">Measurable</span>
              </div>
            </div>
          </article>
        </section>

        <section className="mb-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div>
              <div className="flex items-center gap-3">
                <Bot className="text-calm" size={24} />
                <h2 className="text-2xl font-semibold">AI helps. It does not replace the coach.</h2>
              </div>
              <p className="mt-4 text-base leading-7 text-zinc-300">
                AI estimates food, suggests next steps, and summarizes progress so support feels instant. Human accountability remains the relationship that drives follow-through.
              </p>
            </div>
            <div className="rounded-lg border border-lime/30 bg-lime/10 p-5">
              <div className="flex items-center gap-3">
                <UsersRound className="text-lime" size={24} />
                <h3 className="text-2xl font-semibold">Stay accountable between workouts.</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                Whether you are training alone, using AI support, or working with a real coach, Ascend helps you keep showing up when it matters most.
              </p>
              <Link href="/login" className="mt-5 flex h-12 items-center justify-center gap-2 rounded-lg bg-lime px-5 font-bold text-ink">
                Start Ascend
                <MessageCircle size={18} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
