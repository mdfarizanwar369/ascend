/**
 * Reviewed RepDB free-tier visuals for Zoe's small exercise pilot.
 * An omitted exercise remains text-only. This is deliberately not a movement search index.
 */
export const EXERCISE_VISUAL_ASSET_ROOT = "/exercise-visuals/repdb-free-9ed9357";
export const EXERCISE_VISUAL_SOURCE = "https://repdb.co";

type ImageSet =
  | { kind: "pair"; start: string; peak: string }
  | { kind: "single"; main: string };

export type ExerciseVisual = {
  id: string;
  canonicalName: string;
  aliases: readonly string[];
  equipment: string;
  movementPattern: string;
  targetMuscles: string;
  repdbId: string;
  images: ImageSet;
  instructions: string;
  cue: string;
};

const image = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT}/${filename}`;

export const PILOT_EXERCISE_VISUALS: readonly ExerciseVisual[] = [
  {
    id: "bodyweight-squat", canonicalName: "Bodyweight Squat", aliases: ["Bodyweight Squats", "Controlled Bodyweight Squat", "Controlled Bodyweight Squats"],
    equipment: "Bodyweight", movementPattern: "Squat", targetMuscles: "Quads and glutes",
    repdbId: "bodyweight-squat",
    images: { kind: "pair", start: image("bodyweight-squat-start.webp"), peak: image("bodyweight-squat-peak.webp") },
    instructions: "Stand with feet about shoulder-width apart. Sit down and back, then push through your feet to stand.",
    cue: "Keep your knees tracking over your toes."
  },
  {
    id: "glute-bridge", canonicalName: "Glute Bridge", aliases: ["Glute Bridges", "Bodyweight Glute Bridges"],
    equipment: "Bodyweight", movementPattern: "Hip extension", targetMuscles: "Glutes and hamstrings",
    repdbId: "glute-bridge",
    images: { kind: "pair", start: image("glute-bridge-start.webp"), peak: image("glute-bridge-peak.webp") },
    instructions: "Lie on your back with knees bent and feet flat. Lift your hips by squeezing your glutes, then lower with control.",
    cue: "Avoid over-arching your lower back."
  },
  {
    id: "childs-pose", canonicalName: "Child's Pose", aliases: ["Child's pose breathing"],
    equipment: "Bodyweight", movementPattern: "Resting stretch", targetMuscles: "Back and hips",
    repdbId: "childs-pose",
    images: { kind: "single", main: image("childs-pose-main.webp") },
    instructions: "Kneel, sit your hips toward your heels, and reach your arms forward. Breathe steadily.",
    cue: "Ease out if your knees or shoulders feel uncomfortable."
  },
  {
    id: "bird-dog", canonicalName: "Bird-Dog", aliases: [],
    equipment: "Bodyweight", movementPattern: "Quadruped anti-rotation", targetMuscles: "Core and back",
    repdbId: "bird-dog",
    images: { kind: "pair", start: image("bird-dog-start.webp"), peak: image("bird-dog-peak.webp") },
    instructions: "Start on hands and knees. Extend the opposite arm and leg, pause, then return and switch sides.",
    cue: "Keep your hips level instead of twisting."
  },
  {
    id: "kneeling-hip-flexor-stretch", canonicalName: "Kneeling Hip Flexor Stretch",
    aliases: ["Hip Flexor Stretch (Kneeling)", "Hip Flexor Stretch (Half-Kneeling)"],
    equipment: "Bodyweight", movementPattern: "Half-kneeling hip stretch", targetMuscles: "Hip flexors",
    repdbId: "kneeling-hip-flexor-stretch",
    images: { kind: "single", main: image("kneeling-hip-flexor-stretch-main.webp") },
    instructions: "Kneel on one knee with the other foot in front. Gently shift your hips forward, then switch sides.",
    cue: "Keep your torso upright and do not arch your lower back."
  },
  {
    id: "dumbbell-romanian-deadlift", canonicalName: "Dumbbell Romanian Deadlift",
    aliases: ["Dumbbell Romanian Deadlift (light weight)"],
    equipment: "Dumbbells", movementPattern: "Hip hinge", targetMuscles: "Hamstrings and glutes",
    repdbId: "dumbbell-romanian-deadlift",
    images: { kind: "pair", start: image("dumbbell-romanian-deadlift-start.webp"), peak: image("dumbbell-romanian-deadlift-peak.webp") },
    instructions: "Hold dumbbells in front of your legs. Push your hips back with soft knees, then stand tall.",
    cue: "Keep the weights close to your legs and your back neutral."
  },
  {
    id: "standing-quad-stretch", canonicalName: "Standing Quad Stretch", aliases: [],
    equipment: "Bodyweight", movementPattern: "Quadriceps stretch", targetMuscles: "Quads",
    repdbId: "standing-quad-stretch",
    images: { kind: "single", main: image("standing-quad-stretch-main.webp") },
    instructions: "Stand tall, hold one ankle behind you, and bring your heel gently toward your glute. Switch sides.",
    cue: "Use a wall for balance if needed."
  },
  {
    id: "bodyweight-reverse-lunge", canonicalName: "Bodyweight Reverse Lunge",
    aliases: ["Bodyweight Reverse Lunges"],
    equipment: "Bodyweight", movementPattern: "Reverse lunge", targetMuscles: "Quads and glutes",
    repdbId: "bodyweight-reverse-lunge",
    images: { kind: "pair", start: image("bodyweight-reverse-lunge-start.webp"), peak: image("bodyweight-reverse-lunge-peak.webp") },
    instructions: "Step one leg backward, lower with control, then push through the front foot to stand. Switch sides.",
    cue: "Keep the front knee aligned with your toes."
  },
  {
    id: "dumbbell-bench-press", canonicalName: "Dumbbell Bench Press", aliases: [],
    equipment: "Dumbbells and flat bench", movementPattern: "Horizontal press", targetMuscles: "Chest, shoulders and triceps",
    repdbId: "db-bench-press",
    images: { kind: "pair", start: image("db-bench-press-start.webp"), peak: image("db-bench-press-peak.webp") },
    instructions: "Lie on a flat bench with a dumbbell in each hand. Press above your chest, then lower with control.",
    cue: "Keep your feet planted and wrists stacked over your elbows."
  },
  {
    id: "dumbbell-floor-press", canonicalName: "Dumbbell Floor Press",
    aliases: ["Dumbbell Floor Press (light weight)"],
    equipment: "Dumbbells", movementPattern: "Horizontal press", targetMuscles: "Chest and triceps",
    repdbId: "dumbbell-floor-press",
    // RepDB's file labels are reversed visually: the bent-elbow pose is in peak.webp.
    images: { kind: "pair", start: image("dumbbell-floor-press-peak.webp"), peak: image("dumbbell-floor-press-start.webp") },
    instructions: "Lie on the floor with knees bent. Press the dumbbells upward, then lower until your upper arms touch the floor.",
    cue: "Lower gently; do not bounce your elbows off the floor."
  },
  {
    id: "dumbbell-shoulder-press", canonicalName: "Dumbbell Shoulder Press",
    aliases: ["Dumbbell Overhead Press"],
    equipment: "Dumbbells", movementPattern: "Vertical press", targetMuscles: "Shoulders and triceps",
    repdbId: "dumbbell-shoulder-press",
    images: { kind: "pair", start: image("dumbbell-shoulder-press-start.webp"), peak: image("dumbbell-shoulder-press-peak.webp") },
    instructions: "Start with dumbbells at shoulder height. Press overhead, then lower with control.",
    cue: "Brace your core and avoid leaning back."
  },
  {
    id: "bench-hamstring-stretch", canonicalName: "Bench Hamstring Stretch",
    aliases: ["Elevated Hamstring Stretch (using bench)"],
    equipment: "Flat bench", movementPattern: "Hamstring stretch", targetMuscles: "Hamstrings",
    repdbId: "bench-hamstring-stretch",
    images: { kind: "single", main: image("bench-hamstring-stretch-main.webp") },
    instructions: "Place one heel on a stable bench with the leg straight. Hinge gently forward from your hips, then switch sides.",
    cue: "Keep your back long rather than rounding to reach farther."
  },
  {
    id: "hanging-knee-raise", canonicalName: "Hanging Knee Raise",
    aliases: ["Hanging Knee Raises (using bars, if available)"],
    equipment: "Pull-up bar", movementPattern: "Hanging core raise", targetMuscles: "Abs and hip flexors",
    repdbId: "hanging-knee-raise",
    images: { kind: "pair", start: image("hanging-knee-raise-start.webp"), peak: image("hanging-knee-raise-peak.webp") },
    instructions: "Hang from a secure bar. Raise your knees toward your chest, then lower slowly.",
    cue: "Avoid swinging to lift your legs."
  },
  {
    id: "thread-the-needle", canonicalName: "Thread the Needle", aliases: [],
    equipment: "Bodyweight", movementPattern: "Thoracic rotation stretch", targetMuscles: "Upper back and shoulders",
    repdbId: "thread-the-needle",
    images: { kind: "single", main: image("thread-the-needle-main.webp") },
    instructions: "From hands and knees, reach one arm under your body and lower that shoulder toward the floor. Switch sides.",
    cue: "Move slowly and keep your hips above your knees."
  },
  {
    id: "push-up", canonicalName: "Push-Up", aliases: ["Push-Ups", "Push Ups"],
    equipment: "Bodyweight", movementPattern: "Horizontal push", targetMuscles: "Chest, shoulders and triceps",
    repdbId: "push-up",
    // Source labels put the lowered pose in start.webp; Ascend starts in a high plank.
    images: { kind: "pair", start: image("push-up-peak.webp"), peak: image("push-up-start.webp") },
    instructions: "Begin in a high plank. Lower your chest toward the floor, then press back up.",
    cue: "Keep your body in one line; avoid letting your hips sag."
  },
  {
    id: "knee-push-up", canonicalName: "Knee Push-Up", aliases: ["Knee Push-Ups", "Knee Push Ups"],
    equipment: "Bodyweight", movementPattern: "Modified horizontal push", targetMuscles: "Chest, shoulders and triceps",
    repdbId: "knee-push-ups",
    images: { kind: "pair", start: image("knee-push-ups-start.webp"), peak: image("knee-push-ups-peak.webp") },
    instructions: "Start with knees and hands on the floor. Lower your chest, then press back to straight arms.",
    cue: "Keep a straight line from your knees to your shoulders."
  },
  {
    id: "jumping-jacks", canonicalName: "Jumping Jacks", aliases: ["Jumping Jack"],
    equipment: "Bodyweight", movementPattern: "Cardio jump", targetMuscles: "Legs and shoulders",
    repdbId: "jumping-jacks",
    images: { kind: "pair", start: image("jumping-jacks-start.webp"), peak: image("jumping-jacks-peak.webp") },
    instructions: "Jump your feet apart as your arms rise overhead, then return your feet and arms together.",
    cue: "Land softly and keep a comfortable rhythm."
  },
  {
    id: "crunch", canonicalName: "Crunch", aliases: ["Crunches", "Abdominal Crunch"],
    equipment: "Bodyweight", movementPattern: "Trunk flexion", targetMuscles: "Abs",
    repdbId: "crunches",
    images: { kind: "pair", start: image("crunches-start.webp"), peak: image("crunches-peak.webp") },
    instructions: "Lie on your back with knees bent. Curl your shoulders slightly off the floor, then lower with control.",
    cue: "Keep your neck relaxed; do not pull on your head."
  },
  {
    id: "dead-bug", canonicalName: "Dead Bug", aliases: ["Dead Bugs"],
    equipment: "Bodyweight", movementPattern: "Supine core stability", targetMuscles: "Abs and deep core",
    repdbId: "dead-bug",
    images: { kind: "pair", start: image("dead-bug-start.webp"), peak: image("dead-bug-peak.webp") },
    instructions: "On your back, hold arms up and knees bent. Extend opposite arm and leg, return, then switch sides.",
    cue: "Keep your lower back gently pressed toward the floor."
  },
  {
    id: "high-plank", canonicalName: "High Plank", aliases: ["Straight-Arm Plank"],
    equipment: "Bodyweight", movementPattern: "Straight-arm core hold", targetMuscles: "Core and shoulders",
    repdbId: "high-plank",
    images: { kind: "single", main: image("high-plank-main.webp") },
    instructions: "Hold the top of a push-up with hands beneath shoulders and body straight from head to heels.",
    cue: "Brace your core and breathe without letting your hips drop."
  },
  {
    id: "forearm-side-plank", canonicalName: "Forearm Side Plank", aliases: ["Side Plank on Forearm"],
    equipment: "Bodyweight", movementPattern: "Lateral core hold", targetMuscles: "Obliques and lateral core",
    repdbId: "side-plank",
    images: { kind: "single", main: image("side-plank-main.webp") },
    instructions: "Support your body on one forearm and the side of your feet. Lift your hips and hold, then switch sides.",
    cue: "Keep your elbow beneath your shoulder."
  },
  {
    id: "wall-sit", canonicalName: "Wall Sit", aliases: ["Wall Sits"],
    equipment: "Bodyweight and wall", movementPattern: "Isometric squat", targetMuscles: "Quads and glutes",
    repdbId: "wall-sit",
    images: { kind: "single", main: image("wall-sit-main.webp") },
    instructions: "Lean your back against a wall and slide down into a seated position. Hold, then stand up.",
    cue: "Keep your feet planted and knees tracking over your feet."
  },
  {
    id: "bodyweight-walking-lunge", canonicalName: "Bodyweight Walking Lunge", aliases: ["Bodyweight Walking Lunges"],
    equipment: "Bodyweight", movementPattern: "Traveling lunge", targetMuscles: "Quads and glutes",
    repdbId: "walking-lunge",
    images: { kind: "pair", start: image("walking-lunge-start.webp"), peak: image("walking-lunge-peak.webp") },
    instructions: "Step forward into a lunge, push through the front foot, then bring the back leg forward for the next step.",
    cue: "Keep your front knee aligned with your toes and move with control."
  },
  {
    id: "machine-chest-press", canonicalName: "Machine Chest Press", aliases: ["Chest Press Machine"],
    equipment: "Chest press machine", movementPattern: "Machine horizontal push", targetMuscles: "Chest, shoulders and triceps",
    repdbId: "chest-press-machine",
    images: { kind: "pair", start: image("chest-press-machine-start.webp"), peak: image("chest-press-machine-peak.webp") },
    instructions: "Sit against the back pad, grip the handles at chest height, press forward, then return slowly.",
    cue: "Adjust the seat so the handles line up with mid-chest."
  },
  {
    id: "seated-cable-row", canonicalName: "Seated Cable Row", aliases: ["Seated Cable Rows"],
    equipment: "Cable row machine", movementPattern: "Horizontal pull", targetMuscles: "Back and biceps",
    repdbId: "seated-cable-row",
    images: { kind: "pair", start: image("seated-cable-row-start.webp"), peak: image("seated-cable-row-peak.webp") },
    instructions: "Sit with feet supported and arms extended. Pull the handle toward your lower ribs, then extend with control.",
    cue: "Keep your chest lifted; avoid rocking your torso to move the weight."
  },
  {
    id: "45-degree-leg-press", canonicalName: "45-Degree Leg Press", aliases: ["45 Degree Leg Press"],
    equipment: "45-degree leg press machine", movementPattern: "Machine leg push", targetMuscles: "Quads and glutes",
    repdbId: "leg-press",
    images: { kind: "pair", start: image("leg-press-start.webp"), peak: image("leg-press-peak.webp") },
    instructions: "Sit in the sled with feet on the platform. Bend your knees to lower the weight, then press it away.",
    cue: "Keep hips on the seat and do not lock your knees at the top."
  },
  {
    id: "dumbbell-lateral-raise", canonicalName: "Dumbbell Lateral Raise", aliases: ["Dumbbell Lateral Raises"],
    equipment: "Dumbbells", movementPattern: "Shoulder abduction", targetMuscles: "Side shoulders",
    repdbId: "lateral-raise",
    images: { kind: "pair", start: image("lateral-raise-start.webp"), peak: image("lateral-raise-peak.webp") },
    instructions: "Stand with dumbbells at your sides. Raise your arms outward to shoulder height, then lower slowly.",
    cue: "Use a light load and avoid shrugging or swinging."
  },
  {
    id: "dumbbell-bicep-curl", canonicalName: "Dumbbell Bicep Curl", aliases: ["Dumbbell Bicep Curls", "Dumbbell Biceps Curl"],
    equipment: "Dumbbells", movementPattern: "Elbow flexion", targetMuscles: "Biceps",
    repdbId: "bicep-curl",
    images: { kind: "pair", start: image("bicep-curl-start.webp"), peak: image("bicep-curl-peak.webp") },
    instructions: "Stand with dumbbells at your sides and palms forward. Curl toward your shoulders, then lower slowly.",
    cue: "Keep your upper arms close to your sides without swinging."
  },
  {
    id: "pull-up", canonicalName: "Pull-Up", aliases: ["Pull-Ups", "Pull Ups"],
    equipment: "Pull-up bar", movementPattern: "Vertical bodyweight pull", targetMuscles: "Lats and biceps",
    repdbId: "pull-up",
    images: { kind: "pair", start: image("pull-up-start.webp"), peak: image("pull-up-peak.webp") },
    instructions: "Hang from a secure bar with an overhand grip. Pull your chin toward the bar, then lower with control.",
    cue: "Avoid swinging or craning your neck to reach the bar."
  },
  {
    id: "machine-assisted-pull-up", canonicalName: "Machine-Assisted Pull-Up", aliases: ["Machine Assisted Pull-Ups"],
    equipment: "Assisted pull-up machine", movementPattern: "Assisted vertical pull", targetMuscles: "Lats and biceps",
    repdbId: "assisted-pull-ups",
    images: { kind: "pair", start: image("assisted-pull-ups-start.webp"), peak: image("assisted-pull-ups-peak.webp") },
    instructions: "Kneel on the machine pad, grip the bar overhand, pull upward, then lower steadily.",
    cue: "Use the knee pad for support without bouncing or swinging."
  },
  {
    id: "bent-over-dumbbell-row", canonicalName: "Bent-Over Dumbbell Row", aliases: ["Two-Arm Bent-Over Dumbbell Row"],
    equipment: "Two dumbbells", movementPattern: "Unsupported horizontal pull", targetMuscles: "Upper back and lats",
    repdbId: "bent-over-db-row",
    images: { kind: "pair", start: image("bent-over-db-row-start.webp"), peak: image("bent-over-db-row-peak.webp") },
    instructions: "Hold a dumbbell in each hand and hinge at your hips. Pull both elbows back, then lower the weights.",
    cue: "Keep your back neutral and avoid lifting your chest to jerk the weights."
  },
  {
    id: "straight-bar-cable-triceps-pushdown", canonicalName: "Straight-Bar Cable Triceps Pushdown",
    aliases: ["Straight Bar Cable Triceps Pushdown"],
    equipment: "Cable machine with straight bar", movementPattern: "Elbow extension", targetMuscles: "Triceps",
    repdbId: "tricep-pushdown",
    images: { kind: "pair", start: image("tricep-pushdown-start.webp"), peak: image("tricep-pushdown-peak.webp") },
    instructions: "Grip the cable's straight bar, keep elbows near your sides, press down, then return slowly.",
    cue: "Keep your upper arms still; do not lean your body into the weight."
  }
] as const;

const reviewedNames = new Map<string, { exercise: ExerciseVisual; kind: "exact" | "alias" }>();
const knownAmbiguousNames = [
  "Goblet Squat", "Dumbbell Goblet Squat", "Dumbbell Goblet Squat (light weight)", "Reverse Lunge", "Reverse Lunges",
  "Plank", "Plank Hold", "Plank (Forearms on Bed or Floor)",
  "Bench Dips (knees bent)", "Downward Dog to Cobra Flow",
  "Dumbbell Bench Press or Floor Press", "Hamstring Stretch (Standing or Seated)",
  "Incline Push-Up", "Incline Push-ups (against a wall or sturdy surface)",
  "Incline Push-Ups (Hands on Desk or Bed)",
  "Walking Lunge", "Walking Lunges", "Side Plank", "Leg Press", "Assisted Pull-Up", "Assisted Pull-Ups",
  "Cable Tricep Pushdown", "Rope Tricep Pushdown", "Barbell Bench Press", "Bench Press", "Wall Push-Ups"
];

/** Only case, surrounding/duplicate spaces and typographic apostrophes are normalized. */
export function normalizeExerciseVisualName(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 120) return null;
  const cleaned = value.trim().replace(/\s+/g, " ").replace(/[\u2018\u2019]/g, "'");
  return cleaned && cleaned.length <= 120 ? cleaned.toLocaleLowerCase("en-US") : null;
}

for (const exercise of PILOT_EXERCISE_VISUALS) {
  for (const [name, kind] of [[exercise.canonicalName, "exact"], ...exercise.aliases.map(alias => [alias, "alias"])] as Array<[string, "exact" | "alias"]>) {
    const key = normalizeExerciseVisualName(name)!;
    if (reviewedNames.has(key)) throw new Error(`Duplicate exercise visual name: ${name}`);
    reviewedNames.set(key, { exercise, kind });
  }
}
const ambiguousNames = new Set(knownAmbiguousNames.map(name => normalizeExerciseVisualName(name)!));

export type ExerciseVisualResolution =
  | { status: "resolved"; match: "exact" | "alias"; exercise: ExerciseVisual }
  | { status: "ambiguous" | "unresolved"; match: null; exercise: null };

export function resolveExerciseVisual(name: unknown): ExerciseVisualResolution {
  const key = normalizeExerciseVisualName(name);
  if (!key) return { status: "unresolved", match: null, exercise: null };
  const reviewed = reviewedNames.get(key);
  if (reviewed) return { status: "resolved", match: reviewed.kind, exercise: reviewed.exercise };
  if (ambiguousNames.has(key)) return { status: "ambiguous", match: null, exercise: null };
  return { status: "unresolved", match: null, exercise: null };
}
