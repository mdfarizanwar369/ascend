import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutDebriefView } from "@ascend/shared";
import { CoachZoeWorkoutDebrief } from "./CoachZoeWorkoutDebrief";

const base: WorkoutDebriefView = {
  enabled: true,
  workoutEventId: "11111111-1111-4111-8111-111111111111",
  status: "pending",
  text: null,
  fallbackText: "Workout saved. Your session has been recorded.",
  source: null,
  cached: false
};

describe("Coach Zoe workout debrief", () => {
  afterEach(cleanup);

  it("shows a calm pending state without blocking the saved workout", () => {
    render(<CoachZoeWorkoutDebrief debrief={base} />);
    expect(screen.getByRole("region", { name: "Coach Zoe workout debrief" })).toBeInTheDocument();
    expect(screen.getByText("Workout saved. Coach Zoe is reviewing your session...")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Coach Zoe workout debrief" })).toHaveAttribute("aria-busy", "true");
  });

  it("shows a cached persisted AI debrief immediately without a pending state", () => {
    render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      status: "generated",
      text: "You completed a balanced strength session. Prioritise hydration and protein, then consider a different training focus next time.",
      source: "ai",
      cached: true
    }} />);
    expect(screen.getByText(/completed a balanced strength session/i)).toBeInTheDocument();
    expect(screen.queryByText(/reviewing your session/i)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Coach Zoe workout debrief" })).toHaveAttribute("aria-busy", "false");
  });

  it("shows deterministic fallback copy when generation is unavailable", () => {
    render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      status: "fallback",
      text: base.fallbackText,
      source: "deterministic"
    }} />);
    expect(screen.getByText(base.fallbackText!)).toBeInTheDocument();
  });

  it("lets a Free member deliberately spend the weekly review on this workout", () => {
    const request = vi.fn();
    render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      status: "available",
      access: {
        tier: "free",
        mode: "select_one",
        canGenerate: true,
        dailyLimit: null,
        weeklyLimit: 1,
        dailyUsed: 0,
        weeklyUsed: 0,
        dailyRemaining: null,
        weeklyRemaining: 1,
        nextWeeklyReviewAt: null
      }
    }} onRequestReview={request} />);

    fireEvent.click(screen.getByRole("button", { name: "Review this workout with Zoe" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/weekly Coach Zoe review/i)).toBeInTheDocument();
  });

  it("keeps an automatic fair-use ceiling invisible", () => {
    const { container } = render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      status: "available",
      access: {
        tier: "premium",
        mode: "automatic",
        canGenerate: false,
        dailyLimit: 2,
        weeklyLimit: 10,
        dailyUsed: 2,
        weeklyUsed: 2,
        dailyRemaining: 0,
        weeklyRemaining: 8,
        nextWeeklyReviewAt: null
      }
    }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the server-side feature is disabled", () => {
    const { container } = render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      enabled: false,
      status: null,
      fallbackText: null
    }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
