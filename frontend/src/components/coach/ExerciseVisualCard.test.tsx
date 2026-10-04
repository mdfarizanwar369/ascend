import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PILOT_EXERCISE_VISUALS, resolveExerciseVisual } from "@ascend/shared";
import { ExerciseVisualCard } from "./ExerciseVisualCard";

const mocks = vi.hoisted(() => ({ event: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/ascendApi", () => ({ recordWorkoutVisualEvent: mocks.event }));
vi.mock("next/image", () => ({ default: (props: React.ComponentProps<"img">) => createElement("img", props) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("exercise visual pilot resolver", () => {
  it("matches only a reviewed exact name, alias, and capitalization variation", () => {
    expect(resolveExerciseVisual("Bodyweight Squat")).toMatchObject({ status: "resolved", match: "exact", exercise: { id: "bodyweight-squat" } });
    expect(resolveExerciseVisual("  BODYWEIGHT   SQUATS ")).toMatchObject({ status: "resolved", match: "alias", exercise: { id: "bodyweight-squat" } });
    expect(resolveExerciseVisual("Controlled Bodyweight Squats")).toMatchObject({ status: "resolved", match: "alias", exercise: { id: "bodyweight-squat" } });
    expect(resolveExerciseVisual("Child’s pose breathing")).toMatchObject({ status: "resolved", match: "alias", exercise: { id: "childs-pose" } });
    expect(resolveExerciseVisual("Forearm Plank")).toMatchObject({ status: "resolved", match: "exact", exercise: { id: "forearm-plank" } });
    expect(resolveExerciseVisual("Low Plank")).toMatchObject({ status: "resolved", match: "alias", exercise: { id: "forearm-plank" } });
    expect(resolveExerciseVisual("Bird Dog")).toMatchObject({ status: "resolved", match: "alias", exercise: { id: "bird-dog" } });
    expect(resolveExerciseVisual("Dumbbell Reverse Lunge")).toMatchObject({ status: "resolved", exercise: { id: "dumbbell-reverse-lunge" } });
    expect(resolveExerciseVisual("Seated Calf Raise (with dumbbell)")).toMatchObject({ status: "resolved", exercise: { id: "seated-dumbbell-calf-raise" } });
    expect(resolveExerciseVisual("Dumbbell Floor Glute Bridge")).toMatchObject({ status: "resolved", exercise: { id: "dumbbell-floor-glute-bridge" } });
    expect(resolveExerciseVisual("Wall Push-Ups")).toMatchObject({ status: "resolved", exercise: { id: "wall-push-up" } });
  });
  it.each([
    ["Goblet Squat", "ambiguous"],
    ["Reverse Lunge", "ambiguous"],
    ["Downward Dog to Cobra Flow", "ambiguous"],
    ["Plank", "ambiguous"],
    ["Plank Hold", "ambiguous"],
    ["Side Plank", "ambiguous"],
    ["Walking Lunge", "ambiguous"],
    ["Leg Press", "ambiguous"],
    ["Assisted Pull-Ups", "ambiguous"],
    ["Cable Tricep Pushdown", "ambiguous"],
    ["Barbell Bench Press", "ambiguous"],
    ["Kettlebell Goblet Squat", "unresolved"],
    ["Dumbbell Romanian Deadlift or Barbell Deadlift", "unresolved"],
    ["Unsupported Split Squat", "unresolved"],
    ["Single-Arm Cable Row", "unresolved"],
    ["Band Chest Press (Anchor or Standing)", "unresolved"],
    ["Incline Push-Ups (Bench or Ledge)", "unresolved"]
  ])("never substitutes %s", (name, status) => {
    expect(resolveExerciseVisual(name).status).toBe(status);
  });
  it("does not silently infer equipment or movement", () => {
    expect(resolveExerciseVisual("Bodyweight Reverse Lunge")).toMatchObject({ status: "resolved", exercise: { id: "bodyweight-reverse-lunge" } });
    expect(resolveExerciseVisual("High Plank")).toMatchObject({ status: "resolved", exercise: { id: "high-plank" } });
    expect(resolveExerciseVisual("Forearm Side Plank")).toMatchObject({ status: "resolved", exercise: { id: "forearm-side-plank" } });
    expect(resolveExerciseVisual("45 Degree Leg Press")).toMatchObject({ status: "resolved", exercise: { id: "45-degree-leg-press" } });
    expect(resolveExerciseVisual("Machine chest press")).toMatchObject({ status: "resolved", exercise: { id: "machine-chest-press" } });
    expect(resolveExerciseVisual("Bodyweight Walking Lunges")).toMatchObject({ status: "resolved", exercise: { id: "bodyweight-walking-lunge" } });
    expect(resolveExerciseVisual("Dumbbell Goblet Squats")).toMatchObject({ status: "resolved", exercise: { id: "dumbbell-goblet-squat" } });
    expect(resolveExerciseVisual("Dumbbell Goblet Squat (light weight)")).toMatchObject({ status: "resolved", exercise: { id: "dumbbell-goblet-squat" } });
    expect(resolveExerciseVisual("Lat Pulldown")).toMatchObject({ status: "resolved", exercise: { id: "lat-pulldown" } });
    expect(resolveExerciseVisual("Banded Pull-Aparts")).toMatchObject({ status: "resolved", exercise: { id: "band-pull-apart" } });
    expect(resolveExerciseVisual("Band Bent-Over Rows")).toMatchObject({ status: "resolved", exercise: { id: "band-bent-over-row" } });
    expect(resolveExerciseVisual("Standing Band Paloff Press")).toMatchObject({ status: "resolved", exercise: { id: "standing-band-pallof-press" } });
    expect(resolveExerciseVisual("Bench Step-Ups")).toMatchObject({ status: "resolved", exercise: { id: "bench-step-up" } });
    expect(resolveExerciseVisual("Cat-Cow Stretch")).toMatchObject({ status: "resolved", exercise: { id: "cat-cow" } });
    expect(resolveExerciseVisual("Australian Pull-Ups / Inverted Rows")).toMatchObject({ status: "resolved", exercise: { id: "inverted-row" } });
    expect(resolveExerciseVisual("DB Bench Press or Floor Press").status).not.toBe("resolved");
    expect(resolveExerciseVisual("Rope Tricep Pushdown").status).not.toBe("resolved");
    expect(resolveExerciseVisual("Single-Arm Dumbbell Row")).toMatchObject({ status: "resolved", exercise: { id: "single-arm-dumbbell-row" } });
  });
  it.each([null, 123, "", "a".repeat(121), { name: "Glute Bridge" }])("rejects malformed names", name => {
    expect(resolveExerciseVisual(name).status).toBe("unresolved");
  });
  it("keeps all reviewed entries unique", () => {
    expect(PILOT_EXERCISE_VISUALS.length).toBeGreaterThanOrEqual(70);
    expect(new Set(PILOT_EXERCISE_VISUALS.map(item => item.id)).size).toBe(PILOT_EXERCISE_VISUALS.length);
  });
  it("has a valid local WebP file for every approved pose", () => {
    const paths = PILOT_EXERCISE_VISUALS.flatMap(item => item.images.kind === "pair"
      ? [item.images.start, item.images.peak] : [item.images.main]);
    expect(paths.length).toBeGreaterThanOrEqual(114);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBeGreaterThanOrEqual(111);
    for (const assetPath of uniquePaths) {
      expect(assetPath).toMatch(/^\/exercise-visuals\/ascend-original-v[12345]\/[^/]+\.webp$/);
      const bytes = readFileSync(path.join(process.cwd(), "public", assetPath.replace(/^\//, "")));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    }
  });
});

describe("exercise visual card", () => {
  it("shows a single reviewed pose and Ascend ownership", () => {
    const exercise = PILOT_EXERCISE_VISUALS.find(item => item.id === "childs-pose")!;
    render(<ExerciseVisualCard exercise={exercise} />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img")).not.toHaveClass("opacity-0");
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Original Ascend exercise visual")).toBeInTheDocument();
    expect(screen.queryByText("Exercise data by RepDB")).not.toBeInTheDocument();
  });
  it("shows a reviewed start/peak floor press pair", () => {
    const exercise = PILOT_EXERCISE_VISUALS.find(item => item.id === "dumbbell-floor-press")!;
    render(<ExerciseVisualCard exercise={exercise} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("dumbbell-floor-press-start.webp"));
    expect(images[1]).toHaveAttribute("src", expect.stringContaining("dumbbell-floor-press-peak.webp"));
  });
  it("shows the Ascend push-up start and peak in order", () => {
    const exercise = PILOT_EXERCISE_VISUALS.find(item => item.id === "push-up")!;
    render(<ExerciseVisualCard exercise={exercise} />);
    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute("src", expect.stringContaining("push-up-start.webp"));
    expect(images[1]).toHaveAttribute("src", expect.stringContaining("push-up-peak.webp"));
  });
  it("keeps coaching instructions when either image fails and sends one aggregate event", () => {
    const exercise = PILOT_EXERCISE_VISUALS.find(item => item.id === "glute-bridge")!;
    render(<ExerciseVisualCard exercise={exercise} />);
    fireEvent.error(screen.getAllByRole("img")[0]);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("Position")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Illustration unavailable");
    expect(screen.getByText(exercise.instructions)).toBeInTheDocument();
    expect(screen.getByText(exercise.cue)).toBeInTheDocument();
    expect(screen.queryByText("Original Ascend exercise visual")).not.toBeInTheDocument();
    expect(mocks.event).toHaveBeenCalledWith("image_load_failure", "glute-bridge");
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });
  it("records an incorrect-mapping report without user text", () => {
    const exercise = PILOT_EXERCISE_VISUALS[0];
    render(<ExerciseVisualCard exercise={exercise} />);
    fireEvent.click(screen.getByRole("button", { name: "Report incorrect visual" }));
    expect(mocks.event).toHaveBeenCalledWith("incorrect_mapping_report", exercise.id);
  });
});
