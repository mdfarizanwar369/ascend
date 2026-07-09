"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Dumbbell, RefreshCcw, Target } from "lucide-react";
import {
  assignTrainerHomework,
  CoachHomeworkWorkout,
  generateTrainerHomeworkPreview,
  getTrainerHomeworkAssignments,
  TrainerHomeworkAssignment
} from "@/lib/ascendApi";
import { trainerHomeworkEnabled } from "@/lib/trainerHomeworkFlag";

const locationOptions = [
  { value: "home", label: "Home" },
  { value: "commercial_gym", label: "Commercial Gym" },
  { value: "hotel_gym", label: "Hotel Gym" },
  { value: "outdoor", label: "Outdoor" },
  { value: "minimal_equipment", label: "Minimal Equipment" }
] as const;

const timeOptions = [
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" }
] as const;

const goalOptions = [
  { value: "fat_loss", label: "Fat Loss" },
  { value: "strength", label: "Strength" },
  { value: "hypertrophy", label: "Hypertrophy" },
  { value: "mobility", label: "Mobility" },
  { value: "recovery", label: "Recovery" },
  { value: "conditioning", label: "Conditioning" },
  { value: "technique", label: "Technique" },
  { value: "cardio", label: "Cardio" },
  { value: "full_body", label: "Full Body" }
] as const;

const equipmentOptions = [
  "Bodyweight",
  "Resistance Bands",
  "Dumbbells",
  "Barbell",
  "Machines",
  "Cable Machine",
  "Kettlebells",
  "Treadmill",
  "Bike",
  "Rowing Machine",
  "Functional Equipment"
] as const;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowDateString() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return next.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function sentenceCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: TrainerHomeworkAssignment["status"]) {
  if (status === "completed") return "border-lime/30 bg-lime/10 text-lime";
  if (status === "missed") return "border-amber/30 bg-amber/10 text-amber";
  return "border-calm/30 bg-calm/10 text-calm";
}

export function TrainerHomeworkPanel({ clientId }: { clientId: string }) {
  const enabled = trainerHomeworkEnabled();
  const [assignments, setAssignments] = useState<TrainerHomeworkAssignment[]>([]);
  const [summary, setSummary] = useState({ assigned: 0, completed: 0, missed: 0 });
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<CoachHomeworkWorkout | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [location, setLocation] = useState<(typeof locationOptions)[number]["value"]>("home");
  const [timeAvailable, setTimeAvailable] = useState<(typeof timeOptions)[number]["value"]>("30");
  const [goal, setGoal] = useState<(typeof goalOptions)[number]["value"]>("full_body");
  const [equipment, setEquipment] = useState<string[]>(["Bodyweight"]);
  const [assignmentDate, setAssignmentDate] = useState(todayDateString());
  const [dueDate, setDueDate] = useState(tomorrowDateString());
  const [coachNote, setCoachNote] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    async function load() {
      try {
        const response = await getTrainerHomeworkAssignments(clientId);
        if (!active) return;
        setAssignments(response.assignments);
        setSummary(response.summary);
        setStatus("");
      } catch (error) {
        if (active) {
          setStatus(error instanceof Error ? error.message : "Could not load Coach Homework yet.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [clientId, enabled]);

  const selectedEquipment = useMemo(() => equipment.join(", "), [equipment]);

  if (!enabled) return null;

  async function generatePreview() {
    setIsGenerating(true);
    setStatus("");
    try {
      const response = await generateTrainerHomeworkPreview(clientId, {
        location,
        timeAvailable,
        goal,
        equipment,
        assignmentDate,
        dueDate,
        coachNote: coachNote || null
      });
      setPreview(response.workout);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate homework right now.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function assignPreview() {
    if (!preview) return;
    setIsAssigning(true);
    setStatus("");
    try {
      const response = await assignTrainerHomework(clientId, {
        location,
        timeAvailable,
        goal,
        equipment,
        assignmentDate,
        dueDate,
        coachNote: coachNote || null,
        workout: preview
      });
      setAssignments((current) => [response.assignment, ...current]);
      setSummary((current) => ({ ...current, assigned: current.assigned + 1 }));
      setPreview(null);
      setCoachNote("");
      setAssignmentDate(todayDateString());
      setDueDate(tomorrowDateString());
      setStatus("Coach Homework assigned.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not assign homework.");
    } finally {
      setIsAssigning(false);
    }
  }

  function toggleEquipment(option: string) {
    setEquipment((current) => {
      if (current.includes(option)) {
        const next = current.filter((item) => item !== option);
        return next.length ? next : [option];
      }
      return [...current, option].slice(0, 8);
    });
  }

  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Coach Homework</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Assign Homework</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Choose the goal, time, and setup. Ascend drafts the session so your client experiences it as your coaching.
          </p>
        </div>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-calm/15 text-calm">
          <Dumbbell size={20} />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Assigned</p>
          <p className="mt-2 text-xl font-semibold text-white">{summary.assigned}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Completed</p>
          <p className="mt-2 text-xl font-semibold text-lime">{summary.completed}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Missed</p>
          <p className="mt-2 text-xl font-semibold text-amber">{summary.missed}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-white/5 bg-ink/70 p-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm text-zinc-300">
            Where will your client train?
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value as typeof location)}
              className="ascend-field ascend-select h-12 rounded-2xl border px-3 pr-10 outline-none focus:border-lime"
            >
              {locationOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">
            How much time?
            <select
              value={timeAvailable}
              onChange={(event) => setTimeAvailable(event.target.value as typeof timeAvailable)}
              className="ascend-field ascend-select h-12 rounded-2xl border px-3 pr-10 outline-none focus:border-lime"
            >
              {timeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1 text-sm text-zinc-300">
          What is today&apos;s goal?
          <select
            value={goal}
            onChange={(event) => setGoal(event.target.value as typeof goal)}
            className="ascend-field ascend-select h-12 rounded-2xl border px-3 pr-10 outline-none focus:border-lime"
          >
            {goalOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <p className="text-sm text-zinc-300">Available equipment</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {equipmentOptions.map((option) => {
              const selected = equipment.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleEquipment(option)}
                  className={`rounded-full border px-3 py-2 text-sm font-medium ${
                    selected ? "border-lime/50 bg-lime/10 text-lime" : "border-line bg-surface text-zinc-300"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{selectedEquipment}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm text-zinc-300">
            Scheduled for
            <input
              type="date"
              value={assignmentDate}
              onChange={(event) => setAssignmentDate(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-surface px-3 text-white outline-none focus:border-lime"
            />
          </label>
          <label className="grid gap-1 text-sm text-zinc-300">
            Due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-12 rounded-2xl border border-line bg-surface px-3 text-white outline-none focus:border-lime"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm text-zinc-300">
          Optional coach note
          <textarea
            value={coachNote}
            onChange={(event) => setCoachNote(event.target.value.slice(0, 150))}
            rows={2}
            placeholder="Focus on good technique."
            className="min-h-20 rounded-2xl border border-line bg-surface px-3 py-3 text-white outline-none focus:border-lime"
          />
        </label>

        <button
          type="button"
          onClick={generatePreview}
          disabled={isGenerating}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
        >
          <Target size={18} />
          {isGenerating ? "Generating..." : "Generate Homework"}
        </button>
      </div>

      {status ? <p className="mt-3 rounded-2xl border border-line bg-ink/70 p-3 text-sm text-zinc-300">{status}</p> : null}

      {preview ? (
        <div className="mt-4 rounded-2xl border border-calm/20 bg-[radial-gradient(circle_at_top_right,rgba(61,230,209,0.12),transparent_14rem),linear-gradient(180deg,rgba(18,23,33,0.98),rgba(9,12,18,0.98))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-calm">Homework Preview</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">{preview.title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{preview.intro}</p>
            </div>
            <CalendarClock className="shrink-0 text-calm" size={20} />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
              <p className="text-xs text-zinc-500">Duration</p>
              <p className="mt-1 font-semibold text-white">{preview.estimatedDurationMinutes} min</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
              <p className="text-xs text-zinc-500">Intensity</p>
              <p className="mt-1 font-semibold text-white">{sentenceCase(preview.intensity)}</p>
            </div>
            <div className="rounded-2xl border border-white/5 bg-ink/80 p-3">
              <p className="text-xs text-zinc-500">Scheduled</p>
              <p className="mt-1 font-semibold text-white">{formatDateLabel(assignmentDate)}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-ink/75 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Warm-up</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                {preview.warmup.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl bg-ink/75 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Workout</p>
              <div className="mt-2 space-y-2">
                {preview.exercises.map((exercise, index) => (
                  <div key={`${exercise.name}-${index}`} className="rounded-2xl border border-white/5 bg-surface px-3 py-3">
                    <p className="font-semibold text-white">{exercise.name}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      {[exercise.sets ? `${exercise.sets} sets` : null, exercise.reps ? `${exercise.reps} reps` : null, exercise.duration, exercise.rest ? `${exercise.rest} rest` : null]
                        .filter(Boolean)
                        .join(" / ")}
                    </p>
                    {exercise.note ? <p className="mt-2 text-xs text-zinc-500">{exercise.note}</p> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-ink/75 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Cool-down</p>
              <ul className="mt-2 space-y-1 text-sm text-zinc-200">
                {preview.cooldown.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            {coachNote ? (
              <div className="rounded-2xl border border-lime/20 bg-lime/10 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-lime">Coach note</p>
                <p className="mt-2 text-sm text-zinc-100">{coachNote}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-calm/20 bg-calm/10 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-calm">Why this suits the client</p>
              <p className="mt-2 text-sm leading-6 text-zinc-100">{preview.whyItFits}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={assignPreview}
              disabled={isAssigning}
              className="h-12 rounded-2xl bg-lime font-semibold text-ink disabled:opacity-60"
            >
              {isAssigning ? "Assigning..." : "Assign"}
            </button>
            <button
              type="button"
              onClick={generatePreview}
              disabled={isGenerating}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-calm/40 bg-calm/10 font-semibold text-calm disabled:opacity-60"
            >
              <RefreshCcw size={16} />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="h-12 rounded-2xl border border-line bg-ink font-semibold text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        <p className="text-sm font-semibold text-white">Homework History</p>
        {isLoading ? (
          <p className="rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">Loading homework history...</p>
        ) : assignments.length ? (
          assignments.slice(0, 5).map((assignment) => (
            <article key={assignment.id} className="rounded-2xl border border-white/5 bg-ink/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{assignment.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {formatDateLabel(assignment.assignment_date)} / Due {formatDateLabel(assignment.due_date)}
                  </p>
                  {assignment.completed_at ? (
                    <p className="mt-1 text-xs text-zinc-500">Completed {new Date(assignment.completed_at).toLocaleDateString([], { day: "numeric", month: "short" })}</p>
                  ) : null}
                  {assignment.coach_note ? <p className="mt-2 text-sm text-zinc-300">{assignment.coach_note}</p> : null}
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(assignment.status)}`}>
                  {sentenceCase(assignment.status)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                <span>{sentenceCase(assignment.goal)}</span>
                <span>{assignment.completion_percent}% complete</span>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-2xl bg-ink/70 p-4 text-sm leading-6 text-zinc-400">
            No homework assigned yet. The first assignment will appear here with assigned, completed, or missed status.
          </p>
        )}
      </div>
    </section>
  );
}
