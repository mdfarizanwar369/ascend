import type { WorkoutDebriefView } from "@ascend/shared";
import { ZoeAvatar } from "@/components/ExperienceVisuals";

export function CoachZoeWorkoutDebrief({ debrief }: { debrief: WorkoutDebriefView }) {
  if (!debrief.enabled) return null;
  const pending = debrief.status === "pending" || debrief.status === "generating";
  const copy = pending ? "Workout saved. Coach Zoe is reviewing your session..." : debrief.text ?? debrief.fallbackText;
  if (!copy) return null;

  return (
    <section
      className="mt-4 flex min-h-40 items-start gap-3 rounded-xl border border-purple-300/20 bg-purple-400/8 p-3"
      aria-label="Coach Zoe workout debrief"
      aria-live="polite"
      aria-busy={pending}
    >
      <ZoeAvatar size="sm" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-purple-200">Coach Zoe</p>
        <p className={`mt-1 text-sm leading-6 ${pending ? "text-zinc-400" : "text-zinc-200"}`}>{copy}</p>
      </div>
    </section>
  );
}
