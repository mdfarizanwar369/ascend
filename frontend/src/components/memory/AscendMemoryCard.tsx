"use client";

import { Award, CalendarDays, Sparkles } from "lucide-react";
import { AscendMemoryResponse } from "@/lib/ascendApi";

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function metricLine(metadata?: Record<string, unknown>) {
  if (!metadata) return null;
  const parts: string[] = [];
  const value = (input: unknown) => input === null || input === undefined || input === "" || !Number.isFinite(Number(input)) ? null : Number(input);
  const weightChange = value(metadata.weightChangeKg);
  const bodyFatChange = value(metadata.bodyFatChange);
  const muscleChange = value(metadata.muscleChange);
  const bestStreak = value(metadata.bestStreak);

  if (weightChange !== null) parts.push(`${weightChange > 0 ? "+" : ""}${weightChange}kg`);
  if (bodyFatChange !== null) parts.push(`Body fat ${bodyFatChange > 0 ? "+" : ""}${bodyFatChange}%`);
  if (muscleChange !== null) parts.push(`Muscle ${muscleChange > 0 ? "+" : ""}${muscleChange}kg`);
  if (bestStreak !== null) parts.push(`${bestStreak}-day best streak`);
  return parts.length ? parts.join(" · ") : null;
}

export function AscendMemoryCard({
  memory,
  compact = false
}: {
  memory: AscendMemoryResponse | null;
  compact?: boolean;
}) {
  const timeline = memory?.timeline ?? [];
  const hero = timeline.find((item) => item.reflection) ?? timeline[0] ?? null;
  const visibleTimeline = compact ? timeline.slice(0, 4) : timeline.slice(0, 8);

  if (!memory || memory.access === "none") return null;

  return (
    <section className="mt-4 rounded-2xl border border-calm/40 bg-gradient-to-br from-calm/15 via-surface to-purple-500/10 p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-calm">Ascend Memory</p>
          <h2 className="mt-1 text-xl font-semibold">Your Journey</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Ascend remembers the milestones that show how far this journey has come.
          </p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-calm text-ink">
          <Sparkles size={21} />
        </span>
      </div>

      {hero ? (
        <article className="mt-4 rounded-xl border border-white/10 bg-ink/80 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-purple-500/20 text-purple-200">
              <Award size={19} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{hero.title}</p>
              <p className="mt-1 text-xs text-zinc-500">{formatDate(hero.occurredAt)}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-200">{hero.reflection ?? hero.subtitle}</p>
              {metricLine(hero.metadata) ? <p className="mt-2 text-xs text-calm">{metricLine(hero.metadata)}</p> : null}
            </div>
          </div>
        </article>
      ) : (
        <article className="mt-4 rounded-xl border border-white/10 bg-ink/80 p-4">
          <p className="text-sm font-semibold">Journey started</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Keep logging consistently. Ascend Memory will unlock as meaningful milestones appear.</p>
        </article>
      )}

      <div className="mt-4 space-y-2">
        {visibleTimeline.map((item) => (
          <div key={item.milestoneKey} className="flex gap-3 rounded-xl bg-ink/70 p-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-calm">
              <CalendarDays size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-zinc-500">{formatDate(item.occurredAt)}</p>
              </div>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{item.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs leading-5 text-zinc-500">
        {memory.access === "free"
          ? "Free Journey shows your recent milestones and memories. Premium adds deeper reflections and longer-term pattern insights."
          : `${memory.stats.aiReflectionsThisMonth}/${memory.stats.monthlyLimit} monthly reflections used. Reflections are cached and never regenerated for the same milestone.`}
      </p>
    </section>
  );
}
