import { ArrowRight, Bot, Building2, Dumbbell, ShieldCheck, UserRoundCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function HomePage() {
  const bridgeItems = [
    {
      icon: Dumbbell,
      title: "Trainer-led",
      text: "Trainers stay close to client behavior between sessions, without replacing the human coach."
    },
    {
      icon: UserRoundCheck,
      title: "Client-supported",
      text: "Members know what to do today, log the basics, and feel guided instead of judged."
    },
    {
      icon: Building2,
      title: "Gym-enabled",
      text: "Owners create a stronger member experience while tracking referrals, usage, and recurring revenue."
    }
  ];

  return (
    <main className="min-h-screen bg-ink text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <div className="text-xl font-semibold">Ascend</div>
          </div>
          <Link href="/login" className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-zinc-200">
            Pilot login
          </Link>
        </header>

        <section className="flex flex-1 flex-col justify-center gap-8 py-10 text-center sm:py-14">
          <div className="mx-auto w-full max-w-xl">
            <BrandMark size="lg" showWordmark />
          </div>

          <div className="mx-auto max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-lime">Built for trainers, clients, and gym owners</p>
            <h1 className="mt-4 text-4xl font-semibold uppercase leading-tight sm:text-6xl">
              The missing link between training and results.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              Clients see their trainer a few hours each week. Ascend keeps the trainer, client, and gym connected during the other 166 hours, so the plan does not disappear when the member leaves the floor.
            </p>
          </div>

          <div className="mx-auto w-full max-w-md">
            <Link href="/login" className="flex h-14 items-center justify-center gap-2 rounded-lg bg-lime px-4 font-semibold text-ink">
              Sign up or log in
              <ArrowRight size={20} />
            </Link>
          </div>

          <div className="mx-auto grid w-full max-w-4xl gap-3 sm:grid-cols-3">
            {bridgeItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-lg border border-line bg-surface p-4 text-left">
                  <Icon className="text-lime" size={22} />
                  <h2 className="mt-4 text-lg font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 pb-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="text-lime" size={24} />
              <h2 className="text-2xl font-semibold">The trainer remains the hero.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Ascend gives trainers visibility into the parts of progress they normally cannot see: daily food choices, check-ins, weight trends, habits, and risk signals. AI helps estimate, summarize, and draft. The trainer still leads.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {["See the client between sessions", "Spot problems before check-in day", "Send better weekly guidance"].map((text) => (
                <div key={text} className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-300">
                  {text}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <Bot className="text-calm" size={24} />
              <h2 className="text-2xl font-semibold">AI is the assistant.</h2>
            </div>
            <p className="mt-4 text-base leading-7 text-zinc-300">
              Food estimates, nutrition chat, and weekly summaries reduce trainer admin work. They do not replace the relationship that drives trust and follow-through.
            </p>
          </div>
        </section>

        <section className="mb-8 rounded-lg border border-lime/30 bg-lime/10 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <UsersRound className="text-lime" size={24} />
            <h2 className="text-2xl font-semibold">Built for the first pilot gyms.</h2>
          </div>
          <p className="mt-4 text-base leading-7 text-zinc-300">
            Launching with Anytime Fitness Austin Green and Anytime Fitness Kulai Indahpura for a small pilot group of members, trainers, and owners.
          </p>
        </section>
      </div>
    </main>
  );
}
