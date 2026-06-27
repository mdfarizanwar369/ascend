import { ReactNode } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

export function DelightOrb({ tone = "teal" }: { tone?: "teal" | "purple" | "lime" | "amber" }) {
  const color =
    tone === "purple" ? "from-purple-400 via-calm to-purple-500" :
    tone === "lime" ? "from-lime via-calm to-lime" :
    tone === "amber" ? "from-amber via-lime to-calm" :
    "from-calm via-lime to-purple-400";

  return (
    <div className="ascend-float relative h-16 w-16 shrink-0" aria-hidden="true">
      <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${color} opacity-25 blur-xl`} />
      <div className={`relative grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br ${color} text-ink shadow-lg shadow-calm/10`}>
        <Sparkles size={24} />
      </div>
    </div>
  );
}

export function DelightEmptyState({
  title,
  body,
  action,
  tone = "teal"
}: {
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "teal" | "purple" | "lime" | "amber";
}) {
  return (
    <div className="ascend-soft-enter rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <DelightOrb tone={tone} />
        <div className="min-w-0">
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function DelightBadge({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "purple" | "lime" | "amber" }) {
  const toneClass =
    tone === "purple" ? "border-purple-300/40 bg-purple-400/10 text-purple-100" :
    tone === "lime" ? "border-lime/40 bg-lime/10 text-lime" :
    tone === "amber" ? "border-amber/40 bg-amber/10 text-amber" :
    "border-calm/40 bg-calm/10 text-calm";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      <CheckCircle2 size={13} />
      {children}
    </span>
  );
}

export function DelightProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="h-3 overflow-hidden rounded-full bg-ink">
      <div className="ascend-progress-sheen h-full rounded-full bg-gradient-to-r from-calm via-lime to-purple-400" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
