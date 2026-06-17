import { ArrowRight, Bot, Building2, CheckCircle2, Dumbbell, LineChart, MessageCircle, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function HomePage() {
  const paths = [
    {
      icon: CheckCircle2,
      title: "Self-Coached",
      text: "Track food, water, weight, habits, activity, and progress with clear daily targets."
    },
    {
      icon: Bot,
      title: "AI Coach",
      text: "Get AI food estimates, nutrition guidance, weekly reports, and next-step support."
    },
    {
      icon: Dumbbell,
      title: "Human Coach",
      text: "Stay connected with a real trainer who can see progress and check in when it matters."
    }
  ];

  const trainerSignals = ["Who needs attention today", "Food and nutrition visibility", "Weight and progress trends", "Quick praise, missions, and check-ins"];
  const ownerSignals = ["Gym and trainer referral codes", "Revenue by gym and trainer", "Pilot usage and AI cost metrics"];

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold">Ascend</span>
          </Link>
          <Link href="/login" className="rounded-lg border border-line bg-surface/70 px-3 py-2 text-xs font-semibold text-zinc-100">
            Login
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="order-2 lg:order-1">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-calm">Fitness accountability for members, trainers, and gyms</p>
            <h1 className="mt-5 text-4xl font-semibold uppercase leading-tight sm:text-6xl">
              The missing link between training and results.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Ascend keeps members consistent between workouts with self-guided tracking, AI support, and human coach connection in one platform.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="flex h-14 items-center justify-center gap-2 rounded-lg bg-lime px-5 font-semibold text-ink">
                Sign up or log in
                <ArrowRight size={20} />
              </Link>
              <div className="flex h-14 items-center justify-center rounded-lg border border-line bg-surface px-5 text-sm font-medium text-zinc-300">
                Self-coached, AI-supported, or trainer-connected
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative mx-auto max-w-md">
              <div className="absolute inset-8 rounded-full bg-calm/10 blur-3xl" />
              <div className="relative rounded-lg border border-line bg-surface/70 p-5 shadow-2xl shadow-calm/10">
                <BrandMark size="lg" showWordmark />
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Today", "Next action"],
                    ["Food", "AI estimate"],
                    ["Coach", "Check-in"]
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-ink p-3 text-center">
                      <p className="text-xs text-zinc-500">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-lime">One platform, three ways to stay accountable</p>
              <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Choose the support level that fits the journey.</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-zinc-400">
              Members can start simple, unlock AI guidance, or connect with a human coach without leaving Ascend.
            </p>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {paths.map((item) => {
              const Icon = item.icon;
              const featured = item.title === "Human Coach";
              return (
                <article key={item.title} className={`rounded-lg border p-5 ${featured ? "border-lime/40 bg-lime/10" : "border-line bg-surface"}`}>
                  <Icon className={featured ? "text-lime" : "text-calm"} size={24} />
                  <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 pb-10 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-lime" size={24} />
              <h2 className="text-2xl font-semibold">Trainers see who needs attention.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Ascend turns daily member activity into clear coaching signals, so trainers know who is on track, who is drifting, and who needs a quick check-in.
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
              <h2 className="text-2xl font-semibold">Gyms get engagement and revenue visibility.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Owners can track member usage, trainer attribution, referral performance, subscriptions, and pilot signals across gyms.
            </p>
            <div className="mt-5 space-y-3">
              {ownerSignals.map((text) => (
                <div key={text} className="flex items-center gap-3 rounded-lg bg-ink p-3 text-sm text-zinc-300">
                  <LineChart className="shrink-0 text-calm" size={17} />
                  {text}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mb-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="rounded-lg border border-calm/30 bg-calm/10 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Bot className="text-calm" size={24} />
              <h2 className="text-2xl font-semibold">AI supports the coach.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Food estimates, nutrition chat, burn estimates, and weekly summaries reduce friction. Human accountability still drives trust and follow-through.
            </p>
          </article>

          <article className="rounded-lg border border-lime/30 bg-lime/10 p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <UsersRound className="text-lime" size={24} />
                  <h2 className="text-2xl font-semibold">Start with tracking. Upgrade into support.</h2>
                </div>
                <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
                  Self-coached, AI-supported, or trainer-connected. One accountability platform for staying consistent.
                </p>
              </div>
              <Link href="/login" className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-lg bg-lime px-5 font-semibold text-ink">
                Open Ascend
                <MessageCircle size={18} />
              </Link>
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
