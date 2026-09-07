import type { WorkoutDebriefView } from "@ascend/shared";
import { ZoeAvatar } from "@/components/ExperienceVisuals";
import { englishMessage } from "@/lib/i18n/static";

export function CoachZoeWorkoutDebrief({
  debrief,
  onRequestReview,
  isRequesting = false
}: {
  debrief: WorkoutDebriefView;
  onRequestReview?: () => void;
  isRequesting?: boolean;
}) {
  if (!debrief.enabled) return null;
  const selectable = debrief.status === "available" && debrief.access?.mode === "select_one";
  const automaticAtLimit = debrief.status === "available" && debrief.access?.mode === "automatic" && !debrief.access.canGenerate;
  if (automaticAtLimit) return null;
  const pending = debrief.status === "pending" || debrief.status === "generating" || (debrief.status === "available" && debrief.access?.mode === "automatic");
  const nextReview = debrief.access?.nextWeeklyReviewAt
    ? new Date(debrief.access.nextWeeklyReviewAt).toLocaleDateString([], { day: "numeric", month: "short" })
    : null;
  const selectableCopy = debrief.access?.canGenerate
    ? "Choose this session for your weekly Coach Zoe review."
    : `Your weekly Zoe review has been used${nextReview ? `. Your next review opens ${nextReview}` : ""}.`;
  const copy = pending ? "Workout saved. Coach Zoe is reviewing your session..." : debrief.text ?? debrief.fallbackText;
  if (!copy && !selectable) return null;

  return (
    <section
      className="mt-4 flex min-h-40 items-start gap-3 rounded-xl border border-purple-300/20 bg-purple-400/8 p-3"
      aria-label={englishMessage("coach.workoutDebriefAria")}
      aria-live="polite"
      aria-busy={pending || isRequesting}
    >
      <ZoeAvatar size="sm" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-purple-200">Coach Zoe</p>
        <p className={`mt-1 text-sm leading-6 ${pending || selectable ? "text-zinc-400" : "text-zinc-200"}`}>{selectable ? selectableCopy : copy}</p>
        {selectable && debrief.access?.canGenerate && onRequestReview ? (
          <button
            type="button"
            onClick={onRequestReview}
            disabled={isRequesting}
            className="ascend-pressable mt-3 min-h-11 rounded-xl bg-purple-400/15 px-4 text-sm font-semibold text-purple-100 disabled:opacity-60"
          >
            {isRequesting ? "Zoe is reviewing..." : "Review this workout with Zoe"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
