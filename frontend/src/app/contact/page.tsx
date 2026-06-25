import type { Metadata } from "next";
import { ArrowLeft, Mail, MessageCircle, ReceiptText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { PublicFooter } from "@/components/legal/PublicFooter";

export const metadata: Metadata = { title: "Support | Ascend" };

const supportItems = [
  { icon: MessageCircle, title: "Account and app help", text: "Login, onboarding, tracking, trainer connection, or account access." },
  { icon: ReceiptText, title: "Billing help", text: "Subscriptions, receipts, cancellations, duplicate charges, or refunds." },
  { icon: ShieldCheck, title: "Privacy and safety", text: "Data requests, account deletion, security concerns, or inappropriate conduct." }
];

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-ink px-5 text-white sm:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold">Ascend</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-zinc-200"
          >
            <ArrowLeft size={17} />
            Back to app
          </Link>
        </header>

        <section className="py-12 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Support</p>
          <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">How can we help?</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
            Tell us what happened and include the email used for your Ascend account. We aim to respond within two business days.
          </p>

          <a href="mailto:support@getascend.fit" className="mt-8 flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-calm px-5 font-bold text-ink sm:w-fit">
            <Mail size={20} />
            support@getascend.fit
          </a>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {supportItems.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="rounded-lg border border-line bg-surface p-5">
                  <Icon className="text-calm" size={22} />
                  <h2 className="mt-4 font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{item.text}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-8 rounded-lg border border-amber/30 bg-amber/10 p-5 text-sm leading-6 text-zinc-300">
            Ascend is not an emergency or medical service. For urgent medical concerns, contact local emergency services or a qualified healthcare professional.
          </div>
        </section>

        <PublicFooter />
      </div>
    </main>
  );
}
