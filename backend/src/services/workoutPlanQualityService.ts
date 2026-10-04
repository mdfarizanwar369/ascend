import type { CoachWorkoutExercise, CoachWorkoutPlan } from "../integrations/openai";
import { localDateKeyAtOffset } from "./memberTimeService";

type Pattern = "squat" | "hinge" | "push" | "pull" | "single_leg" | "core" | "cardio" | "mobility";
type Kit = "bodyweight" | "household" | "dumbbells" | "bands" | "gym" | "outdoor";
type Goal = "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "recovery" | "mobility";
type CatalogExercise = { name: string; pattern: Pattern; kit: Kit[]; reps?: string; duration?: string; note: string; advanced?: boolean; outdoorSuitable?: boolean };
export type WorkoutHistoryRow = { metadata?: Record<string, unknown> | null; created_at?: string | Date | null };
export type WorkoutBlueprint = {
  exercises: CoachWorkoutExercise[];
  focus: string;
  estimatedDurationMinutes: number;
  conservative: boolean;
  whyToday: string;
  nextSessionPreview: string;
  sessionRoadmap: Array<{ step: "Today" | "Next" | "Then"; focus: string }>;
  history: Array<{ date: string; names: string[]; patterns: Pattern[]; effort: string | null; evidence: "observed" | "completed" | "planned" }>;
};

export function workoutEngineV2Enabled(input: { globallyEnabled: boolean; ownerPilotEnabled: boolean; isPlatformOwner: boolean; provider: string }) {
  return input.provider === "gemini" && (input.globallyEnabled || input.ownerPilotEnabled && input.isPlatformOwner);
}

// Every V2 movement has a reviewed visual and coaching instructions. Keep equipment
// requirements accurate so visual coverage never overrides suitability.
export const V2_WORKOUT_CATALOG: CatalogExercise[] = [
  { name: "Bodyweight Squat", pattern: "squat", kit: ["bodyweight"], reps: "8-12", note: "Move through a comfortable range." },
  { name: "Chair Squat", pattern: "squat", kit: ["household"], reps: "8-12", note: "Tap a sturdy chair lightly before standing." },
  { name: "Wall Sit", pattern: "squat", kit: ["household"], duration: "20-40 sec", note: "Keep the hold comfortable." },
  { name: "Dumbbell Goblet Squat", pattern: "squat", kit: ["dumbbells", "gym"], reps: "8-12", note: "Keep the weight close to your chest." },
  { name: "Dumbbell Front Squat", pattern: "squat", kit: ["dumbbells", "gym"], reps: "8-10", note: "Use a controlled depth.", advanced: true },
  { name: "Standing Band Squat", pattern: "squat", kit: ["bands"], reps: "8-12", note: "Keep the band secure under both feet." },
  { name: "45-Degree Leg Press", pattern: "squat", kit: ["gym"], reps: "10-12", note: "Do not lock your knees." },
  { name: "Glute Bridge", pattern: "hinge", kit: ["bodyweight"], reps: "10-15", note: "Pause briefly at the top." },
  { name: "Single-Leg Glute Bridge", pattern: "hinge", kit: ["bodyweight"], reps: "8 each side", note: "Keep your hips level.", advanced: true },
  { name: "Dumbbell Romanian Deadlift", pattern: "hinge", kit: ["dumbbells", "gym"], reps: "8-12", note: "Hinge at the hips with a neutral back." },
  { name: "Dumbbell Floor Glute Bridge", pattern: "hinge", kit: ["dumbbells", "gym"], reps: "10-12", note: "Hold one dumbbell securely across your hips." },
  { name: "Band Good Morning", pattern: "hinge", kit: ["bands"], reps: "10-12", note: "Keep the movement controlled." },
  { name: "Cable Pull-Through", pattern: "hinge", kit: ["gym"], reps: "10-12", note: "Drive through your hips." },
  { name: "Bench Incline Push-Up", pattern: "push", kit: ["household", "gym"], reps: "6-12", note: "Use a stable bench and raise your hands higher if needed." },
  { name: "Wall Push-Up", pattern: "push", kit: ["bodyweight"], reps: "10-15", note: "Keep a straight line through your body." },
  { name: "Knee Push-Up", pattern: "push", kit: ["bodyweight"], reps: "6-12", note: "Keep your hips in line with your shoulders." },
  { name: "Push-Up", pattern: "push", kit: ["bodyweight"], reps: "6-12", note: "Stop before form breaks down.", advanced: true },
  { name: "Dumbbell Floor Press", pattern: "push", kit: ["dumbbells", "gym"], reps: "8-12", note: "Keep elbows at a comfortable angle." },
  { name: "Dumbbell Bench Press", pattern: "push", kit: ["gym"], reps: "8-12", note: "Use a weight you can control." },
  { name: "Dumbbell Shoulder Press", pattern: "push", kit: ["dumbbells", "gym"], reps: "8-12", note: "Press without leaning backward." },
  { name: "Machine Chest Press", pattern: "push", kit: ["gym"], reps: "8-12", note: "Keep shoulders down and back." },
  { name: "Standing Band Chest Press", pattern: "push", kit: ["bands"], reps: "10-15", note: "Secure the band across your upper back and press smoothly." },
  { name: "Band Overhead Shoulder Press", pattern: "push", kit: ["bands"], reps: "8-12", note: "Keep the band secure under your feet and avoid leaning back." },
  { name: "Prone W Raise", pattern: "pull", kit: ["bodyweight"], reps: "10-12", note: "Squeeze shoulder blades gently." },
  { name: "Reverse Snow Angel", pattern: "pull", kit: ["bodyweight"], reps: "8-12", note: "Move slowly and stay comfortable." },
  { name: "Bent-Over Dumbbell Row", pattern: "pull", kit: ["dumbbells", "gym"], reps: "8-12", note: "Hinge at your hips and pull both elbows toward your ribs." },
  { name: "Single-Arm Dumbbell Row", pattern: "pull", kit: ["dumbbells", "gym"], reps: "8-12 each side", note: "Brace your free hand on your thigh and keep your torso steady." },
  { name: "Band Bent-Over Row", pattern: "pull", kit: ["bands"], reps: "10-15", note: "Stand on the band and pull both elbows toward your ribs." },
  { name: "Seated Cable Row", pattern: "pull", kit: ["gym"], reps: "10-12", note: "Avoid swinging your torso." },
  { name: "Lat Pulldown", pattern: "pull", kit: ["gym"], reps: "8-12", note: "Pull to the upper chest." },
  { name: "Machine-Assisted Pull-Up", pattern: "pull", kit: ["gym"], reps: "6-10", note: "Use enough assistance to move with control.", advanced: true },
  { name: "Supported Split Squat", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Hold a stable support if needed." },
  { name: "Bodyweight Reverse Lunge", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Step back far enough to stay balanced." },
  { name: "Bodyweight Walking Lunge", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Take controlled steps and keep your balance.", advanced: true },
  { name: "Low Step-Up", pattern: "single_leg", kit: ["household"], reps: "8 each side", note: "Use a sturdy low step." },
  { name: "Dumbbell Reverse Lunge", pattern: "single_leg", kit: ["dumbbells", "gym"], reps: "8 each side", note: "Start light and stay balanced.", advanced: true },
  { name: "Dead Bug", pattern: "core", kit: ["bodyweight"], reps: "8 each side", note: "Keep your lower back comfortable." },
  { name: "Bird-Dog", pattern: "core", kit: ["bodyweight"], reps: "8 each side", note: "Reach long without twisting." },
  { name: "Forearm Side Plank", pattern: "core", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Bend the lower knee if needed.", advanced: true },
  { name: "Forearm Plank", pattern: "core", kit: ["bodyweight"], duration: "20-40 sec", note: "Breathe steadily." },
  { name: "Easy Walk", pattern: "cardio", kit: ["bodyweight", "outdoor"], duration: "8-15 min", note: "Keep a conversational pace." },
  { name: "Brisk Walk", pattern: "cardio", kit: ["bodyweight", "outdoor"], duration: "8-15 min", note: "Walk at a sustainable pace." },
  { name: "Stationary Bike", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Stay at a comfortable effort." },
  { name: "Treadmill Walk", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Use a comfortable incline." },
  { name: "March in Place", pattern: "cardio", kit: ["bodyweight"], duration: "5-10 min", note: "Move at a comfortable pace." },
  { name: "Cat-Cow", pattern: "mobility", kit: ["bodyweight"], reps: "6-10", note: "Move gently with your breath.", outdoorSuitable: false },
  { name: "Thread the Needle", pattern: "mobility", kit: ["bodyweight"], reps: "6 each side", note: "Rotate only as far as comfortable.", outdoorSuitable: false },
  { name: "Kneeling Hip Flexor Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "30 sec each side", note: "Keep the stretch gentle.", outdoorSuitable: false },
  { name: "Child's Pose", pattern: "mobility", kit: ["bodyweight"], duration: "30-60 sec", note: "Breathe slowly.", outdoorSuitable: false },
  { name: "Standing Quad Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "30 sec each side", note: "Use a wall for balance if needed." },
  { name: "Standing Calf Stretch", pattern: "mobility", kit: ["household", "gym"], duration: "30 sec each side", note: "Keep the heel down and use a stable wall." },
  { name: "Standing Torso Rotation", pattern: "mobility", kit: ["bodyweight"], reps: "6 each side", note: "Turn gently without forcing your back." },
  { name: "Standing Side Bend", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Keep both feet planted and move comfortably." },
  { name: "Standing Chest Opener", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec", note: "Open your chest gently without arching your back." },
  { name: "Standing Hamstring Hinge", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Hinge gently with a long back." },
  { name: "Standing Cross-Body Shoulder Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Support the arm gently above the elbow." },
  { name: "Standing Hip Flexor Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Keep the split stance short and your torso tall." },
  { name: "Standing Lateral Hip Shift", pattern: "mobility", kit: ["bodyweight"], reps: "6 each side", note: "Shift only as far as feels comfortable." }
];

function key(name: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^bodyweight /, "").replace(/^dumbbell /, "").replace(/^band /, "");
  // Retain history and avoid-list matching for V2 plans saved before variants
  // received precise names and reviewed illustrations.
  return ({
    "45 degree leg press": "leg press",
    "bench incline push up": "incline push up",
    "standing band chest press": "chest press",
    "bent over dumbbell row": "row",
    "band bent over row": "row",
    "standing band pallof press": "pallof press",
    "forearm side plank": "side plank",
    "kneeling hip flexor stretch": "hip flexor stretch"
  } as Record<string, string>)[normalized] ?? normalized;
}

function patternFor(name: string): Pattern | null {
  const known = V2_WORKOUT_CATALOG.find(item => key(item.name) === key(name));
  if (known) return known.pattern;
  const value = name.toLowerCase();
  if (/squat|leg press|wall sit/.test(value)) return "squat";
  if (/deadlift|good morning|glute bridge|hip thrust|pull.through/.test(value)) return "hinge";
  if (/lunge|split squat|step.up/.test(value)) return "single_leg";
  if (/push.up|chest press|bench press|overhead press/.test(value)) return "push";
  if (/row|pulldown|pull.up|chin.up/.test(value)) return "pull";
  if (/plank|dead bug|bird.dog|pallof/.test(value)) return "core";
  if (/walk|run|cycle|bike|march|cardio/.test(value)) return "cardio";
  if (/stretch|mobility|pose|cat.cow/.test(value)) return "mobility";
  return null;
}

export function summarizeWorkoutExerciseHistory(rows: WorkoutHistoryRow[], timezoneOffsetMinutes = 0) {
  return rows.map(row => {
    const metadata = row.metadata ?? {};
    const exercises = Array.isArray(metadata.exercises) ? metadata.exercises : [];
    const names = exercises.map(value => typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).name : null)
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map(value => value.trim().slice(0, 80)).slice(0, 12);
    const date = row.created_at ? new Date(row.created_at) : null;
    return {
      date: date && !Number.isNaN(date.getTime()) ? localDateKeyAtOffset(date, timezoneOffsetMinutes) : "",
      names,
      patterns: [...new Set(names.map(patternFor).filter((value): value is Pattern => value !== null))],
      effort: ["too_easy", "about_right", "too_hard"].includes(String(metadata.effortRating)) ? String(metadata.effortRating) : null,
      evidence: metadata.evidenceType === "planned" ? "planned" as const
        : metadata.evidenceType === "observed_performance" ? "observed" as const : "completed" as const
    };
  }).filter(session => session.names.length > 0).slice(0, 12);
}

function availableKit(equipment: string, location: string): Set<Kit> {
  const value = equipment.toLowerCase();
  const kit = new Set<Kit>(["bodyweight"]);
  if (/home|hotel/.test(location)) kit.add("household");
  if (/dumbbell|full gym|limited gym/.test(value)) kit.add("dumbbells");
  if (/band/.test(value)) kit.add("bands");
  if (/full gym/.test(value)) kit.add("gym");
  if (/route|park|outdoor/.test(value)) kit.add("outdoor");
  return kit;
}

function hash(value: string) {
  let result = 0;
  for (const character of value) result = (result * 31 + character.charCodeAt(0)) | 0;
  return result >>> 0;
}

function workoutGoal(value: string): Goal {
  return ["fat_loss", "muscle_gain", "strength", "general_fitness", "recovery", "mobility"].includes(value)
    ? value as Goal : "general_fitness";
}

// The same four builder answers remain sufficient. A goal changes the work
// prescribed, rather than just the wording Gemini uses to describe it.
function goalPatterns(goal: Goal, minutes: number): Pattern[] {
  const slot = minutes <= 20 ? 0 : minutes <= 30 ? 1 : minutes <= 45 ? 2 : 3;
  const prescriptions: Record<Goal, Pattern[][]> = {
    strength: [
      ["squat", "push", "pull"],
      ["squat", "hinge", "push", "pull"],
      ["squat", "push", "pull", "hinge", "core"],
      ["squat", "push", "pull", "hinge", "single_leg", "core"]
    ],
    muscle_gain: [
      ["squat", "push", "pull"],
      ["squat", "push", "pull", "hinge"],
      ["squat", "hinge", "push", "pull", "push"],
      ["squat", "hinge", "push", "pull", "push", "pull"]
    ],
    fat_loss: [
      ["squat", "push", "cardio"],
      ["squat", "push", "pull", "cardio"],
      ["squat", "hinge", "push", "pull", "cardio"],
      ["squat", "hinge", "push", "pull", "cardio", "core"]
    ],
    general_fitness: [
      ["squat", "pull", "cardio"],
      ["squat", "push", "pull", "cardio"],
      ["squat", "push", "pull", "cardio", "core"],
      ["squat", "hinge", "push", "pull", "cardio", "core"]
    ],
    recovery: [
      ["cardio", "mobility", "core"],
      ["cardio", "mobility", "mobility", "core"],
      ["cardio", "mobility", "mobility", "core"],
      ["cardio", "mobility", "mobility", "mobility", "core"]
    ],
    mobility: [
      ["mobility", "mobility", "mobility"],
      ["mobility", "mobility", "mobility", "core"],
      ["mobility", "mobility", "mobility", "mobility", "core"],
      ["mobility", "mobility", "mobility", "mobility", "mobility", "core"]
    ]
  };
  return [...prescriptions[goal][slot]];
}

export function buildWorkoutBlueprint(input: {
  goal: string;
  location: string;
  equipment: string;
  timeAvailable: string;
  recentWorkouts: WorkoutHistoryRow[];
  today?: string;
  conservative?: boolean;
  timezoneOffsetMinutes?: number;
  avoidExercises?: string[];
}): WorkoutBlueprint {
  const history = summarizeWorkoutExerciseHistory(input.recentWorkouts, input.timezoneOffsetMinutes);
  const today = input.today ?? localDateKeyAtOffset(new Date(), input.timezoneOffsetMinutes);
  const latestCompleted = history.find(session => session.evidence !== "planned");
  const latestAgeMs = latestCompleted ? Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latestCompleted.date}T00:00:00Z`) : Number.NaN;
  const latest = latestAgeMs >= 0 && latestAgeMs <= 7 * 86_400_000 ? latestCompleted : null;
  const trainedToday = latest?.date === today;
  const yesterday = localDateKeyAtOffset(new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000), 0);
  const recentTooHard = latest?.effort === "too_hard" && (latest.date === today || latest.date === yesterday);
  const requestedGoal = workoutGoal(input.goal);
  const goal: Goal = requestedGoal === "mobility" ? "mobility" : trainedToday || recentTooHard ? "recovery" : requestedGoal;
  const gentle = goal === "recovery" || goal === "mobility";
  const latestLower = latest?.patterns.filter(pattern => ["squat", "hinge", "single_leg"].includes(pattern)).length ?? 0;
  const latestUpper = latest?.patterns.filter(pattern => ["push", "pull"].includes(pattern)).length ?? 0;
  const minutes = Number.parseInt(input.timeAvailable, 10) || 30;
  const patterns = goalPatterns(goal, minutes);
  if (input.location === "outdoors" && gentle) {
    for (const [index, pattern] of patterns.entries()) {
      if (pattern === "core") patterns[index] = goal === "mobility" ? "cardio" : "mobility";
    }
  }
  // Recent completed training changes emphasis, but does not erase the goal's
  // strength/conditioning balance. Planned sessions only affect variety.
  const emphasis = !gentle && latestLower > latestUpper ? "upper"
    : !gentle && latestUpper > latestLower ? "lower" : "balanced";
  if (emphasis === "upper") {
    const lowerIndex = patterns.findIndex(pattern => ["squat", "hinge", "single_leg"].includes(pattern));
    if (lowerIndex >= 0) patterns[lowerIndex] = patterns.includes("pull") ? "push" : "pull";
  } else if (emphasis === "lower") {
    const upperIndex = patterns.findIndex(pattern => pattern === "push" || pattern === "pull");
    if (upperIndex >= 0) patterns[upperIndex] = patterns.includes("hinge") ? "single_leg" : "hinge";
  }
  const kit = availableKit(input.equipment, input.location);
  if (goal === "muscle_gain" && !kit.has("dumbbells") && !kit.has("bands") && !kit.has("gym")) {
    // Without resistance equipment, a second push/pull slot would often be a
    // near-identical or easier version of the first rather than useful volume.
    const seen = new Set<Pattern>();
    for (const [index, pattern] of patterns.entries()) {
      if ((pattern === "push" || pattern === "pull") && seen.has(pattern)) {
        patterns[index] = patterns.includes("single_leg") ? "core" : "single_leg";
      }
      seen.add(patterns[index]);
    }
  }
  const preferredKit: Kit = /full gym/.test(input.equipment.toLowerCase()) ? "gym"
    : /dumbbell|limited gym/.test(input.equipment.toLowerCase()) ? "dumbbells"
      : /band/.test(input.equipment.toLowerCase()) ? "bands" : "bodyweight";
  const avoided = new Set((input.avoidExercises ?? []).map(key));
  const selected = new Set<string>();
  const recentNames = history.slice(0, 2).flatMap(session => session.names.map(key));
  const allNames = history.flatMap(session => session.names.map(key));
  const mostRecentDay = history.find(session => session.date && session.date <= today)?.date;
  const mostRecentDayAgeMs = mostRecentDay
    ? Date.parse(`${today}T00:00:00Z`) - Date.parse(`${mostRecentDay}T00:00:00Z`)
    : Number.NaN;
  const mostRecentDayNames = new Set(mostRecentDayAgeMs >= 0 && mostRecentDayAgeMs <= 7 * 86_400_000
    ? history.filter(session => session.date === mostRecentDay).flatMap(session => session.names.map(key))
    : []);
  const availableSquats = V2_WORKOUT_CATALOG.filter(item => item.pattern === "squat" && item.kit.some(value => kit.has(value)) && (!input.conservative || !item.advanced));
  if (patterns.includes("squat") && availableSquats.length === 1 && mostRecentDayNames.has(key(availableSquats[0].name))) {
    // A single suitable squat would otherwise repeat every day. Rotate that
    // slot to another lower-body pattern, or cardio if both are already in the plan.
    patterns[patterns.indexOf("squat")] = !patterns.includes("single_leg") ? "single_leg"
      : !patterns.includes("hinge") ? "hinge" : "cardio";
  }
  const prescribe = (item: CatalogExercise): Omit<CoachWorkoutExercise, "alternatives"> => ({
    name: item.name,
    sets: item.duration ? gentle && item.pattern === "mobility" ? 2 : null : input.conservative || gentle || minutes <= 20 ? 2
      : goal === "muscle_gain" || minutes >= 45 ? 3 : 2,
    reps: goal === "strength" && !input.conservative && item.reps && ["squat", "hinge", "push", "pull", "single_leg"].includes(item.pattern)
      && item.kit.some(value => value === "dumbbells" || value === "gym")
      ? item.reps.includes("each side") ? "6-10 each side" : "6-10" : item.reps ?? null,
    duration: item.pattern === "cardio" ? minutes <= 20 ? "5-8 min" : goal === "recovery" ? "10-15 min" : minutes >= 60 ? "12-20 min" : "8-15 min" : item.duration ?? null,
    rest: item.pattern === "cardio" ? null : gentle ? "As needed" : goal === "strength" ? "90-120 sec" : goal === "fat_loss" || goal === "general_fitness" ? "45-75 sec" : "60-90 sec",
    note: item.note
  });
  const exercises = patterns.map((pattern, index) => {
    const choices = V2_WORKOUT_CATALOG.filter(item => item.pattern === pattern && item.kit.some(value => kit.has(value))
      && (input.location !== "outdoors" || item.outdoorSuitable !== false)
      && (!(input.conservative || gentle) || !item.advanced) && (goal !== "recovery" || item.name !== "Brisk Walk"));
    const ranked = choices.map(item => ({ item, score:
      (selected.has(key(item.name)) ? 1000 : 0) +
      (avoided.has(key(item.name)) ? 200 : 0) +
      // Prefer a different movement from the last training day whenever the
      // available equipment offers one. An explicit avoid still ranks higher.
      (mostRecentDayNames.has(key(item.name)) ? 90 : 0) +
      (recentNames.includes(key(item.name)) ? 35 : 0) +
      (allNames.includes(key(item.name)) ? index === 0 ? -12 : 5 : 0) +
      (!gentle && item.kit.includes(preferredKit) ? -8 : 0) +
      (hash(`${today}:${pattern}:${item.name}`) % 7)
    })).sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
    const chosen = ranked[0]?.item ?? V2_WORKOUT_CATALOG.find(item => item.pattern === pattern)!;
    selected.add(key(chosen.name));
    const alternatives = ranked.slice(1).filter(choice => !selected.has(key(choice.item.name))).slice(0, 3).map(choice => prescribe(choice.item));
    const recentAnchor = allNames.includes(key(chosen.name)) && !recentNames.includes(key(chosen.name)) && !mostRecentDayNames.has(key(chosen.name));
    return {
      ...prescribe(chosen),
      note: recentAnchor ? `Familiar movement to build consistency. ${chosen.note}` : chosen.note,
      alternatives
    };
  });
  const focus = goal === "recovery" ? "Recovery and mobility" : goal === "mobility" ? "Mobility and range of motion"
    : emphasis === "upper" ? goal === "strength" ? "Upper body strength" : goal === "muscle_gain" ? "Upper body muscle building" : "Upper body and conditioning"
      : emphasis === "lower" ? goal === "strength" ? "Lower body strength" : goal === "muscle_gain" ? "Lower body muscle building" : "Lower body and conditioning"
        : ({ strength: "Full body strength", muscle_gain: "Full body muscle building", fat_loss: "Strength and conditioning", general_fitness: "Balanced strength and cardio" } as Record<Exclude<Goal, "recovery" | "mobility">, string>)[goal];
  const goalReason: Record<Goal, string> = {
    strength: "This session emphasizes controlled strength work with time to recover between sets.",
    muscle_gain: "This session gives the major muscle groups more resistance work while keeping the movements manageable.",
    fat_loss: "This session pairs strength work with sustainable conditioning.",
    general_fitness: "This session balances strength work with aerobic movement.",
    recovery: "This session keeps the effort easy.",
    mobility: "This session focuses on comfortable movement through several joints."
  };
  const whyTodayBase = trainedToday
    ? "You already logged a workout today, so this session keeps the effort easy."
    : goal === "recovery" && recentTooHard ? "Your last workout felt too hard, so today keeps the effort easy."
    : latest && emphasis === "upper" ? "Your last session included more lower-body work, so today shifts toward upper body."
      : latest && emphasis === "lower" ? "Your last session included more upper-body work, so today shifts toward lower body."
        : history.some(session => session.evidence === "planned") ? "Today's movements rotate from the workouts Zoe recently planned for you."
          : "Today's movements match the time and equipment you chose.";
  const whyToday = `${whyTodayBase} ${goalReason[goal]}`;
  const upcoming = gentle ? ["Balanced strength", "Mobility or easy cardio"]
    : focus.startsWith("Upper") ? ["Lower body and core", "Recovery and mobility"]
      : focus.startsWith("Lower") ? ["Upper body and easy conditioning", "Recovery and mobility"]
        : ["Recovery and mobility", "Strength with rotated movements"];
  return {
    exercises, focus, whyToday,
    estimatedDurationMinutes: goal === "mobility" ? minutes <= 20 ? 15 : minutes <= 30 ? 20 : minutes <= 45 ? 25 : 30
      : goal === "recovery" ? Math.min(minutes, minutes <= 30 ? 20 : minutes <= 45 ? 30 : 35) : minutes,
    conservative: input.conservative === true,
    nextSessionPreview: `Next: ${upcoming[0].toLowerCase()}. This may change with your next check-in.`,
    sessionRoadmap: [{ step: "Today", focus }, { step: "Next", focus: upcoming[0] }, { step: "Then", focus: upcoming[1] }],
    history: history.slice(0, 6)
  };
}

export function applyWorkoutBlueprint(plan: CoachWorkoutPlan, blueprint: WorkoutBlueprint): CoachWorkoutPlan {
  return {
    ...plan,
    focus: blueprint.focus,
    estimatedDurationMinutes: blueprint.estimatedDurationMinutes,
    intensity: blueprint.focus === "Recovery and mobility" || blueprint.focus === "Mobility and range of motion" ? "easy"
      : blueprint.conservative && plan.intensity === "challenging" ? "moderate" : plan.intensity,
    warmup: ["3 minutes easy walking or marching", "Gentle shoulder circles and hip hinges"],
    cooldown: ["2 minutes easy walking", "Slow breathing and gentle stretching"],
    exercises: blueprint.exercises,
    whyToday: blueprint.whyToday,
    nextSessionPreview: blueprint.nextSessionPreview,
    sessionRoadmap: blueprint.sessionRoadmap,
    experienceVersion: 2
  };
}

export function rotateWorkoutExercise(plan: CoachWorkoutPlan, index: number): CoachWorkoutPlan | null {
  if (plan.experienceVersion !== 2 || !Number.isInteger(index) || index < 0 || index >= plan.exercises.length) return null;
  const exercise = plan.exercises[index];
  const alternatives = exercise.alternatives ?? [];
  const replacementIndex = alternatives.findIndex(candidate => candidate.name && !plan.exercises.some((other, otherIndex) => otherIndex !== index && key(other.name) === key(candidate.name)));
  if (replacementIndex < 0) return null;
  const replacement = alternatives[replacementIndex];
  const next = [...plan.exercises];
  next[index] = {
    ...replacement,
    alternatives: [...alternatives.slice(replacementIndex + 1), ...alternatives.slice(0, replacementIndex), {
      name: exercise.name, sets: exercise.sets, reps: exercise.reps, duration: exercise.duration, rest: exercise.rest, note: exercise.note
    }]
  };
  return { ...plan, exercises: next };
}
