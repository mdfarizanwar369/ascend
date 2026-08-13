import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { PublicFooter } from "@/components/legal/PublicFooter";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export function LegalPage({
  eyebrow,
  title,
  introduction,
  sections
}: {
  eyebrow: string;
  title: string;
  introduction: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-ink px-5 text-white sm:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex min-h-11 items-center gap-3" aria-label="Ascend homepage">
            <BrandMark size="sm" />
            <span className="text-xl font-semibold">Ascend</span>
          </Link>
          <Link href="/launch" className="flex h-11 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-zinc-200">
            <ArrowLeft size={17} />
            Back to Ascend
          </Link>
        </header>

        <article className="py-10 sm:py-16">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-4 text-sm text-zinc-500">Last updated: 19 June 2026</p>
          <p className="mt-7 text-lg leading-8 text-zinc-300">{introduction}</p>

          <div className="mt-12 space-y-10">
            {sections.map((section) => (
              <section key={section.title} className="border-t border-line pt-8">
                <h2 className="text-xl font-semibold text-white">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 leading-7 text-zinc-300">{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="mt-4 space-y-3 text-zinc-300">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex gap-3 leading-7">
                        <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-calm" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>

          <aside className="mt-10 rounded-lg border border-calm/30 bg-calm/10 p-5 text-sm leading-6 text-zinc-300">
            These pages provide practical information for Ascend users and are not a substitute for jurisdiction-specific legal advice.
          </aside>
        </article>

        <PublicFooter />
      </div>
    </main>
  );
}
