/**
 * Reviewed, original Ascend visuals for Zoe's exercise pilot.
 * An omitted exercise remains text-only. This is deliberately not a movement search index.
 */
export const EXERCISE_VISUAL_ASSET_ROOT = "/exercise-visuals/ascend-original-v1";
export const EXERCISE_VISUAL_ASSET_ROOT_V2 = "/exercise-visuals/ascend-original-v2";
export const EXERCISE_VISUAL_ASSET_ROOT_V3 = "/exercise-visuals/ascend-original-v3";
export const EXERCISE_VISUAL_ASSET_ROOT_V4 = "/exercise-visuals/ascend-original-v4";
export const EXERCISE_VISUAL_ASSET_ROOT_V5 = "/exercise-visuals/ascend-original-v5";
export const EXERCISE_VISUAL_ASSET_ROOT_V6 = "/exercise-visuals/ascend-original-v6";
export const EXERCISE_VISUAL_ASSET_ROOT_V7 = "/exercise-visuals/ascend-original-v7";
export const EXERCISE_VISUAL_ASSET_ROOT_V8 = "/exercise-visuals/ascend-original-v8";
export const EXERCISE_VISUAL_ASSET_ROOT_V9 = "/exercise-visuals/ascend-original-v9";

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
  images: ImageSet;
  instructions: string;
  cue: string;
};

const image = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT}/${filename}`;
const imageV2 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V2}/${filename}`;
const imageV3 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V3}/${filename}`;
const imageV4 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V4}/${filename}`;
const imageV5 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V5}/${filename}`;
const imageV6 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V6}/${filename}`;
const imageV7 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V7}/${filename}`;
const imageV8 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V8}/${filename}`;
const imageV9 = (filename: string) => `${EXERCISE_VISUAL_ASSET_ROOT_V9}/${filename}`;

export const PILOT_EXERCISE_VISUALS: readonly ExerciseVisual[] = [
  {
    id: "bodyweight-squat", canonicalName: "Bodyweight Squat", aliases: ["Bodyweight Squats", "Controlled Bodyweight Squat", "Controlled Bodyweight Squats", "Air Squats"],
    equipment: "Bodyweight", movementPattern: "Squat", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: image("bodyweight-squat-start.webp"), peak: image("bodyweight-squat-peak.webp") },
    instructions: "Stand with feet about shoulder-width apart. Sit down and back, then push through your feet to stand.",
    cue: "Keep your knees tracking over your toes."
  },
  {
    id: "glute-bridge", canonicalName: "Glute Bridge", aliases: ["Glute Bridges", "Bodyweight Glute Bridges"],
    equipment: "Bodyweight", movementPattern: "Hip extension", targetMuscles: "Glutes and hamstrings",
    images: { kind: "pair", start: image("glute-bridge-start.webp"), peak: image("glute-bridge-peak.webp") },
    instructions: "Lie on your back with knees bent and feet flat. Lift your hips by squeezing your glutes, then lower with control.",
    cue: "Avoid over-arching your lower back."
  },
  {
    id: "childs-pose", canonicalName: "Child's Pose", aliases: ["Child's pose breathing"],
    equipment: "Bodyweight", movementPattern: "Resting stretch", targetMuscles: "Back and hips",
    images: { kind: "single", main: image("childs-pose-main.webp") },
    instructions: "Kneel, sit your hips toward your heels, and reach your arms forward. Breathe steadily.",
    cue: "Ease out if your knees or shoulders feel uncomfortable."
  },
  {
    id: "bird-dog", canonicalName: "Bird-Dog", aliases: ["Bird Dog", "Bird Dogs", "Bird-Dogs"],
    equipment: "Bodyweight", movementPattern: "Quadruped anti-rotation", targetMuscles: "Core and back",
    images: { kind: "pair", start: imageV3("bird-dog-start.webp"), peak: imageV3("bird-dog-peak.webp") },
    instructions: "Start on hands and knees. Reach one arm straight forward and the opposite leg straight back, pause, then return and switch sides.",
    cue: "Keep your hips level and back neutral; straighten the raised knee instead of doing a bent-knee kickback."
  },
  {
    id: "kneeling-hip-flexor-stretch", canonicalName: "Kneeling Hip Flexor Stretch",
    aliases: ["Hip Flexor Stretch (Kneeling)", "Hip Flexor Stretch (Half-Kneeling)"],
    equipment: "Bodyweight", movementPattern: "Half-kneeling hip stretch", targetMuscles: "Hip flexors",
    images: { kind: "single", main: image("kneeling-hip-flexor-stretch-main.webp") },
    instructions: "Kneel on one knee with the other foot in front. Gently shift your hips forward, then switch sides.",
    cue: "Keep your torso upright and do not arch your lower back."
  },
  {
    id: "dumbbell-romanian-deadlift", canonicalName: "Dumbbell Romanian Deadlift",
    aliases: ["Dumbbell Romanian Deadlift (light weight)", "Dumbbell Romanian Deadlifts", "Romanian Deadlift (Dumbbell)"],
    equipment: "Dumbbells", movementPattern: "Hip hinge", targetMuscles: "Hamstrings and glutes",
    images: { kind: "pair", start: image("dumbbell-romanian-deadlift-start.webp"), peak: image("dumbbell-romanian-deadlift-peak.webp") },
    instructions: "Hold dumbbells in front of your legs. Push your hips back with soft knees, then stand tall.",
    cue: "Keep the weights close to your legs and your back neutral."
  },
  {
    id: "standing-quad-stretch", canonicalName: "Standing Quad Stretch", aliases: [],
    equipment: "Bodyweight", movementPattern: "Quadriceps stretch", targetMuscles: "Quads",
    images: { kind: "single", main: image("standing-quad-stretch-main.webp") },
    instructions: "Stand tall, hold one ankle behind you, and bring your heel gently toward your glute. Switch sides.",
    cue: "Use a wall for balance if needed."
  },
  {
    id: "bodyweight-reverse-lunge", canonicalName: "Bodyweight Reverse Lunge",
    aliases: ["Bodyweight Reverse Lunges"],
    equipment: "Bodyweight", movementPattern: "Reverse lunge", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: image("bodyweight-reverse-lunge-start.webp"), peak: image("bodyweight-reverse-lunge-peak.webp") },
    instructions: "Step one leg backward, lower with control, then push through the front foot to stand. Switch sides.",
    cue: "Keep the front knee aligned with your toes."
  },
  {
    id: "dumbbell-bench-press", canonicalName: "Dumbbell Bench Press", aliases: [],
    equipment: "Dumbbells and flat bench", movementPattern: "Horizontal press", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: image("dumbbell-bench-press-start.webp"), peak: image("dumbbell-bench-press-peak.webp") },
    instructions: "Lie on a flat bench with a dumbbell in each hand. Press above your chest, then lower with control.",
    cue: "Keep your feet planted and wrists stacked over your elbows."
  },
  {
    id: "dumbbell-floor-press", canonicalName: "Dumbbell Floor Press",
    aliases: ["Dumbbell Floor Press (light weight)"],
    equipment: "Dumbbells", movementPattern: "Horizontal press", targetMuscles: "Chest and triceps",
    images: { kind: "pair", start: image("dumbbell-floor-press-start.webp"), peak: image("dumbbell-floor-press-peak.webp") },
    instructions: "Lie on the floor with knees bent. Press the dumbbells upward, then lower until your upper arms touch the floor.",
    cue: "Lower gently; do not bounce your elbows off the floor."
  },
  {
    id: "dumbbell-shoulder-press", canonicalName: "Dumbbell Shoulder Press",
    aliases: ["Dumbbell Overhead Press", "Standing Dumbbell Shoulder Press"],
    equipment: "Dumbbells", movementPattern: "Vertical press", targetMuscles: "Shoulders and triceps",
    images: { kind: "pair", start: image("dumbbell-shoulder-press-start.webp"), peak: image("dumbbell-shoulder-press-peak.webp") },
    instructions: "Start with dumbbells at shoulder height. Press overhead, then lower with control.",
    cue: "Brace your core and avoid leaning back."
  },
  {
    id: "bench-hamstring-stretch", canonicalName: "Bench Hamstring Stretch",
    aliases: ["Elevated Hamstring Stretch (using bench)"],
    equipment: "Flat bench", movementPattern: "Hamstring stretch", targetMuscles: "Hamstrings",
    images: { kind: "single", main: image("bench-hamstring-stretch-main.webp") },
    instructions: "Place one heel on a stable bench with the leg straight. Hinge gently forward from your hips, then switch sides.",
    cue: "Keep your back long rather than rounding to reach farther."
  },
  {
    id: "hanging-knee-raise", canonicalName: "Hanging Knee Raise",
    aliases: ["Hanging Knee Raises (using bars, if available)"],
    equipment: "Pull-up bar", movementPattern: "Hanging core raise", targetMuscles: "Abs and hip flexors",
    images: { kind: "pair", start: image("pull-up-hanging-start.webp"), peak: image("hanging-knee-raise-peak.webp") },
    instructions: "Hang from a secure bar. Raise your knees toward your chest, then lower slowly.",
    cue: "Avoid swinging to lift your legs."
  },
  {
    id: "thread-the-needle", canonicalName: "Thread the Needle", aliases: [],
    equipment: "Bodyweight", movementPattern: "Thoracic rotation stretch", targetMuscles: "Upper back and shoulders",
    images: { kind: "single", main: image("thread-the-needle-main.webp") },
    instructions: "From hands and knees, reach one arm under your body and lower that shoulder toward the floor. Switch sides.",
    cue: "Move slowly and keep your hips above your knees."
  },
  {
    id: "push-up", canonicalName: "Push-Up", aliases: ["Push-Ups", "Push Ups"],
    equipment: "Bodyweight", movementPattern: "Horizontal push", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: image("push-up-start.webp"), peak: image("push-up-peak.webp") },
    instructions: "Begin in a high plank. Lower your chest toward the floor, then press back up.",
    cue: "Keep your body in one line; avoid letting your hips sag."
  },
  {
    id: "knee-push-up", canonicalName: "Knee Push-Up", aliases: ["Knee Push-Ups", "Knee Push Ups"],
    equipment: "Bodyweight", movementPattern: "Modified horizontal push", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: image("knee-push-up-start.webp"), peak: image("knee-push-up-peak.webp") },
    instructions: "Start with knees and hands on the floor. Lower your chest, then press back to straight arms.",
    cue: "Keep a straight line from your knees to your shoulders."
  },
  {
    id: "jumping-jacks", canonicalName: "Jumping Jacks", aliases: ["Jumping Jack"],
    equipment: "Bodyweight", movementPattern: "Cardio jump", targetMuscles: "Legs and shoulders",
    images: { kind: "pair", start: image("jumping-jacks-start.webp"), peak: image("jumping-jacks-peak.webp") },
    instructions: "Jump your feet apart as your arms rise overhead, then return your feet and arms together.",
    cue: "Land softly and keep a comfortable rhythm."
  },
  {
    id: "crunch", canonicalName: "Crunch", aliases: ["Crunches", "Abdominal Crunch"],
    equipment: "Bodyweight", movementPattern: "Trunk flexion", targetMuscles: "Abs",
    images: { kind: "pair", start: image("crunch-start.webp"), peak: image("crunch-peak.webp") },
    instructions: "Lie on your back with knees bent. Curl your shoulders slightly off the floor, then lower with control.",
    cue: "Keep your neck relaxed; do not pull on your head."
  },
  {
    id: "dead-bug", canonicalName: "Dead Bug", aliases: ["Dead Bugs"],
    equipment: "Bodyweight", movementPattern: "Supine core stability", targetMuscles: "Abs and deep core",
    images: { kind: "pair", start: image("dead-bug-start.webp"), peak: image("dead-bug-peak.webp") },
    instructions: "On your back, hold arms up and knees bent. Extend opposite arm and leg, return, then switch sides.",
    cue: "Keep your lower back gently pressed toward the floor."
  },
  {
    id: "high-plank", canonicalName: "High Plank", aliases: ["Straight-Arm Plank"],
    equipment: "Bodyweight", movementPattern: "Straight-arm core hold", targetMuscles: "Core and shoulders",
    images: { kind: "single", main: image("push-up-start.webp") },
    instructions: "Hold the top of a push-up with hands beneath shoulders and body straight from head to heels.",
    cue: "Brace your core and breathe without letting your hips drop."
  },
  {
    id: "forearm-plank", canonicalName: "Forearm Plank", aliases: ["Forearm Plank Hold", "Low Plank"],
    equipment: "Bodyweight", movementPattern: "Forearm core hold", targetMuscles: "Core and shoulders",
    images: { kind: "single", main: image("forearm-plank-main.webp") },
    instructions: "Support your body on your forearms and toes, keeping a straight line from head to heels.",
    cue: "Keep your elbows beneath your shoulders and avoid letting your hips sag."
  },
  {
    id: "forearm-side-plank", canonicalName: "Forearm Side Plank", aliases: ["Side Plank on Forearm"],
    equipment: "Bodyweight", movementPattern: "Lateral core hold", targetMuscles: "Obliques and lateral core",
    images: { kind: "single", main: image("forearm-side-plank-main.webp") },
    instructions: "Support your body on one forearm and the side of your feet. Lift your hips and hold, then switch sides.",
    cue: "Keep your elbow beneath your shoulder."
  },
  {
    id: "wall-sit", canonicalName: "Wall Sit", aliases: ["Wall Sits"],
    equipment: "Bodyweight and wall", movementPattern: "Isometric squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: image("wall-sit-main.webp") },
    instructions: "Lean your back against a wall and slide down into a seated position. Hold, then stand up.",
    cue: "Keep your feet planted and knees tracking over your feet."
  },
  {
    id: "bodyweight-walking-lunge", canonicalName: "Bodyweight Walking Lunge", aliases: ["Bodyweight Walking Lunges"],
    equipment: "Bodyweight", movementPattern: "Traveling lunge", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: image("bodyweight-walking-lunge-start.webp"), peak: image("bodyweight-walking-lunge-peak.webp") },
    instructions: "Step forward into a lunge, push through the front foot, then bring the back leg forward for the next step.",
    cue: "Keep your front knee aligned with your toes and move with control."
  },
  {
    id: "machine-chest-press", canonicalName: "Machine Chest Press", aliases: ["Chest Press Machine"],
    equipment: "Chest press machine", movementPattern: "Machine horizontal push", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: image("machine-chest-press-start.webp"), peak: image("machine-chest-press-peak.webp") },
    instructions: "Sit against the back pad, grip the handles at chest height, press forward, then return slowly.",
    cue: "Adjust the seat so the handles line up with mid-chest."
  },
  {
    id: "seated-cable-row", canonicalName: "Seated Cable Row", aliases: ["Seated Cable Rows"],
    equipment: "Cable row machine", movementPattern: "Horizontal pull", targetMuscles: "Back and biceps",
    images: { kind: "pair", start: image("seated-cable-row-start.webp"), peak: image("seated-cable-row-peak.webp") },
    instructions: "Sit with feet supported and arms extended. Pull the handle toward your lower ribs, then extend with control.",
    cue: "Keep your chest lifted; avoid rocking your torso to move the weight."
  },
  {
    id: "45-degree-leg-press", canonicalName: "45-Degree Leg Press", aliases: ["45 Degree Leg Press"],
    equipment: "45-degree leg press machine", movementPattern: "Machine leg push", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: image("45-degree-leg-press-start.webp"), peak: image("45-degree-leg-press-peak.webp") },
    instructions: "Sit in the sled with feet on the platform. Bend your knees to lower the weight, then press it away.",
    cue: "Keep hips on the seat and do not lock your knees at the top."
  },
  {
    id: "dumbbell-lateral-raise", canonicalName: "Dumbbell Lateral Raise", aliases: ["Dumbbell Lateral Raises"],
    equipment: "Dumbbells", movementPattern: "Shoulder abduction", targetMuscles: "Side shoulders",
    images: { kind: "pair", start: image("dumbbell-lateral-raise-start.webp"), peak: image("dumbbell-lateral-raise-peak.webp") },
    instructions: "Stand with dumbbells at your sides. Raise your arms outward to shoulder height, then lower slowly.",
    cue: "Use a light load and avoid shrugging or swinging."
  },
  {
    id: "dumbbell-bicep-curl", canonicalName: "Dumbbell Bicep Curl", aliases: ["Dumbbell Bicep Curls", "Dumbbell Biceps Curl"],
    equipment: "Dumbbells", movementPattern: "Elbow flexion", targetMuscles: "Biceps",
    images: { kind: "pair", start: image("dumbbell-bicep-curl-start.webp"), peak: image("dumbbell-bicep-curl-peak.webp") },
    instructions: "Stand with dumbbells at your sides and palms forward. Curl toward your shoulders, then lower slowly.",
    cue: "Keep your upper arms close to your sides without swinging."
  },
  {
    id: "pull-up", canonicalName: "Pull-Up", aliases: ["Pull-Ups", "Pull Ups"],
    equipment: "Pull-up bar", movementPattern: "Vertical bodyweight pull", targetMuscles: "Lats and biceps",
    images: { kind: "pair", start: image("pull-up-hanging-start.webp"), peak: image("pull-up-peak.webp") },
    instructions: "Hang from a secure bar with an overhand grip. Pull your chin toward the bar, then lower with control.",
    cue: "Avoid swinging or craning your neck to reach the bar."
  },
  {
    id: "machine-assisted-pull-up", canonicalName: "Machine-Assisted Pull-Up", aliases: ["Machine Assisted Pull-Ups"],
    equipment: "Assisted pull-up machine", movementPattern: "Assisted vertical pull", targetMuscles: "Lats and biceps",
    images: { kind: "pair", start: image("machine-assisted-pull-up-start.webp"), peak: image("machine-assisted-pull-up-peak.webp") },
    instructions: "Kneel on the machine pad, grip the bar overhand, pull upward, then lower steadily.",
    cue: "Use the knee pad for support without bouncing or swinging."
  },
  {
    id: "bent-over-dumbbell-row", canonicalName: "Bent-Over Dumbbell Row", aliases: ["Two-Arm Bent-Over Dumbbell Row"],
    equipment: "Two dumbbells", movementPattern: "Unsupported horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "pair", start: image("bent-over-dumbbell-row-start.webp"), peak: image("bent-over-dumbbell-row-peak.webp") },
    instructions: "Hold a dumbbell in each hand and hinge at your hips. Pull both elbows back, then lower the weights.",
    cue: "Keep your back neutral and avoid lifting your chest to jerk the weights."
  },
  {
    id: "straight-bar-cable-triceps-pushdown", canonicalName: "Straight-Bar Cable Triceps Pushdown",
    aliases: ["Straight Bar Cable Triceps Pushdown"],
    equipment: "Cable machine with straight bar", movementPattern: "Elbow extension", targetMuscles: "Triceps",
    images: { kind: "pair", start: image("straight-bar-cable-triceps-pushdown-start.webp"), peak: image("straight-bar-cable-triceps-pushdown-peak.webp") },
    instructions: "Grip the cable's straight bar, keep elbows near your sides, press down, then return slowly.",
    cue: "Keep your upper arms still; do not lean your body into the weight."
  },
  {
    id: "dumbbell-goblet-squat", canonicalName: "Dumbbell Goblet Squat",
    aliases: ["Dumbbell Goblet Squats", "Dumbbell Goblet Squat (light weight)"], equipment: "One dumbbell", movementPattern: "Loaded squat", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: imageV2("goblet-squat-start.webp"), peak: imageV2("goblet-squat-peak.webp") },
    instructions: "Hold one dumbbell vertically at your chest. Sit your hips down and back, then push through your feet to stand.",
    cue: "Keep heels down and knees in line with your toes."
  },
  {
    id: "lat-pulldown", canonicalName: "Lat Pulldown", aliases: ["Wide-Grip Lat Pulldown"],
    equipment: "Lat pulldown machine", movementPattern: "Vertical pull", targetMuscles: "Lats and upper back",
    images: { kind: "pair", start: imageV2("lat-pulldown-start.webp"), peak: imageV2("lat-pulldown-peak.webp") },
    instructions: "Sit with thighs secured and grip the bar overhead. Pull it down in front of your face toward your upper chest, then return slowly.",
    cue: "Keep the bar in front of your head; do not pull it behind your neck."
  },
  {
    id: "bench-incline-push-up", canonicalName: "Bench Incline Push-Up",
    aliases: ["Incline Push-Ups (on Park Bench)"], equipment: "Stable bench", movementPattern: "Incline horizontal push", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: imageV2("bench-incline-push-up-start.webp"), peak: imageV2("bench-incline-push-up-peak.webp") },
    instructions: "Place hands on a stable bench and walk feet back into a straight-body plank. Lower your chest toward the bench, then press away.",
    cue: "Keep the bench stable and your hips aligned with your shoulders."
  },
  {
    id: "bench-supported-single-arm-dumbbell-row", canonicalName: "Bench-Supported Single-Arm Dumbbell Row",
    aliases: [], equipment: "One dumbbell and flat bench", movementPattern: "Supported horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "pair", start: imageV2("single-arm-dumbbell-row-start.webp"), peak: imageV2("single-arm-dumbbell-row-peak.webp") },
    instructions: "Support one hand and knee on a bench. Let the dumbbell hang from the other arm, then pull your elbow toward your hip.",
    cue: "Keep your back flat and torso level as you row."
  },
  {
    id: "band-pull-apart", canonicalName: "Band Pull-Apart", aliases: ["Banded Pull-Aparts"],
    equipment: "Long resistance band", movementPattern: "Horizontal shoulder pull", targetMuscles: "Upper back and rear shoulders",
    images: { kind: "pair", start: imageV2("band-pull-apart-start.webp"), peak: imageV2("band-pull-apart-peak.webp") },
    instructions: "Hold a light band at shoulder height with straight arms. Pull your hands apart, then return slowly.",
    cue: "Keep shoulders down and avoid arching your back."
  },
  {
    id: "standing-band-squat", canonicalName: "Standing Band Squat", aliases: [],
    equipment: "Long resistance band under feet", movementPattern: "Band-resisted squat", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: imageV2("band-squat-start.webp"), peak: imageV2("band-squat-peak.webp") },
    instructions: "Stand on a long band and hold its ends at shoulder height. Squat with heels planted, then stand against the band's tension.",
    cue: "Keep the band secure under both feet and knees aligned with toes."
  },
  {
    id: "band-bent-over-row", canonicalName: "Band Bent-Over Row", aliases: ["Band Bent-Over Rows"],
    equipment: "Long resistance band under feet", movementPattern: "Band horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "pair", start: imageV2("band-bent-over-row-start.webp"), peak: imageV2("band-bent-over-row-peak.webp") },
    instructions: "Stand on the band, hinge at your hips and hold an end in each hand. Pull elbows toward your ribs, then lower.",
    cue: "Keep your back neutral and the band secured beneath your feet."
  },
  {
    id: "band-overhead-press", canonicalName: "Band Overhead Shoulder Press", aliases: ["Band Overhead Press"],
    equipment: "Long resistance band under feet", movementPattern: "Band vertical press", targetMuscles: "Shoulders and triceps",
    images: { kind: "pair", start: imageV2("band-overhead-press-start.webp"), peak: imageV2("band-overhead-press-peak.webp") },
    instructions: "Stand on a band and hold its ends at shoulder height. Press overhead, then lower with control.",
    cue: "Brace your core; avoid leaning back."
  },
  {
    id: "standing-band-pallof-press", canonicalName: "Standing Band Pallof Press",
    aliases: ["Standing Band Paloff Press"], equipment: "Band anchored at chest height", movementPattern: "Anti-rotation press", targetMuscles: "Core and obliques",
    images: { kind: "pair", start: imageV2("band-pallof-press-start.webp"), peak: imageV2("band-pallof-press-peak.webp") },
    instructions: "Stand sideways to the band anchor and hold the band at your chest. Press straight forward, resist rotation, then return.",
    cue: "Keep hips and shoulders square; use a secure anchor."
  },
  {
    id: "band-monster-walk", canonicalName: "Band Monster Walk", aliases: ["Banded Monster Walks"],
    equipment: "Mini loop band above knees", movementPattern: "Lateral band walk", targetMuscles: "Glutes and hip stabilizers",
    images: { kind: "pair", start: imageV2("band-monster-walk-start.webp"), peak: imageV2("band-monster-walk-peak.webp") },
    instructions: "Place a loop band above your knees and bend into a shallow squat. Step sideways against the band, then follow with the other foot.",
    cue: "Keep light tension in the band and knees tracking outward."
  },
  {
    id: "bench-dip", canonicalName: "Bench Dip", aliases: ["Bench Dips", "Bench Dips (knees bent)"],
    equipment: "Stable bench", movementPattern: "Bench-supported elbow extension", targetMuscles: "Triceps",
    images: { kind: "pair", start: imageV2("bench-dip-start.webp"), peak: imageV2("bench-dip-peak.webp") },
    instructions: "Place hands on a stable bench edge behind your hips, keep knees bent and feet planted. Bend elbows to lower, then press back up.",
    cue: "Keep shoulders comfortable and lower only as far as you can control."
  },
  {
    id: "inverted-row", canonicalName: "Inverted Row",
    aliases: ["Australian Pull-Ups / Inverted Rows"], equipment: "Secure low horizontal bar", movementPattern: "Bodyweight horizontal pull", targetMuscles: "Upper back and biceps",
    images: { kind: "pair", start: imageV2("inverted-row-start.webp"), peak: imageV2("inverted-row-peak.webp") },
    instructions: "Hang beneath a secure low bar with heels on the ground and body straight. Pull your chest toward the bar, then lower.",
    cue: "Keep your body in a straight line without dropping your hips."
  },
  {
    id: "cat-cow", canonicalName: "Cat-Cow Stretch", aliases: ["Cat-Cow"],
    equipment: "Bodyweight", movementPattern: "Spinal flexion and extension", targetMuscles: "Back and core",
    images: { kind: "pair", start: imageV2("cat-cow-start.webp"), peak: imageV2("cat-cow-peak.webp") },
    instructions: "On hands and knees, gently arch your back and lift your chest. Then round your spine and relax your head.",
    cue: "Move slowly within a comfortable range."
  },
  {
    id: "worlds-greatest-stretch", canonicalName: "World's Greatest Stretch", aliases: [],
    equipment: "Bodyweight", movementPattern: "Lunge and thoracic rotation", targetMuscles: "Hips and upper back",
    images: { kind: "pair", start: imageV2("worlds-greatest-stretch-start.webp"), peak: imageV2("worlds-greatest-stretch-peak.webp") },
    instructions: "Step into a deep runner's lunge with both hands inside the front foot. Keep one hand down and rotate the other arm toward the ceiling.",
    cue: "Rotate through your upper back; switch sides after each hold."
  },
  {
    id: "standing-band-chest-press", canonicalName: "Standing Band Chest Press", aliases: [],
    equipment: "Long resistance band around upper back", movementPattern: "Band horizontal press", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: imageV2("standing-band-chest-press-start.webp"), peak: imageV2("standing-band-chest-press-peak.webp") },
    instructions: "Wrap a long band around your upper back, hold an end in each hand and take a split stance. Press forward at chest height, then return.",
    cue: "Keep the band secure across your back and wrists straight."
  },
  {
    id: "bench-step-up", canonicalName: "Bench Step-Up", aliases: ["Bench Step-Ups"],
    equipment: "Stable low bench", movementPattern: "Step-up", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: imageV2("bench-step-up-start.webp"), peak: imageV2("bench-step-up-peak.webp") },
    instructions: "Place one foot on a stable, low bench. Push through that foot to stand on the bench, then step down with control.",
    cue: "Check that the bench is secure and keep your knee over your foot."
  },
  {
    id: "dumbbell-reverse-lunge", canonicalName: "Dumbbell Reverse Lunge", aliases: ["Dumbbell Reverse Lunges"],
    equipment: "Two dumbbells", movementPattern: "Loaded reverse lunge", targetMuscles: "Quads and glutes",
    images: { kind: "pair", start: imageV3("dumbbell-reverse-lunge-start.webp"), peak: imageV3("dumbbell-reverse-lunge-peak.webp") },
    instructions: "Hold a dumbbell by each side. Step one leg backward, lower with control, then push through the front foot to stand. Switch sides.",
    cue: "Keep your torso upright and the front knee aligned with your toes."
  },
  {
    id: "seated-dumbbell-calf-raise", canonicalName: "Seated Dumbbell Calf Raise", aliases: ["Seated Calf Raise (with dumbbell)", "Seated Dumbbell Calf Raises"],
    equipment: "One dumbbell and bench", movementPattern: "Seated ankle plantarflexion", targetMuscles: "Calves",
    images: { kind: "pair", start: imageV3("seated-dumbbell-calf-raise-start.webp"), peak: imageV3("seated-dumbbell-calf-raise-peak.webp") },
    instructions: "Sit on a bench with knees bent. Hold one dumbbell across your lower thighs above the knees. Keep the balls of your feet down while you raise and lower your heels.",
    cue: "Move through your ankles with control; avoid bouncing."
  },
  {
    id: "dumbbell-floor-glute-bridge", canonicalName: "Dumbbell Floor Glute Bridge", aliases: ["Dumbbell Glute Bridge"],
    equipment: "One dumbbell", movementPattern: "Weighted hip extension", targetMuscles: "Glutes and hamstrings",
    images: { kind: "pair", start: imageV3("dumbbell-floor-glute-bridge-start.webp"), peak: imageV3("dumbbell-floor-glute-bridge-peak.webp") },
    instructions: "Lie on your back with knees bent and feet flat. Hold one dumbbell securely across your hip crease, lift your hips by squeezing your glutes, then lower slowly.",
    cue: "Keep the weight stable with both hands and avoid arching your lower back."
  },
  {
    id: "wall-push-up", canonicalName: "Wall Push-Up", aliases: ["Wall Push-Ups", "Wall Pushups"],
    equipment: "Wall", movementPattern: "Incline horizontal push", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "pair", start: imageV3("wall-push-up-start.webp"), peak: imageV3("wall-push-up-peak.webp") },
    instructions: "Stand an arm's length from a wall with palms at chest height. Bend your elbows to bring your chest toward the wall, then press away.",
    cue: "Keep a straight line from head to heels and both palms flat on the wall."
  },
  {
    id: "chair-squat", canonicalName: "Chair Squat", aliases: [],
    equipment: "Sturdy chair", movementPattern: "Supported squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV4("chair-squat-main.webp") },
    instructions: "Stand just in front of a sturdy chair with feet about shoulder-width apart. Send your hips back until you lightly touch the seat, then push through your feet to stand again.",
    cue: "Keep the chair stable, your heels down and your knees in line with your toes."
  },
  {
    id: "dumbbell-front-squat", canonicalName: "Dumbbell Front Squat", aliases: [],
    equipment: "Two dumbbells", movementPattern: "Front-loaded squat", targetMuscles: "Quads, glutes and core",
    images: { kind: "single", main: imageV4("dumbbell-front-squat-main.webp") },
    instructions: "Hold one dumbbell at each shoulder with elbows forward. Squat to a depth you can control, then drive through your feet to stand tall.",
    cue: "Keep your chest upright and both dumbbells secure at shoulder height."
  },
  {
    id: "single-leg-glute-bridge", canonicalName: "Single-Leg Glute Bridge", aliases: [],
    equipment: "Exercise mat", movementPattern: "Single-leg hip extension", targetMuscles: "Glutes, hamstrings and core",
    images: { kind: "single", main: imageV4("single-leg-glute-bridge-main.webp") },
    instructions: "Lie on your back with one foot flat near your hip and the other leg raised. Press through the planted foot to lift your hips, lower slowly, then switch sides.",
    cue: "Keep your hips level and stop lifting before your lower back arches."
  },
  {
    id: "band-good-morning", canonicalName: "Band Good Morning", aliases: [],
    equipment: "Loop resistance band", movementPattern: "Banded hip hinge", targetMuscles: "Hamstrings and glutes",
    images: { kind: "single", main: imageV4("band-good-morning-main.webp") },
    instructions: "Stand on the middle of a loop band and hold the upper part securely at shoulder height. Soften your knees, push your hips back to hinge, then squeeze your glutes to stand.",
    cue: "Keep the band away from your neck and your back neutral throughout."
  },
  {
    id: "cable-pull-through", canonicalName: "Cable Pull-Through", aliases: [],
    equipment: "Low cable pulley and rope attachment", movementPattern: "Cable hip hinge", targetMuscles: "Glutes and hamstrings",
    images: { kind: "single", main: imageV4("cable-pull-through-main.webp") },
    instructions: "Face away from a low cable with the rope held between your legs. Step forward for tension, hinge your hips back with arms long, then stand by driving your hips forward.",
    cue: "Keep the cable behind you and move through your hips without rounding your back."
  },
  {
    id: "prone-w-raise", canonicalName: "Prone W Raise", aliases: [],
    equipment: "Exercise mat", movementPattern: "Prone scapular retraction", targetMuscles: "Upper back and rear shoulders",
    images: { kind: "single", main: imageV4("prone-w-raise-main.webp") },
    instructions: "Lie face down and bend your elbows out to make a W shape with your arms. Gently lift your hands and elbows off the mat, squeeze your shoulder blades, then lower slowly.",
    cue: "Keep your neck long and lift only as high as you can without shrugging."
  },
  {
    id: "reverse-snow-angel", canonicalName: "Reverse Snow Angel", aliases: [],
    equipment: "Exercise mat", movementPattern: "Prone shoulder sweep", targetMuscles: "Upper back and rear shoulders",
    images: { kind: "single", main: imageV4("reverse-snow-angel-main.webp") },
    instructions: "Lie face down with arms near your sides. Lift them slightly and sweep them out and toward overhead in a wide arc, then return with control.",
    cue: "Keep the movement gentle and avoid forcing your shoulders or lower back."
  },
  {
    id: "supported-split-squat", canonicalName: "Supported Split Squat", aliases: [],
    equipment: "Sturdy chair or rail", movementPattern: "Supported split squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV4("supported-split-squat-main.webp") },
    instructions: "Take a staggered stance and lightly hold a stable support at your side. Lower straight down by bending both knees, then press through your front foot to rise; switch legs.",
    cue: "Keep your front heel down and use the support for balance rather than pulling yourself up."
  },
  {
    id: "low-step-up", canonicalName: "Low Step-Up", aliases: [],
    equipment: "Stable low step", movementPattern: "Low step-up", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV4("low-step-up-main.webp") },
    instructions: "Place one whole foot on a stable low step. Push through that foot to rise, step back down slowly, and repeat before switching legs.",
    cue: "Start with a low height and keep your knee aligned over your foot."
  },
  {
    id: "easy-walk", canonicalName: "Easy Walk", aliases: [],
    equipment: "Comfortable shoes", movementPattern: "Easy walking", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV4("walking-main.webp") },
    instructions: "Walk at a relaxed pace for the prescribed time, letting your arms swing naturally. Choose a safe, level route and slow down if your breathing becomes strained.",
    cue: "Keep your shoulders relaxed and maintain a pace at which you can talk easily."
  },
  {
    id: "brisk-walk", canonicalName: "Brisk Walk", aliases: [],
    equipment: "Comfortable shoes", movementPattern: "Brisk walking", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV4("walking-main.webp") },
    instructions: "Walk with purposeful, quicker steps for the prescribed time while keeping a natural stride. Ease the pace if you cannot maintain control or comfortable breathing.",
    cue: "Stay tall and swing your arms; brisk should still feel sustainable."
  },
  {
    id: "stationary-bike", canonicalName: "Stationary Bike", aliases: [],
    equipment: "Stationary exercise bike", movementPattern: "Cycling", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV4("stationary-bike-main.webp") },
    instructions: "Adjust the seat so your knee stays slightly bent at the bottom of the pedal stroke. Pedal smoothly at a comfortable resistance for the prescribed time.",
    cue: "Keep your shoulders relaxed and avoid rocking your hips."
  },
  {
    id: "treadmill-walk", canonicalName: "Treadmill Walk", aliases: [],
    equipment: "Treadmill", movementPattern: "Treadmill walking", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV4("treadmill-walk-main.webp") },
    instructions: "Start the treadmill at a slow speed before stepping onto the belt. Walk upright at a comfortable pace and use only a gentle incline if it feels steady.",
    cue: "Look forward and stay centered on the belt rather than leaning on the rails."
  },
  {
    id: "march-in-place", canonicalName: "March in Place", aliases: [],
    equipment: "Bodyweight", movementPattern: "Low-impact march", targetMuscles: "Cardiovascular system, hip flexors and legs",
    images: { kind: "single", main: imageV4("march-in-place-main.webp") },
    instructions: "Stand tall and alternate lifting one knee at a time as your arms swing naturally. Keep a comfortable rhythm for the prescribed time.",
    cue: "Land softly and hold a stable support if balance feels uncertain."
  },
  {
    id: "standing-calf-stretch", canonicalName: "Standing Calf Stretch", aliases: [],
    equipment: "Wall", movementPattern: "Standing calf stretch", targetMuscles: "Calves",
    images: { kind: "single", main: imageV4("standing-calf-stretch-main.webp") },
    instructions: "Place both hands on a wall, step one leg back and keep its heel on the floor. Bend the front knee gently until you feel a calf stretch, then switch sides.",
    cue: "Keep your back toes pointed forward and never bounce into the stretch."
  },
  {
    id: "single-arm-dumbbell-row", canonicalName: "Single-Arm Dumbbell Row", aliases: [],
    equipment: "One dumbbell", movementPattern: "Unilateral horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "single", main: imageV4("single-arm-dumbbell-row-main.webp") },
    instructions: "Take a staggered stance, hinge at your hips and brace your free hand on your front thigh. Pull one dumbbell toward your hip, lower it slowly, then switch sides.",
    cue: "Keep your back neutral and your torso steady; do not twist to lift the weight."
  },
  {
    id: "anchored-standing-band-row", canonicalName: "Anchored Standing Band Row", aliases: [],
    equipment: "Long resistance band and secure chest-height anchor", movementPattern: "Standing band horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "single", main: imageV4("anchored-band-row-main.webp") },
    instructions: "Secure a long band at chest height and face the anchor, holding an end in each hand. Step back for light tension, pull your elbows toward your ribs, then return slowly.",
    cue: "Check the anchor before starting and keep your shoulders down as you row."
  },
  {
    id: "standing-torso-rotation", canonicalName: "Standing Torso Rotation", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing trunk rotation", targetMuscles: "Upper back and trunk",
    images: { kind: "single", main: imageV5("standing-torso-rotation-main.webp") },
    instructions: "Stand tall with feet shoulder-width apart and cross your arms over your chest. Gently turn your shoulders left and right while keeping your hips mostly forward.",
    cue: "Rotate only through a comfortable range; do not force your lower back."
  },
  {
    id: "standing-side-bend", canonicalName: "Standing Side Bend", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing lateral trunk stretch", targetMuscles: "Sides of trunk and shoulders",
    images: { kind: "single", main: imageV5("standing-side-bend-main.webp") },
    instructions: "Stand with feet hip-width apart. Reach one arm gently overhead and lean a little to the opposite side, then return upright and switch sides.",
    cue: "Keep both feet planted and avoid leaning forward or twisting."
  },
  {
    id: "standing-chest-opener", canonicalName: "Standing Chest Opener", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing chest stretch", targetMuscles: "Chest and front shoulders",
    images: { kind: "single", main: imageV5("standing-chest-opener-main.webp") },
    instructions: "Stand tall and gently clasp your hands behind your lower back. Let your arms move slightly back until you feel a comfortable stretch across your chest.",
    cue: "Keep your shoulders relaxed and do not arch your lower back."
  },
  {
    id: "standing-hamstring-hinge", canonicalName: "Standing Hamstring Hinge", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing hamstring stretch", targetMuscles: "Hamstrings",
    images: { kind: "single", main: imageV5("standing-hamstring-hinge-main-v2.webp") },
    instructions: "Place one heel a short step forward with toes lifted and bend your back knee slightly. Hinge gently at your hips with a long back, then switch legs.",
    cue: "Keep the front heel down and stop before your back starts rounding."
  },
  {
    id: "standing-cross-body-shoulder-stretch", canonicalName: "Standing Cross-Body Shoulder Stretch", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing shoulder stretch", targetMuscles: "Rear shoulder and upper back",
    images: { kind: "single", main: imageV5("standing-cross-body-shoulder-stretch-main.webp") },
    instructions: "Stand tall and bring one straight arm across your chest. Use the opposite hand to support it gently above the elbow, then switch arms.",
    cue: "Keep your shoulders relaxed and never pull directly on the elbow."
  },
  {
    id: "standing-hip-flexor-stretch", canonicalName: "Standing Hip Flexor Stretch", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing hip flexor stretch", targetMuscles: "Front of hips",
    images: { kind: "single", main: imageV5("standing-hip-flexor-stretch-main.webp") },
    instructions: "Take a short split stance with one foot behind. Bend the front knee slightly, keep your torso tall, and gently tuck your pelvis until you feel a stretch at the front of the back hip. Switch sides.",
    cue: "Keep the movement small and avoid arching your lower back."
  },
  {
    id: "standing-lateral-hip-shift", canonicalName: "Standing Lateral Hip Shift", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing lateral hip mobility", targetMuscles: "Inner thighs and hips",
    images: { kind: "single", main: imageV5("standing-lateral-hip-shift-main.webp") },
    instructions: "Stand with feet wider than your shoulders. Shift your hips gently toward one side by bending that knee a little while keeping the other leg comfortably straight, then switch sides.",
    cue: "Keep both feet flat and make the shift shallow and controlled."
  },
  {
    id: "seated-leg-curl", canonicalName: "Seated Leg Curl", aliases: [],
    equipment: "Seated leg curl machine", movementPattern: "Knee flexion", targetMuscles: "Hamstrings",
    images: { kind: "single", main: imageV6("seated-leg-curl-main.webp") },
    instructions: "Adjust the seat so your knees line up with the machine pivot. Secure the thigh pad, place your lower legs against the ankle roller, curl your heels down and back, then return slowly.",
    cue: "Keep your hips on the seat and move only at the knees."
  },
  {
    id: "leg-extension", canonicalName: "Leg Extension", aliases: [],
    equipment: "Leg extension machine", movementPattern: "Knee extension", targetMuscles: "Quadriceps",
    images: { kind: "single", main: imageV6("leg-extension-main.webp") },
    instructions: "Adjust the seat so your knees line up with the machine pivot and the roller rests above your ankles. Straighten your legs in a controlled range, then lower slowly.",
    cue: "Keep your hips against the seat and avoid snapping your knees straight."
  },
  {
    id: "machine-shoulder-press", canonicalName: "Machine Shoulder Press", aliases: [],
    equipment: "Shoulder press machine", movementPattern: "Vertical press", targetMuscles: "Shoulders and triceps",
    images: { kind: "single", main: imageV6("machine-shoulder-press-main.webp") },
    instructions: "Set the seat so the handles begin around shoulder height. Sit with your back supported, press the handles upward without shrugging, then lower with control.",
    cue: "Keep your ribs down and wrists stacked over your elbows."
  },
  {
    id: "chest-supported-machine-row", canonicalName: "Chest-Supported Machine Row", aliases: [],
    equipment: "Chest-supported row machine", movementPattern: "Supported horizontal pull", targetMuscles: "Upper back and lats",
    images: { kind: "single", main: imageV6("chest-supported-machine-row-main.webp") },
    instructions: "Set the seat so the chest pad supports your torso. Brace your feet, pull both handles toward your lower ribs, then let your arms extend slowly without lifting off the pad.",
    cue: "Keep your chest against the pad and your shoulders away from your ears."
  },
  {
    id: "pec-deck-fly", canonicalName: "Pec Deck Fly", aliases: [],
    equipment: "Pec deck fly machine", movementPattern: "Chest fly", targetMuscles: "Chest",
    images: { kind: "single", main: imageV6("pec-deck-fly-main.webp") },
    instructions: "Adjust the seat so the handles are near chest height. Sit tall with a slight elbow bend, bring both handles together in front of your chest, then open slowly to a comfortable stretch.",
    cue: "Keep your shoulders down and avoid forcing your arms far behind you."
  },
  {
    id: "reverse-pec-deck", canonicalName: "Reverse Pec Deck", aliases: [],
    equipment: "Reverse pec deck machine", movementPattern: "Rear delt fly", targetMuscles: "Rear shoulders and upper back",
    images: { kind: "single", main: imageV6("reverse-pec-deck-main.webp") },
    instructions: "Face the machine with your chest against the pad. Hold the reverse-fly handles at shoulder height, open your arms out to the sides, then return slowly without twisting.",
    cue: "Keep a soft bend in your elbows and avoid shrugging."
  },
  {
    id: "hip-abduction-machine", canonicalName: "Hip Abduction Machine", aliases: [],
    equipment: "Seated hip abduction machine", movementPattern: "Hip abduction", targetMuscles: "Side glutes",
    images: { kind: "single", main: imageV6("hip-abduction-machine-main.webp") },
    instructions: "Sit with your back supported and the pads against the outside of your thighs. Press your knees apart within a comfortable range, pause briefly, then return with control.",
    cue: "Keep your torso still and avoid bouncing the pads."
  },
  {
    id: "seated-calf-raise-machine", canonicalName: "Seated Calf Raise Machine", aliases: [],
    equipment: "Seated calf raise machine", movementPattern: "Ankle plantar flexion", targetMuscles: "Calves",
    images: { kind: "single", main: imageV6("seated-calf-raise-machine-main.webp") },
    instructions: "Sit with the thigh pad resting above your knees and the balls of your feet on the platform. Raise your heels as high as comfortable, pause, then lower slowly.",
    cue: "Move through your ankles while keeping your knees under the pad."
  },
  {
    id: "hack-squat-machine", canonicalName: "Hack Squat Machine", aliases: [],
    equipment: "Hack squat machine", movementPattern: "Supported squat", targetMuscles: "Quadriceps and glutes",
    images: { kind: "single", main: imageV6("hack-squat-machine-main.webp") },
    instructions: "Set your back and shoulders against the sled pads with feet about shoulder-width on the platform. Bend your knees to a controlled depth, then push through your whole feet to stand.",
    cue: "Keep your heels down and do not lock your knees hard at the top."
  },
  {
    id: "cable-face-pull", canonicalName: "Cable Face Pull", aliases: [],
    equipment: "Cable tower and rope handle", movementPattern: "High horizontal pull", targetMuscles: "Rear shoulders and upper back",
    images: { kind: "single", main: imageV6("cable-face-pull-main.webp") },
    instructions: "Set the rope around face height and step back to tension the cable. Pull the rope toward your forehead with elbows out, then extend your arms slowly.",
    cue: "Keep your neck relaxed and do not lean back to move the weight."
  },
  {
    id: "cable-chest-fly", canonicalName: "Cable Chest Fly", aliases: [],
    equipment: "Dual adjustable cable machine", movementPattern: "Chest fly", targetMuscles: "Chest",
    images: { kind: "single", main: imageV6("cable-chest-fly-main.webp") },
    instructions: "Set both pulleys around chest height, take a staggered stance, and keep a soft bend in your elbows. Bring the handles together in front of your chest, then return slowly.",
    cue: "Keep your shoulders down and your torso steady throughout."
  },
  {
    id: "seated-leg-press", canonicalName: "Seated Leg Press", aliases: [],
    equipment: "Horizontal seated leg press machine", movementPattern: "Supported leg press", targetMuscles: "Quadriceps and glutes",
    images: { kind: "single", main: imageV6("seated-leg-press-main.webp") },
    instructions: "Adjust the seat so your knees start comfortably bent. Place both feet on the platform, press it away through your whole feet, then return slowly without letting your hips lift.",
    cue: "Keep your knees tracking with your toes and avoid locking them hard."
  },
  {
    id: "bench-sit-to-stand", canonicalName: "Bench Sit-to-Stand", aliases: [],
    equipment: "Fixed park bench", movementPattern: "Bench-assisted squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV7("bench-sit-to-stand-main.webp") },
    instructions: "Sit near the front of a fixed, stable park bench with feet flat. Lean slightly forward, stand through your feet, then sit down slowly with control.",
    cue: "Choose a comfortable bench height and keep your knees aligned with your feet."
  },
  {
    id: "standing-bodyweight-hip-hinge", canonicalName: "Standing Bodyweight Hip Hinge", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing hip hinge", targetMuscles: "Hamstrings and glutes",
    images: { kind: "single", main: imageV7("standing-bodyweight-hip-hinge-main.webp") },
    instructions: "Stand with feet hip-width apart and knees soft. Push your hips backward while your torso leans forward, then drive through your feet to stand tall.",
    cue: "Keep your back long and stop before it starts to round."
  },
  {
    id: "standing-knee-raise", canonicalName: "Standing Knee Raise", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing core and balance", targetMuscles: "Core and hip flexors",
    images: { kind: "single", main: imageV7("standing-knee-raise-main.webp") },
    instructions: "Stand tall on level ground. Lift one knee slowly toward hip height without leaning back, lower it with control, then switch legs.",
    cue: "Move slowly and keep the knee lower if balance feels uncertain."
  },
  {
    id: "gentle-knee-march", canonicalName: "Gentle Knee March", aliases: [],
    equipment: "Bodyweight", movementPattern: "Low-impact marching", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV7("standing-knee-raise-main.webp") },
    instructions: "Stand in a clear space and lift one knee a little, then lower that foot and lift the other. Continue alternating at an easy, steady pace for the prescribed time. Keep a hand near stable support if you need it.",
    cue: "Keep the steps soft and the knee lifts low enough to stay balanced."
  },
  {
    id: "walk-intervals", canonicalName: "Walk Intervals", aliases: [],
    equipment: "Safe walking route", movementPattern: "Alternating walking pace", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV4("walking-main.webp") },
    instructions: "Walk easily for two minutes, then walk briskly for one minute. Repeat on a safe, level route for the prescribed time and ease off if needed.",
    cue: "The brisk sections should feel purposeful while still allowing controlled breathing."
  },
  {
    id: "walk-jog-intervals", canonicalName: "Walk-Jog Intervals", aliases: [],
    equipment: "Safe walking or running route", movementPattern: "Walk-jog intervals", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV7("walk-jog-intervals-main.webp") },
    instructions: "Walk for two minutes, then jog easily for thirty seconds. Repeat on a safe, level route for the prescribed time and return to walking if form or breathing becomes strained.",
    cue: "Keep the jog gentle and land under your body rather than sprinting."
  },
  {
    id: "side-step-touch", canonicalName: "Side Step Touch", aliases: [],
    equipment: "Bodyweight and a small clear space", movementPattern: "Low-impact lateral step", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV7("side-step-touch-main.webp") },
    instructions: "Step to one side and lightly tap the other foot beside it. Repeat to the other side at a comfortable pace without hopping.",
    cue: "Keep your knees soft, steps quiet, and torso upright."
  },
  {
    id: "short-bar-hang", canonicalName: "Short Bar Hang", aliases: [],
    equipment: "Fixed pull-up bar", movementPattern: "Grip and shoulder hang", targetMuscles: "Grip, shoulders and upper back",
    images: { kind: "single", main: image("pull-up-hanging-start.webp") },
    instructions: "Hold a fixed pull-up bar with an overhand grip and let your feet lift only if you can safely reach and leave the bar. Keep your shoulders gently engaged for a short hold, then lower carefully.",
    cue: "Stop the hold before your grip slips; never jump to an uncertain bar."
  },
  {
    id: "standing-calf-raise", canonicalName: "Standing Calf Raise", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing calf raise", targetMuscles: "Calves",
    images: { kind: "single", main: imageV8("standing-calf-raise-main.webp") },
    instructions: "Stand on flat ground with feet hip-width apart. Rise onto the balls of both feet, pause briefly, then lower your heels slowly.",
    cue: "Stay tall and avoid rolling onto the outside of your feet."
  },
  {
    id: "tandem-stand", canonicalName: "Tandem Stand", aliases: [],
    equipment: "Bodyweight with nearby stable support", movementPattern: "Static balance", targetMuscles: "Balance and stabilizing muscles",
    images: { kind: "single", main: imageV8("tandem-stand-main.webp") },
    instructions: "Stand near a stable wall or counter. Place one foot directly ahead of the other, hold your balance for the prescribed time, then switch which foot leads.",
    cue: "Keep support within reach and step out of the stance if unsteady."
  },
  {
    id: "supported-single-leg-stand", canonicalName: "Supported Single-Leg Stand", aliases: [],
    equipment: "Bodyweight and stable wall", movementPattern: "Supported single-leg balance", targetMuscles: "Balance, hips and ankles",
    images: { kind: "single", main: imageV8("supported-single-leg-stand-main.webp") },
    instructions: "Stand beside a stable wall and touch it lightly with your fingertips. Lift one foot a little off the floor, hold, then switch legs.",
    cue: "Keep your hips level and use more hand support whenever needed."
  },
  {
    id: "seated-band-row", canonicalName: "Seated Band Row", aliases: [],
    equipment: "Long resistance band", movementPattern: "Seated horizontal pull", targetMuscles: "Upper back and arms",
    images: { kind: "single", main: imageV8("seated-band-row-main.webp") },
    instructions: "Sit with legs forward and knees softly bent. Loop the middle of a long band under both feet, hold one end in each hand, pull elbows back, then return slowly.",
    cue: "Check the band is secure under your feet before every pull."
  },
  {
    id: "standing-band-biceps-curl", canonicalName: "Standing Band Biceps Curl", aliases: [],
    equipment: "Long resistance band", movementPattern: "Elbow flexion", targetMuscles: "Biceps",
    images: { kind: "single", main: imageV8("standing-band-biceps-curl-main.webp") },
    instructions: "Stand on the middle of a long band with both feet and hold an end in each hand. Curl your hands toward your shoulders, then lower with control.",
    cue: "Keep your elbows near your ribs and your wrists straight."
  },
  {
    id: "band-overhead-triceps-extension", canonicalName: "Band Overhead Triceps Extension", aliases: [],
    equipment: "Long resistance band", movementPattern: "Overhead elbow extension", targetMuscles: "Triceps",
    images: { kind: "single", main: imageV8("band-overhead-triceps-extension-main.webp") },
    instructions: "Stand on the middle of a long band with one foot, bring both ends behind your head, then straighten your elbows overhead and return slowly.",
    cue: "Keep the band secured under your foot and stop if your shoulders feel uncomfortable."
  },
  {
    id: "standing-band-lateral-raise", canonicalName: "Standing Band Lateral Raise", aliases: [],
    equipment: "Long resistance band", movementPattern: "Shoulder abduction", targetMuscles: "Side shoulders",
    images: { kind: "single", main: imageV8("standing-band-lateral-raise-main.webp") },
    instructions: "Stand on the middle of a long band and hold the ends at your sides. Raise your arms outward toward shoulder height, then lower slowly.",
    cue: "Keep a soft elbow bend and avoid shrugging or arching your back."
  },
  {
    id: "dumbbell-suitcase-hold", canonicalName: "Dumbbell Suitcase Hold", aliases: [],
    equipment: "One dumbbell", movementPattern: "Static anti-lateral-flexion hold", targetMuscles: "Core and grip",
    images: { kind: "single", main: imageV8("dumbbell-suitcase-hold-main.webp") },
    instructions: "Hold one dumbbell beside one thigh and stand tall with shoulders level. Breathe normally for the prescribed time, then switch hands.",
    cue: "Do not lean toward or away from the weight."
  },
  {
    id: "standing-dumbbell-calf-raise", canonicalName: "Standing Dumbbell Calf Raise", aliases: [],
    equipment: "Dumbbells", movementPattern: "Loaded standing calf raise", targetMuscles: "Calves",
    images: { kind: "single", main: imageV8("standing-dumbbell-calf-raise-main.webp") },
    instructions: "Hold light dumbbells at your sides on flat ground. Raise both heels, pause at the top, then lower slowly without bouncing.",
    cue: "Stay upright and keep weight centered over both feet."
  },
  {
    id: "barbell-back-squat", canonicalName: "Barbell Back Squat", aliases: [],
    equipment: "Barbell, rack and safeties", movementPattern: "Loaded squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV8("barbell-back-squat-main.webp") },
    instructions: "Set rack safeties and place the bar across your upper back. Unrack with control, squat to a depth you can manage with flat feet, then stand through your whole feet.",
    cue: "Use a spotter or safeties and keep the bar over midfoot."
  },
  {
    id: "barbell-romanian-deadlift", canonicalName: "Barbell Romanian Deadlift", aliases: [],
    equipment: "Barbell", movementPattern: "Loaded hip hinge", targetMuscles: "Hamstrings and glutes",
    images: { kind: "single", main: imageV8("barbell-romanian-deadlift-main.webp") },
    instructions: "Hold a barbell in front of your thighs. With soft knees, push your hips back and slide the bar close to your legs, then stand tall by driving through your feet.",
    cue: "Stop the descent before your back rounds; the bar need not touch the floor."
  },
  {
    id: "barbell-bench-press", canonicalName: "Barbell Bench Press", aliases: [],
    equipment: "Barbell, flat bench and rack safeties", movementPattern: "Horizontal press", targetMuscles: "Chest, shoulders and triceps",
    images: { kind: "single", main: imageV8("barbell-bench-press-main.webp") },
    instructions: "Set rack safeties or use a spotter. Lie on a flat bench with feet planted, lower the bar toward your mid chest, then press it upward with control.",
    cue: "Keep wrists stacked over your forearms and avoid bouncing the bar."
  },
  {
    id: "hip-thrust-machine", canonicalName: "Hip Thrust Machine", aliases: [],
    equipment: "Dedicated hip thrust or glute drive machine", movementPattern: "Supported hip extension", targetMuscles: "Glutes and hamstrings",
    images: { kind: "single", main: imageV8("hip-thrust-machine-main.webp") },
    instructions: "Set the machine pad or belt across your pelvis and keep feet flat. Raise your hips until your torso is level, pause briefly, then lower with control.",
    cue: "Keep your ribs down and avoid over-arching your lower back."
  },
  {
    id: "lying-leg-curl", canonicalName: "Lying Leg Curl", aliases: [],
    equipment: "Prone leg curl machine", movementPattern: "Knee flexion", targetMuscles: "Hamstrings",
    images: { kind: "single", main: imageV8("lying-leg-curl-main.webp") },
    instructions: "Lie face down on the machine with the roller above your heels. Curl your heels toward your glutes while keeping hips on the pad, then lower slowly.",
    cue: "Avoid lifting your hips or swinging the weight."
  },
  {
    id: "standing-calf-raise-machine", canonicalName: "Standing Calf Raise Machine", aliases: [],
    equipment: "Standing calf raise machine", movementPattern: "Loaded ankle plantar flexion", targetMuscles: "Calves",
    images: { kind: "single", main: imageV8("standing-calf-raise-machine-main.webp") },
    instructions: "Place the shoulder pads securely and stand with the balls of your feet on the platform. Raise your heels, pause, then lower through a comfortable range.",
    cue: "Keep your torso upright and avoid bouncing at the bottom."
  },
  {
    id: "cable-pallof-press", canonicalName: "Cable Pallof Press", aliases: [],
    equipment: "Adjustable cable tower", movementPattern: "Standing anti-rotation press", targetMuscles: "Core",
    images: { kind: "single", main: imageV8("cable-pallof-press-main.webp") },
    instructions: "Set a cable handle at chest height and stand sideways to the tower. Hold it with both hands, press straight forward without turning, return, then switch sides.",
    cue: "Keep hips and shoulders facing forward as the cable pulls sideways."
  },
  {
    id: "elliptical-trainer", canonicalName: "Elliptical Trainer", aliases: [],
    equipment: "Elliptical trainer", movementPattern: "Low-impact aerobic conditioning", targetMuscles: "Cardiovascular system and legs",
    images: { kind: "single", main: imageV8("elliptical-trainer-main.webp") },
    instructions: "Step onto the elliptical with both feet on the pedals, hold the handles, and move with a smooth stride at a comfortable effort for the prescribed time.",
    cue: "Keep your feet on the pedals and avoid leaning heavily on the handles."
  },
  {
    id: "rowing-machine", canonicalName: "Rowing Machine", aliases: [],
    equipment: "Indoor rowing machine", movementPattern: "Seated aerobic rowing", targetMuscles: "Cardiovascular system, legs and back",
    images: { kind: "single", main: imageV8("rowing-machine-main.webp") },
    instructions: "Sit on the rower with feet strapped in. Push with your legs, then draw the handle to your lower ribs; extend your arms before bending your knees on the return.",
    cue: "Keep the stroke smooth and avoid yanking with your lower back."
  },
  {
    id: "lateral-squat-step", canonicalName: "Lateral Squat Step", aliases: [],
    equipment: "Bodyweight and a small clear space", movementPattern: "Lateral squat", targetMuscles: "Quads, glutes and inner thighs",
    images: { kind: "single", main: imageV9("lateral-squat-step-main.webp") },
    instructions: "Stand tall and step one foot sideways. Shift your hips back toward the stepping leg while the other leg stays longer, then push through that foot to stand and bring your feet together. Alternate sides.",
    cue: "Use a small step and keep the bent knee tracking over the foot."
  },
  {
    id: "kickstand-hip-hinge", canonicalName: "Kickstand Hip Hinge", aliases: [],
    equipment: "Bodyweight", movementPattern: "Staggered-stance hip hinge", targetMuscles: "Hamstrings and glutes",
    images: { kind: "single", main: imageV9("kickstand-hip-hinge-main.webp") },
    instructions: "Place one foot a short step behind the other and rest its toes lightly on the floor. Keep most of your weight over the front leg, push your hips back with a long spine, then stand tall. Switch sides after each set.",
    cue: "The back foot helps balance; do not twist or round your back."
  },
  {
    id: "stationary-split-squat", canonicalName: "Stationary Split Squat", aliases: [],
    equipment: "Bodyweight, with optional nearby support", movementPattern: "Stationary split squat", targetMuscles: "Quads and glutes",
    images: { kind: "single", main: imageV9("stationary-split-squat-main.webp") },
    instructions: "Start in a comfortable staggered stance and keep both feet planted. Bend both knees only as far as you can control, rise slowly, and repeat before switching which foot is in front. Hold a stable support if needed.",
    cue: "Stay tall and keep the front knee in line with the foot."
  },
  {
    id: "standing-cross-body-knee-drive", canonicalName: "Standing Cross-Body Knee Drive", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing cross-body core movement", targetMuscles: "Abdominals and hip flexors",
    images: { kind: "single", main: imageV9("standing-cross-body-knee-drive-main.webp") },
    instructions: "Stand tall. Slowly raise one knee toward the opposite elbow with a small torso turn, set the foot down, then repeat on the other side. Keep the movement controlled and shorten the lift if balance is uncertain.",
    cue: "Move slowly without hopping or pulling on your neck."
  },
  {
    id: "standing-upper-back-squeeze", canonicalName: "Standing Upper-Back Squeeze", aliases: [],
    equipment: "Bodyweight", movementPattern: "Shoulder-blade activation", targetMuscles: "Upper back and rear shoulders",
    images: { kind: "single", main: imageV9("standing-upper-back-squeeze-main.webp") },
    instructions: "Stand tall with elbows bent beside your ribs. Gently draw your shoulder blades toward each other, pause briefly, then relax. This is a light shoulder-blade movement for a day when a bar is unsuitable; it does not replace the resistance of a row.",
    cue: "Keep your shoulders low and do not arch your back."
  },
  {
    id: "bent-knee-calf-raise", canonicalName: "Bent-Knee Calf Raise", aliases: [],
    equipment: "Bodyweight on flat ground", movementPattern: "Bent-knee calf raise", targetMuscles: "Calves, especially soleus",
    images: { kind: "single", main: imageV9("bent-knee-calf-raise-main.webp") },
    instructions: "Stand with feet hip-width apart and keep a small comfortable bend in both knees. Lift both heels slowly, pause, then lower with control while keeping the knee bend. Hold stable support if balance is uncertain.",
    cue: "Raise and lower your heels without bouncing."
  },
  {
    id: "standing-hip-circles", canonicalName: "Standing Hip Circles", aliases: [],
    equipment: "Bodyweight", movementPattern: "Standing hip mobility", targetMuscles: "Hips and lower back mobility",
    images: { kind: "single", main: imageV9("standing-hip-circles-main.webp") },
    instructions: "Stand with feet hip-width apart, hands on hips and knees soft. Make a small, slow circle with your hips, then circle the other direction. Stay within a comfortable range and keep your upper body relaxed.",
    cue: "Use small circles without forcing your lower back."
  },
  {
    id: "upright-low-bar-row", canonicalName: "Upright Low-Bar Row", aliases: [],
    equipment: "Fixed waist-high exercise bar", movementPattern: "Upright bodyweight row", targetMuscles: "Upper back, lats and biceps",
    images: { kind: "single", main: imageV9("upright-low-bar-row-main.webp") },
    instructions: "Check that the fixed low bar supports your weight. Grip it with both hands, walk your feet forward slightly and keep them planted. Lean back only a little, pull your chest toward the bar, then straighten your arms slowly.",
    cue: "Keep both feet grounded and choose an easy body angle."
  },
  {
    id: "bench-incline-plank-hold", canonicalName: "Bench Incline Plank Hold", aliases: [],
    equipment: "Fixed stable bench", movementPattern: "Incline plank hold", targetMuscles: "Shoulders, chest and core",
    images: { kind: "single", main: imageV9("bench-incline-plank-hold-main.webp") },
    instructions: "Place both hands on a fixed stable bench and walk your feet back until your body makes a straight diagonal line. Hold for the prescribed time while breathing steadily. Step in to finish; do not use a bench that shifts.",
    cue: "Keep your hips in line with your shoulders and heels."
  },
  {
    id: "kneeling-push-up-hold", canonicalName: "Kneeling Push-Up Hold", aliases: [],
    equipment: "Bodyweight and a clear floor", movementPattern: "Kneeling push-up support", targetMuscles: "Shoulders, chest and core",
    images: { kind: "single", main: imageV9("kneeling-push-up-hold-main.webp") },
    instructions: "Start on hands and knees. Move your hands under your shoulders and keep a straight line from shoulders to knees with your arms long. Hold for the prescribed time while breathing; lower gently before your back sags.",
    cue: "Keep your hands planted and do not arch your lower back."
  },
  {
    id: "dumbbell-hammer-curl", canonicalName: "Dumbbell Hammer Curl", aliases: [],
    equipment: "Two light dumbbells", movementPattern: "Neutral-grip biceps curl", targetMuscles: "Biceps and forearms",
    images: { kind: "single", main: imageV9("dumbbell-hammer-curl-main.webp") },
    instructions: "Stand tall with a dumbbell at each side and palms facing inward. Keep your upper arms close to your ribs, curl the weights toward your shoulders, then lower them slowly without moving your torso.",
    cue: "Keep the palms facing each other and avoid swinging."
  },
  {
    id: "standing-band-hammer-curl", canonicalName: "Standing Band Hammer Curl", aliases: [],
    equipment: "Long resistance band", movementPattern: "Neutral-grip band curl", targetMuscles: "Biceps and forearms",
    images: { kind: "single", main: imageV9("standing-band-hammer-curl-main.webp") },
    instructions: "Stand securely on the middle of a long band with both feet and hold an end in each hand. Keep palms facing inward and upper arms by your ribs. Curl your hands toward your shoulders, then lower with control.",
    cue: "Check the band is secure under your feet before each set."
  },
  {
    id: "standing-band-triceps-kickback", canonicalName: "Standing Band Triceps Kickback", aliases: [],
    equipment: "Long resistance band", movementPattern: "Band triceps extension", targetMuscles: "Triceps",
    images: { kind: "single", main: imageV9("standing-band-triceps-kickback-main.webp") },
    instructions: "Pin one end of the long band under a foot and hold the other end in the same-side hand. Hinge slightly with a long back, keep your upper arm alongside your torso, straighten your elbow backward, then return slowly. Switch sides.",
    cue: "Keep the band secure under your foot and your shoulder still."
  },
  {
    id: "dumbbell-front-raise", canonicalName: "Dumbbell Front Raise", aliases: [],
    equipment: "Two light dumbbells", movementPattern: "Front shoulder raise", targetMuscles: "Front shoulders",
    images: { kind: "single", main: imageV9("dumbbell-front-raise-main.webp") },
    instructions: "Stand tall holding light dumbbells in front of your thighs. With elbows soft and ribs stacked over your hips, raise your arms forward only to shoulder height, then lower slowly without leaning back.",
    cue: "Stop at shoulder height and avoid shrugging or swinging."
  }
] as const;

const reviewedNames = new Map<string, { exercise: ExerciseVisual; kind: "exact" | "alias" }>();
const knownAmbiguousNames = [
  "Goblet Squat", "Reverse Lunge", "Reverse Lunges",
  "Plank", "Plank Hold", "Plank (Forearms on Bed or Floor)",
  "Downward Dog to Cobra Flow",
  "Dumbbell Bench Press or Floor Press", "Hamstring Stretch (Standing or Seated)",
  "Incline Push-Up", "Incline Push-ups (against a wall or sturdy surface)",
  "Incline Push-Ups (Hands on Desk or Bed)",
  "Walking Lunge", "Walking Lunges", "Side Plank", "Leg Press", "Assisted Pull-Up", "Assisted Pull-Ups",
  "Cable Tricep Pushdown", "Rope Tricep Pushdown", "Barbell Bench Press", "Bench Press"
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
  // New V2 equipment art stays in the owner workout pilot. Legacy Gemini
  // plans retain their existing text-only behavior until V2 is public.
  if (reviewed && !visualIsV2Only(reviewed.exercise)) return { status: "resolved", match: reviewed.kind, exercise: reviewed.exercise };
  if (reviewed) return { status: ambiguousNames.has(key) ? "ambiguous" : "unresolved", match: null, exercise: null };
  if (ambiguousNames.has(key)) return { status: "ambiguous", match: null, exercise: null };
  return { status: "unresolved", match: null, exercise: null };
}

function visualIsV2Only(exercise: ExerciseVisual): boolean {
  const asset = exercise.images.kind === "single" ? exercise.images.main : exercise.images.start;
  return asset.startsWith(`${EXERCISE_VISUAL_ASSET_ROOT_V6}/`) || asset.startsWith(`${EXERCISE_VISUAL_ASSET_ROOT_V7}/`) || asset.startsWith(`${EXERCISE_VISUAL_ASSET_ROOT_V8}/`) || asset.startsWith(`${EXERCISE_VISUAL_ASSET_ROOT_V9}/`);
}

// Older V2 workouts were saved with broad labels before the reviewed catalog used
// precise variant names. Apply these mappings only to V2; the original resolver
// remains intentionally conservative for legacy and AI-generated plans.
const legacyV2VisualNames: Record<string, string> = {
  "goblet squat": "Dumbbell Goblet Squat",
  "leg press": "45-Degree Leg Press",
  "incline push-up": "Bench Incline Push-Up",
  "band chest press": "Standing Band Chest Press",
  "dumbbell row": "Single-Arm Dumbbell Row",
  "band row": "Anchored Standing Band Row",
  "reverse lunge": "Bodyweight Reverse Lunge",
  "pallof press": "Standing Band Pallof Press",
  "side plank": "Forearm Side Plank",
  "hip flexor stretch": "Kneeling Hip Flexor Stretch"
};

export function resolveV2WorkoutExerciseVisual(name: unknown): ExerciseVisualResolution {
  const normalized = normalizeExerciseVisualName(name);
  const lookupName = normalized ? legacyV2VisualNames[normalized] ?? name : name;
  const key = normalizeExerciseVisualName(lookupName);
  if (!key) return { status: "unresolved", match: null, exercise: null };
  const reviewed = reviewedNames.get(key);
  if (reviewed) return { status: "resolved", match: reviewed.kind, exercise: reviewed.exercise };
  if (ambiguousNames.has(key)) return { status: "ambiguous", match: null, exercise: null };
  return { status: "unresolved", match: null, exercise: null };
}
