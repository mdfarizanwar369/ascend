import Link from "next/link";
import { Camera, TrendingUp } from "lucide-react";
import { ProgressComparison } from "@/lib/ascendApi";

function displayNumber(value: number | null, suffix = "") {
  return value === null ? "--" : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

export function ProgressComparisonCard({ comparison, photoHref = "/progress" }: { comparison: ProgressComparison; photoHref?: string }) {
  if (!comparison.hasComparison) {
    const daysRemaining = Math.max(0, 30 - comparison.daysTracked);
    return (
      <section className="rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-semibold text-calm">Look how far you&apos;ve come</p>
        <h2 className="mt-1 text-xl font-semibold">Your comparison is taking shape</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Keep checking in. {daysRemaining ? `${daysRemaining} more days will build your first 30-day comparison.` : "A few more check-ins will unlock a meaningful comparison."}
        </p>
      </section>
    );
  }

  const rows = [
    comparison.baseline.weightKg !== null && comparison.current.weightKg !== null
      ? { label: "Weight", before: displayNumber(comparison.baseline.weightKg, "kg"), today: displayNumber(comparison.current.weightKg, "kg") }
      : null,
    comparison.baseline.momentum !== null && comparison.current.momentum !== null
      ? { label: "Momentum", before: displayNumber(comparison.baseline.momentum), today: displayNumber(comparison.current.momentum) }
      : null,
    { label: "Check-in days", before: `${comparison.baseline.checkinDays}/7`, today: `${comparison.current.checkinDays}/7` }
  ].filter((row): row is { label: string; before: string; today: string } => Boolean(row));

  return (
    <section className="rounded-lg border border-calm/40 bg-calm/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-calm">Look how far you&apos;ve come</p>
          <h2 className="mt-1 text-xl font-semibold">30 days ago vs today</h2>
        </div>
        <TrendingUp className="shrink-0 text-calm" size={22} />
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg bg-ink p-3 text-sm">
            <span className="text-zinc-400">{row.label}</span>
            <span className="font-medium text-zinc-300">{row.before}</span>
            <span className="font-semibold text-white">→ {row.today}</span>
          </div>
        ))}
      </div>

      {comparison.highlights.length ? (
        <div className="mt-4 space-y-2">
          {comparison.highlights.map((highlight) => (
            <p key={highlight.key} className="text-sm leading-6 text-zinc-200">
              <span className="font-semibold text-lime">{highlight.label}:</span> {highlight.message}
            </p>
          ))}
        </div>
      ) : null}

      <Link href={photoHref} className="mt-4 flex h-11 items-center justify-center rounded-lg border border-calm/40 bg-ink text-sm font-semibold text-calm">
        <Camera className="mr-2" size={18} />
        View progress photos
      </Link>
    </section>
  );
}
