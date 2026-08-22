import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
    expect(screen.getByText("Zoe is taking a quick look at what you recorded...")).toBeInTheDocument();
  });

  it("shows the persisted AI debrief", () => {
    render(<CoachZoeWorkoutDebrief debrief={{
      ...base,
      status: "generated",
      text: "You completed a balanced strength session. Prioritise hydration and protein, then consider a different training focus next time.",
      source: "ai"
    }} />);
    expect(screen.getByText(/completed a balanced strength session/i)).toBeInTheDocument();
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
