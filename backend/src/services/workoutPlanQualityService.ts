import type { CoachWorkoutExercise, CoachWorkoutPlan } from "../integrations/openai";
import { estimateWorkoutDurationMinutes, preserveTimedSwapDuration } from "@ascend/shared";
import { localDateKeyAtOffset } from "./memberTimeService";

type Pattern = "squat" | "hinge" | "push" | "pull" | "single_leg" | "accessory" | "core" | "cardio" | "mobility" | "balance";
type Kit = "bodyweight" | "chair" | "low_step" | "dumbbells" | "bands" | "gym" | "route" | "park_bench" | "low_bar" | "pullup_bar" | "mat";
type Goal = "fat_loss" | "muscle_gain" | "strength" | "general_fitness" | "recovery" | "mobility";
type AccessoryTarget = "quads" | "hamstrings" | "glutes" | "chest" | "shoulders" | "rear_delts" | "biceps" | "triceps" | "calves";
type CatalogExercise = { name: string; pattern: Pattern; kit: Kit[]; reps?: string; duration?: string; note: string; advanced?: boolean; swapOnly?: boolean; requiresFloor?: boolean; requiresWall?: boolean; requiresSupport?: boolean; requiresRoomToTravel?: boolean; target?: AccessoryTarget };
export type WorkoutHistoryRow = { metadata?: Record<string, unknown> | null; created_at?: string | Date | null };
export type WorkoutBlueprint = {
  exercises: CoachWorkoutExercise[];
  location: string;
  equipment: string;
  timeAvailableMinutes: number;
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
  { name: "Lateral Squat Step", pattern: "squat", kit: ["bodyweight"], reps: "6-8 each side", note: "Step one foot sideways, shift your hips toward that leg, then stand and bring your feet back together. Keep the step small and move within a comfortable range." },
  { name: "Chair Squat", pattern: "squat", kit: ["chair"], reps: "8-12", note: "Tap a sturdy chair lightly before standing." },
  { name: "Wall Sit", pattern: "squat", kit: ["bodyweight"], duration: "20-40 sec", note: "Keep the hold comfortable.", requiresWall: true },
  { name: "Bench Sit-to-Stand", pattern: "squat", kit: ["park_bench"], reps: "8-12", note: "Use a fixed, stable bench at a comfortable height. Stand without pushing off your knees." },
  { name: "Dumbbell Goblet Squat", pattern: "squat", kit: ["dumbbells", "gym"], reps: "8-12", note: "Keep the weight close to your chest." },
  { name: "Dumbbell Front Squat", pattern: "squat", kit: ["dumbbells", "gym"], reps: "8-10", note: "Use a controlled depth.", advanced: true },
  { name: "Standing Band Squat", pattern: "squat", kit: ["bands"], reps: "8-12", note: "Keep the band secure under both feet." },
  { name: "45-Degree Leg Press", pattern: "squat", kit: ["gym"], reps: "10-12", note: "Do not lock your knees." },
  { name: "Seated Leg Press", pattern: "squat", kit: ["gym"], reps: "8-12", note: "Keep your hips on the seat and control the return." },
  { name: "Hack Squat Machine", pattern: "squat", kit: ["gym"], reps: "8-10", note: "Use a comfortable depth with your back supported.", advanced: true },
  { name: "Barbell Back Squat", pattern: "squat", kit: ["gym"], reps: "5-8", note: "Set the bar on your upper back in a rack; squat only to a depth you can control.", advanced: true },
  { name: "Glute Bridge", pattern: "hinge", kit: ["bodyweight"], reps: "10-15", note: "Pause briefly at the top.", requiresFloor: true },
  { name: "Single-Leg Glute Bridge", pattern: "hinge", kit: ["bodyweight"], reps: "8 each side", note: "Keep your hips level.", advanced: true, requiresFloor: true },
  { name: "Standing Bodyweight Hip Hinge", pattern: "hinge", kit: ["bodyweight"], reps: "10-12", note: "Keep your knees soft, push your hips back, then stand tall without rounding your back." },
  { name: "Kickstand Hip Hinge", pattern: "hinge", kit: ["bodyweight"], reps: "8 each side", note: "Place one foot a short step behind on its toes for balance. Keep most weight on the front foot, hinge at your hips with a long back, then stand tall and switch sides." },
  { name: "Dumbbell Romanian Deadlift", pattern: "hinge", kit: ["dumbbells", "gym"], reps: "8-12", note: "Hinge at the hips with a neutral back." },
  { name: "Dumbbell Floor Glute Bridge", pattern: "hinge", kit: ["dumbbells", "gym"], reps: "10-12", note: "Hold one dumbbell securely across your hips.", requiresFloor: true },
  { name: "Band Good Morning", pattern: "hinge", kit: ["bands"], reps: "10-12", note: "Keep the movement controlled." },
  { name: "Cable Pull-Through", pattern: "hinge", kit: ["gym"], reps: "10-12", note: "Drive through your hips." },
  { name: "Barbell Romanian Deadlift", pattern: "hinge", kit: ["gym"], reps: "6-10", note: "Keep the bar close to your legs and stop before your back rounds.", advanced: true },
  { name: "Hip Thrust Machine", pattern: "hinge", kit: ["gym"], reps: "8-12", note: "Keep your upper back supported and raise your hips without over-arching." },
  { name: "Bench Incline Push-Up", pattern: "push", kit: ["gym", "park_bench"], reps: "6-12", note: "Use a fixed, stable bench; keep your body in a straight line." },
  { name: "Bench Incline Plank Hold", pattern: "push", kit: ["park_bench"], duration: "15-25 sec", swapOnly: true, note: "Use only a fixed stable bench. Place both hands on it, walk your feet back, and hold a straight line through your body. This is a lighter shoulder and core option, not the same chest workload as push-ups." },
  { name: "Wall Push-Up", pattern: "push", kit: ["bodyweight"], reps: "10-15", note: "Keep a straight line through your body.", requiresWall: true },
  { name: "Knee Push-Up", pattern: "push", kit: ["bodyweight"], reps: "6-12", note: "Keep your hips in line with your shoulders.", requiresFloor: true },
  { name: "Kneeling Push-Up Hold", pattern: "push", kit: ["bodyweight"], duration: "15-25 sec", swapOnly: true, requiresFloor: true, note: "Place hands below shoulders and knees on the floor. Hold the top push-up position with a straight line from shoulders to knees; stop before your lower back sags. This is a lighter shoulder and core option." },
  { name: "Push-Up", pattern: "push", kit: ["bodyweight"], reps: "6-12", note: "Stop before form breaks down.", advanced: true, requiresFloor: true },
  { name: "Dumbbell Floor Press", pattern: "push", kit: ["dumbbells", "gym"], reps: "8-12", note: "Keep elbows at a comfortable angle.", requiresFloor: true },
  { name: "Dumbbell Bench Press", pattern: "push", kit: ["gym"], reps: "8-12", note: "Use a weight you can control." },
  { name: "Dumbbell Shoulder Press", pattern: "push", kit: ["dumbbells", "gym"], reps: "8-12", note: "Press without leaning backward." },
  { name: "Machine Chest Press", pattern: "push", kit: ["gym"], reps: "8-12", note: "Keep shoulders down and back." },
  { name: "Machine Shoulder Press", pattern: "push", kit: ["gym"], reps: "8-12", note: "Keep your ribs down as you press." },
  { name: "Barbell Bench Press", pattern: "push", kit: ["gym"], reps: "5-8", note: "Use a rack with safeties or a spotter; lower the bar with control.", advanced: true },
  { name: "Standing Band Chest Press", pattern: "push", kit: ["bands"], reps: "10-15", note: "Secure the band across your upper back and press smoothly." },
  { name: "Band Overhead Shoulder Press", pattern: "push", kit: ["bands"], reps: "8-12", note: "Keep the band secure under your feet and avoid leaning back." },
  { name: "Prone W Raise", pattern: "pull", kit: ["bodyweight"], reps: "10-12", note: "Squeeze shoulder blades gently.", requiresFloor: true },
  { name: "Reverse Snow Angel", pattern: "pull", kit: ["bodyweight"], reps: "8-12", note: "Move slowly and stay comfortable.", requiresFloor: true },
  { name: "Bent-Over Dumbbell Row", pattern: "pull", kit: ["dumbbells", "gym"], reps: "8-12", note: "Hinge at your hips and pull both elbows toward your ribs." },
  { name: "Single-Arm Dumbbell Row", pattern: "pull", kit: ["dumbbells", "gym"], reps: "8-12 each side", note: "Brace your free hand on your thigh and keep your torso steady." },
  { name: "Band Bent-Over Row", pattern: "pull", kit: ["bands"], reps: "10-15", note: "Stand on the band and pull both elbows toward your ribs." },
  { name: "Seated Band Row", pattern: "pull", kit: ["bands"], reps: "10-15", note: "Keep the long band secure under both feet and pull your elbows toward your sides.", requiresFloor: true },
  { name: "Seated Cable Row", pattern: "pull", kit: ["gym"], reps: "10-12", note: "Avoid swinging your torso." },
  { name: "Chest-Supported Machine Row", pattern: "pull", kit: ["gym"], reps: "8-12", note: "Keep your chest against the pad." },
  { name: "Bench-Supported Single-Arm Dumbbell Row", pattern: "pull", kit: ["gym"], reps: "8-12 each side", note: "Support your torso on a stable bench." },
  { name: "Lat Pulldown", pattern: "pull", kit: ["gym"], reps: "8-12", note: "Pull to the upper chest." },
  { name: "Machine-Assisted Pull-Up", pattern: "pull", kit: ["gym"], reps: "6-10", note: "Use enough assistance to move with control.", advanced: true },
  { name: "Pull-Up", pattern: "pull", kit: ["gym", "pullup_bar"], reps: "5-8", note: "Use a fixed bar that supports your weight; move without swinging.", advanced: true },
  { name: "Short Bar Hang", pattern: "pull", kit: ["pullup_bar"], duration: "10-20 sec", note: "Use only a fixed bar you can reach and leave safely; keep your shoulders gently engaged. Keep your feet grounded if the bar allows it; never jump to reach it." },
  { name: "Standing Upper-Back Squeeze", pattern: "pull", kit: ["bodyweight"], reps: "8-12", swapOnly: true, note: "This is a light shoulder-blade movement, not a resisted row. Stand tall, bend your elbows by your sides, gently draw the shoulder blades together, then relax. Use it when a bar is not suitable." },
  { name: "Inverted Row", pattern: "pull", kit: ["low_bar"], reps: "6-10", note: "Use a fixed low bar that supports your weight; keep your feet on the ground and pull with control." },
  { name: "Upright Low-Bar Row", pattern: "pull", kit: ["low_bar"], reps: "8-12", note: "Use only a fixed waist-high bar that supports your weight. Keep both feet planted and lean back a little, then pull your chest toward the bar and lower slowly." },
  { name: "Supported Split Squat", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Hold a stable support if needed.", requiresSupport: true },
  { name: "Bodyweight Reverse Lunge", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Step back far enough to stay balanced." },
  { name: "Stationary Split Squat", pattern: "single_leg", kit: ["bodyweight"], reps: "6-10 each side", note: "Keep your feet in a comfortable staggered stance. Bend both knees a little, stand tall, then repeat before switching sides; hold a stable support if needed." },
  { name: "Bodyweight Walking Lunge", pattern: "single_leg", kit: ["bodyweight"], reps: "8 each side", note: "Take controlled steps and keep your balance.", advanced: true, requiresRoomToTravel: true },
  { name: "Low Step-Up", pattern: "single_leg", kit: ["low_step"], reps: "8 each side", note: "Use a sturdy low step." },
  { name: "Dumbbell Reverse Lunge", pattern: "single_leg", kit: ["dumbbells", "gym"], reps: "8 each side", note: "Start light and stay balanced.", advanced: true },
  { name: "Bench Step-Up", pattern: "single_leg", kit: ["gym"], reps: "8 each side", note: "Choose a stable low bench and step down slowly.", advanced: true },
  { name: "Leg Extension", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Straighten your knees smoothly without snapping them.", target: "quads" },
  { name: "Seated Leg Curl", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Keep your hips on the seat as you curl.", target: "hamstrings" },
  { name: "Lying Leg Curl", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Keep your hips against the pad and lower the weight slowly.", target: "hamstrings" },
  { name: "Hip Abduction Machine", pattern: "accessory", kit: ["gym"], reps: "12-15", note: "Move your knees apart without leaning your torso.", target: "glutes" },
  { name: "Pec Deck Fly", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Bring the handles together without shrugging.", target: "chest" },
  { name: "Cable Chest Fly", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Keep a soft elbow bend and steady torso.", target: "chest" },
  { name: "Dumbbell Lateral Raise", pattern: "accessory", kit: ["dumbbells", "gym"], reps: "10-15", note: "Raise only to a comfortable shoulder height.", target: "shoulders" },
  { name: "Dumbbell Front Raise", pattern: "accessory", kit: ["dumbbells", "gym"], reps: "8-12", note: "Use light dumbbells. Raise both arms in front only to shoulder height, keep your elbows soft, and lower slowly without shrugging.", target: "shoulders" },
  { name: "Standing Band Lateral Raise", pattern: "accessory", kit: ["bands"], reps: "10-15", note: "Stand securely on the band and lift only to shoulder height.", target: "shoulders" },
  { name: "Reverse Pec Deck", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Open your arms without shrugging.", target: "rear_delts" },
  { name: "Cable Face Pull", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Pull the rope toward your face with elbows wide.", target: "rear_delts" },
  { name: "Band Pull-Apart", pattern: "accessory", kit: ["bands"], reps: "10-15", note: "Pull the band apart without arching your back.", target: "rear_delts" },
  { name: "Dumbbell Bicep Curl", pattern: "accessory", kit: ["dumbbells", "gym"], reps: "10-15", note: "Keep your elbows near your sides.", target: "biceps" },
  { name: "Dumbbell Hammer Curl", pattern: "accessory", kit: ["dumbbells", "gym"], reps: "10-15", note: "Keep your palms facing inward and elbows near your sides. Curl with control without swinging your torso.", target: "biceps" },
  { name: "Standing Band Biceps Curl", pattern: "accessory", kit: ["bands"], reps: "10-15", note: "Stand on the long band with both feet and keep your elbows close to your ribs.", target: "biceps" },
  { name: "Standing Band Hammer Curl", pattern: "accessory", kit: ["bands"], reps: "10-15", note: "Secure the long band under both feet and keep palms facing inward. Curl with elbows close to your sides and lower slowly.", target: "biceps" },
  { name: "Straight-Bar Cable Triceps Pushdown", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Keep your elbows near your sides as you press down.", target: "triceps" },
  { name: "Band Overhead Triceps Extension", pattern: "accessory", kit: ["bands"], reps: "10-15", note: "Secure the band under one foot; keep your elbows pointing up and stop if your shoulders feel uncomfortable.", target: "triceps" },
  { name: "Standing Band Triceps Kickback", pattern: "accessory", kit: ["bands"], reps: "10-15 each side", note: "Pin the long band securely under one foot. Hinge slightly, keep your upper arm beside your torso, straighten your elbow backward, then return slowly and switch arms.", target: "triceps" },
  { name: "Standing Calf Raise", pattern: "accessory", kit: ["bodyweight"], reps: "12-20", note: "Lift both heels slowly on flat ground and lower with control.", target: "calves" },
  { name: "Bent-Knee Calf Raise", pattern: "accessory", kit: ["bodyweight"], reps: "12-20", note: "Keep a small knee bend, lift both heels slowly on flat ground, then lower with control. Hold stable support if balance is uncertain.", target: "calves" },
  { name: "Standing Dumbbell Calf Raise", pattern: "accessory", kit: ["dumbbells", "gym"], reps: "10-15", note: "Hold dumbbells at your sides and raise both heels on flat ground.", target: "calves" },
  { name: "Seated Dumbbell Calf Raise", pattern: "accessory", kit: ["gym"], reps: "12-15", note: "Raise your heels slowly with the dumbbell steady on your thighs.", target: "calves" },
  { name: "Seated Calf Raise Machine", pattern: "accessory", kit: ["gym"], reps: "12-15", note: "Lift your heels through a comfortable range.", target: "calves" },
  { name: "Standing Calf Raise Machine", pattern: "accessory", kit: ["gym"], reps: "10-15", note: "Keep the shoulder pads secure and raise your heels without bouncing.", target: "calves" },
  { name: "Dumbbell Suitcase Hold", pattern: "core", kit: ["dumbbells", "gym"], duration: "20-40 sec each side", note: "Hold one dumbbell by your side; stay tall without leaning, then switch hands." },
  { name: "Cable Pallof Press", pattern: "core", kit: ["gym"], reps: "8-12 each side", note: "Set the cable at chest height, stand sideways to it, press forward and resist twisting." },
  { name: "Dead Bug", pattern: "core", kit: ["bodyweight"], reps: "8 each side", note: "Keep your lower back comfortable.", requiresFloor: true },
  { name: "Bird-Dog", pattern: "core", kit: ["bodyweight"], reps: "8 each side", note: "Reach long without twisting.", requiresFloor: true },
  { name: "Forearm Side Plank", pattern: "core", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Bend the lower knee if needed.", advanced: true, requiresFloor: true },
  { name: "Forearm Plank", pattern: "core", kit: ["bodyweight"], duration: "20-40 sec", note: "Breathe steadily.", requiresFloor: true },
  { name: "Standing Knee Raise", pattern: "core", kit: ["bodyweight"], reps: "8-12 each side", note: "Lift one knee slowly while staying tall; keep the lift low if balance is uncertain." },
  { name: "Standing Cross-Body Knee Drive", pattern: "core", kit: ["bodyweight"], reps: "8 each side", note: "Raise one knee toward the opposite elbow at a slow pace, turning your torso only a little. Put your foot down between reps and keep your balance." },
  { name: "Hanging Knee Raise", pattern: "core", kit: ["gym", "pullup_bar"], reps: "8-12", note: "Use a fixed bar that supports your weight; raise your knees without swinging.", advanced: true },
  { name: "Tandem Stand", pattern: "balance", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Stand heel-to-toe near stable support and switch which foot leads.", requiresSupport: true },
  { name: "Supported Single-Leg Stand", pattern: "balance", kit: ["bodyweight"], duration: "15-30 sec each side", note: "Touch a stable wall lightly, lift one foot a little, and switch sides.", requiresSupport: true },
  { name: "Easy Walk", pattern: "cardio", kit: ["bodyweight"], duration: "8-15 min", note: "Keep a conversational pace." },
  { name: "Brisk Walk", pattern: "cardio", kit: ["bodyweight"], duration: "8-15 min", note: "Walk at a sustainable pace." },
  { name: "Walk Intervals", pattern: "cardio", kit: ["route"], duration: "8-15 min", note: "Alternate 2 minutes easy walking with 1 minute brisk walking on a safe, level route." },
  { name: "Walk-Jog Intervals", pattern: "cardio", kit: ["route"], duration: "8-15 min", note: "Alternate 2 minutes walking with 30 seconds easy jogging; slow down if breathing or form becomes strained.", advanced: true },
  { name: "Stationary Bike", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Stay at a comfortable effort." },
  { name: "Treadmill Walk", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Use a comfortable incline." },
  { name: "Elliptical Trainer", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Use a smooth, comfortable stride and steady effort." },
  { name: "Rowing Machine", pattern: "cardio", kit: ["gym"], duration: "8-15 min", note: "Push with your legs, then finish with your arms; return slowly." },
  { name: "March in Place", pattern: "cardio", kit: ["bodyweight"], duration: "5-10 min", note: "Move at a comfortable pace." },
  { name: "Side Step Touch", pattern: "cardio", kit: ["bodyweight"], duration: "5-10 min", note: "Step side to side quietly in a clear space; do not hop." },
  { name: "Gentle Knee March", pattern: "cardio", kit: ["bodyweight"], duration: "5-10 min", note: "Alternate low knee lifts at a comfortable pace. Keep a hand near stable support if balance feels uncertain, and do not force the knees high." },
  { name: "Cat-Cow", pattern: "mobility", kit: ["bodyweight"], reps: "6-10", note: "Move gently with your breath.", requiresFloor: true },
  { name: "Thread the Needle", pattern: "mobility", kit: ["bodyweight"], reps: "6 each side", note: "Rotate only as far as comfortable.", requiresFloor: true },
  { name: "Kneeling Hip Flexor Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "30 sec each side", note: "Keep the stretch gentle.", requiresFloor: true },
  { name: "Child's Pose", pattern: "mobility", kit: ["bodyweight"], duration: "30-60 sec", note: "Breathe slowly.", requiresFloor: true },
  { name: "Standing Quad Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "30 sec each side", note: "Use a wall for balance if needed." },
  { name: "Standing Calf Stretch", pattern: "mobility", kit: ["bodyweight"], duration: "30 sec each side", note: "Keep the heel down and use a stable wall.", requiresWall: true },
  { name: "Standing Torso Rotation", pattern: "mobility", kit: ["bodyweight"], reps: "6 each side", note: "Turn gently without forcing your back." },
  { name: "Standing Side Bend", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Keep both feet planted and move comfortably." },
  { name: "Standing Chest Opener", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec", note: "Open your chest gently without arching your back." },
  { name: "Standing Hamstring Hinge", pattern: "mobility", kit: ["bodyweight"], duration: "20-30 sec each side", note: "Hinge gently with a long back." },
  { name: "Standing Hip Circles", pattern: "mobility", kit: ["bodyweight"], reps: "5 each direction", note: "Stand with feet hip-width and hands on your hips. Make small, slow circles through your hips with soft knees, without forcing your back." },
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

function movementFamily(item: CatalogExercise): string {
  if (item.pattern === "accessory") return item.target ?? "accessory";
  if (item.pattern === "push") return /shoulder|overhead/i.test(item.name) ? "vertical_push" : "horizontal_push";
  if (item.pattern === "pull") return /pulldown|pull-up|bar hang/i.test(item.name) ? "vertical_pull" : "horizontal_pull";
  if (item.pattern === "squat") return /leg press/i.test(item.name) ? "leg_press" : "squat";
  if (item.pattern === "hinge") return /bridge/i.test(item.name) ? "glute_bridge" : "hip_hinge";
  return item.pattern;
}

function catalogItemFor(name: string): CatalogExercise | undefined {
  return V2_WORKOUT_CATALOG.find(item => key(item.name) === key(name));
}

function patternFor(name: string): Pattern | null {
  const known = V2_WORKOUT_CATALOG.find(item => key(item.name) === key(name));
  if (known) return known.pattern;
  const value = name.toLowerCase();
  if (/squat|leg press|wall sit/.test(value)) return "squat";
  if (/deadlift|good morning|glute bridge|hip thrust|pull.through/.test(value)) return "hinge";
  if (/lunge|split squat|step.up/.test(value)) return "single_leg";
  if (/push.up|chest press|bench press|overhead press/.test(value)) return "push";
  if (/rowing machine|rowing erg|indoor rowing|rower/.test(value)) return "cardio";
  if (/row|pulldown|pull.up|chin.up/.test(value)) return "pull";
  if (/plank|dead bug|bird.dog|pallof/.test(value)) return "core";
  if (/tandem stand|single.leg stand/.test(value)) return "balance";
  if (/walk|run|cycle|bike|march|cardio/.test(value)) return "cardio";
  if (/stretch|mobility|pose|cat.cow/.test(value)) return "mobility";
  return null;
}

export function summarizeWorkoutExerciseHistory(rows: WorkoutHistoryRow[], timezoneOffsetMinutes = 0) {
  return rows.map(row => {
    const metadata = row.metadata ?? {};
    const exercises = Array.isArray(metadata.completedPlanExercises) ? metadata.completedPlanExercises
      : Array.isArray(metadata.exercises) ? metadata.exercises : [];
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
  // A manual burn log can be a real completed workout without named exercises.
  // Keep it for same-day recovery while ignoring empty planned records.
  }).filter(session => session.date && (session.names.length > 0 || session.evidence !== "planned")).slice(0, 12);
}

function recentObservedNote(name: string, rows: WorkoutHistoryRow[], prescribedReps: string | null | undefined) {
  const recent = rows.find(row => row.metadata?.evidenceType === "observed_performance" &&
    Array.isArray(row.metadata.exercises) && row.metadata.exercises.some(value => value && typeof value === "object" &&
      key(String((value as Record<string, unknown>).name ?? "")) === key(name) &&
      (typeof (value as Record<string, unknown>).reps === "string" || typeof (value as Record<string, unknown>).load === "number" ||
        typeof (value as Record<string, unknown>).durationMinutes === "number" ||
        (value as Record<string, unknown>).durationUnit === "seconds")));
  if (!recent || !Array.isArray(recent.metadata?.exercises)) return null;
  const exercise = recent.metadata.exercises.find(value => value && typeof value === "object" &&
    key(String((value as Record<string, unknown>).name ?? "")) === key(name)) as Record<string, unknown> | undefined;
  if (!exercise) return null;
  const reps = typeof exercise.reps === "string" && /^\d{1,3}(?:\s*[,/]\s*\d{1,3})*$/.test(exercise.reps)
    ? exercise.reps : null;
  const load = typeof exercise.load === "number" && Number.isFinite(exercise.load) ? exercise.load : null;
  const minutes = typeof exercise.durationMinutes === "number" && Number.isFinite(exercise.durationMinutes) ? exercise.durationMinutes : null;
  const seconds = exercise.durationUnit === "seconds" && typeof exercise.durationValue === "number" && Number.isFinite(exercise.durationValue)
    ? exercise.durationValue : null;
  if (!reps && load === null && minutes === null && seconds === null) return null;
  const sets = typeof exercise.sets === "number" && Number.isInteger(exercise.sets) ? `${exercise.sets} sets, ` : "";
  const lastTime = `${sets}${reps ? `${reps} reps` : seconds !== null ? `${seconds} sec` : minutes !== null ? `${minutes} min` : "reps not recorded"}${load !== null ? ` at ${load} ${exercise.loadUnit === "lb" ? "lb" : "kg"}` : ""}`;
  const upper = prescribedReps?.match(/^\d+\s*[-–]\s*(\d+)/)?.[1];
  const actualReps = reps && /^\d{1,3}$/.test(reps) ? Number(reps) : null;
  const effort = recent.metadata.effortRating;
  const repeatedAtTop = Boolean(upper && load !== null && rows.some(row => row !== recent &&
    row.metadata?.evidenceType === "observed_performance" && row.metadata.effortRating !== "too_hard" &&
    Array.isArray(row.metadata.exercises) && row.metadata.exercises.some(value => {
      if (!value || typeof value !== "object") return false;
      const previous = value as Record<string, unknown>;
      return key(String(previous.name ?? "")) === key(name) && previous.load === load &&
        previous.loadUnit === exercise.loadUnit && typeof previous.reps === "string" &&
        /^\d{1,3}$/.test(previous.reps) && Number(previous.reps) >= Number(upper);
    })));
  const next = effort === "too_hard" ? "Keep the effort comfortable and focus on form today."
    : seconds !== null ? "Add a few seconds only when the hold feels controlled and comfortable."
    : upper && actualReps !== null && actualReps < Number(upper)
      ? `${load !== null ? "With the same load, aim" : "Aim"} for one more rep per set, up to ${upper}, if form stays good.`
      : upper && actualReps !== null && actualReps >= Number(upper) && load !== null
        ? repeatedAtTop ? "If that felt controlled, try the next small weight increase; otherwise repeat it."
          : "Repeat this load once with good form before increasing it."
        : "Use it as a reference and keep the movement controlled.";
  return `Last logged: ${lastTime}. ${next}`;
}

function recentObservedHoldSeconds(name: string, rows: WorkoutHistoryRow[]) {
  for (const row of rows) {
    if (row.metadata?.evidenceType !== "observed_performance" || !Array.isArray(row.metadata.exercises)) continue;
    const exercise = row.metadata.exercises.find(value => value && typeof value === "object" &&
      key(String((value as Record<string, unknown>).name ?? "")) === key(name)) as Record<string, unknown> | undefined;
    if (exercise?.durationUnit === "seconds" && typeof exercise.durationValue === "number" &&
      Number.isFinite(exercise.durationValue)) {
      return { seconds: exercise.durationValue, effort: row.metadata.effortRating };
    }
  }
  return null;
}

function availableKit(equipment: string, location: string): Set<Kit> {
  const value = equipment.toLowerCase();
  const kit = new Set<Kit>(["bodyweight"]);
  if (/sturdy chair/.test(value)) kit.add("chair");
  if (/low step/.test(value)) kit.add("low_step");
  if (/dumbbell|full gym|limited gym/.test(value)) kit.add("dumbbells");
  if (/band/.test(value)) kit.add("bands");
  if (/full gym/.test(value)) kit.add("gym");
  if (location === "outdoors") {
    if (/route/.test(value)) kit.add("route");
    if (value === "park bench") kit.add("park_bench");
    if (value === "low exercise bar") kit.add("low_bar");
    if (value === "pull-up bar") kit.add("pullup_bar");
    if (value === "exercise mat") kit.add("mat");
    // The old combined choice did not confirm which fixture was available.
    // Keep old saved requests on bodyweight rather than inventing a bench or bar.
  }
  return kit;
}

function suitableForSetting(item: CatalogExercise, kit: Set<Kit>, location: string): boolean {
  if (!item.kit.some(value => kit.has(value))) return false;
  if (item.name === "Gentle Knee March" && location !== "hotel") return false;
  if (location === "outdoors") {
    if (item.requiresFloor && !kit.has("mat")) return false;
    if (item.requiresWall) return false;
    if (item.requiresSupport) return false;
  }
  if (location === "hotel") {
    if (item.requiresRoomToTravel) return false;
    if (item.name === "Easy Walk" || item.name === "Brisk Walk") return false;
  }
  return true;
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
      ["squat", "hinge", "push", "pull", "accessory"],
      ["squat", "hinge", "push", "pull", "accessory", "accessory"]
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
      ["cardio", "mobility", "balance", "core"],
      ["cardio", "mobility", "balance", "core"],
      ["cardio", "mobility", "mobility", "balance", "core"]
    ],
    mobility: [
      ["mobility", "mobility", "mobility"],
      ["mobility", "mobility", "balance", "core"],
      ["mobility", "mobility", "mobility", "balance", "core"],
      ["mobility", "mobility", "mobility", "mobility", "balance", "core"]
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
  completedWorkoutToday?: boolean;
}): WorkoutBlueprint {
  const history = summarizeWorkoutExerciseHistory(input.recentWorkouts, input.timezoneOffsetMinutes);
  const today = input.today ?? localDateKeyAtOffset(new Date(), input.timezoneOffsetMinutes);
  const latestCompleted = history.find(session => session.evidence !== "planned");
  const latestAgeMs = latestCompleted ? Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latestCompleted.date}T00:00:00Z`) : Number.NaN;
  const latest = latestAgeMs >= 0 && latestAgeMs <= 7 * 86_400_000 ? latestCompleted : null;
  const trainedToday = latest?.date === today || input.completedWorkoutToday === true;
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
      if (pattern === "balance") patterns[index] = "mobility";
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
  if (kit.has("low_step") && !gentle && !patterns.includes("single_leg")) {
    // A low step supports a knee-dominant movement. Give it a real session
    // slot rather than collecting an equipment answer that changes nothing.
    const squatIndex = patterns.indexOf("squat");
    if (squatIndex >= 0) patterns[squatIndex] = "single_leg";
  }
  if (goal === "muscle_gain") {
    // A small equipment kit must never force the same accessory twice, or
    // prescribe an unavailable machine just to fill a template slot.
    const accessoryCount = new Set(V2_WORKOUT_CATALOG.filter(item => item.pattern === "accessory" && suitableForSetting(item, kit, input.location))
      .map(item => item.target)).size;
    let usedAccessorySlots = 0;
    for (const [index, pattern] of patterns.entries()) {
      if (pattern === "accessory" && ++usedAccessorySlots > accessoryCount) {
        patterns[index] = patterns.includes("single_leg") ? "core" : "single_leg";
      }
    }
  }
  const preferredKit: Kit = /full gym/.test(input.equipment.toLowerCase()) ? "gym"
    : /dumbbell|limited gym/.test(input.equipment.toLowerCase()) ? "dumbbells"
      : /band/.test(input.equipment.toLowerCase()) ? "bands"
        : kit.has("route") ? "route" : kit.has("park_bench") ? "park_bench"
          : kit.has("low_bar") ? "low_bar" : kit.has("pullup_bar") ? "pullup_bar"
            : kit.has("chair") ? "chair" : kit.has("low_step") ? "low_step" : "bodyweight";
  const avoided = new Set((input.avoidExercises ?? []).map(key));
  const selected = new Set<string>();
  const selectedFamilies = new Set<string>();
  const recentNames = history.slice(0, 2).flatMap(session => session.names.map(key));
  const allNames = history.flatMap(session => session.names.map(key));
  const completedNames = new Set(history.filter(session => session.evidence !== "planned").flatMap(session => session.names.map(key)));
  const anchorNames = new Set(!gentle && latest && latestAgeMs >= 2 * 86_400_000 && latest.effort !== "too_hard"
    ? latest.names.filter(name => ["squat", "hinge", "push", "pull", "single_leg"].includes(patternFor(name) ?? "")).slice(0, 2).map(key)
    : []);
  const hasRunningHistory = history.some(session => session.evidence !== "planned" && session.names.some(name => /\brun(?:ning)?\b|\bjog(?:ging)?\b/i.test(name)));
  const eligibleChoices = (pattern: Pattern) => V2_WORKOUT_CATALOG.filter(item => item.pattern === pattern
    && suitableForSetting(item, kit, input.location)
    && (!(input.conservative || gentle) || !item.advanced)
    && (!gentle || item.pattern !== "cardio" || !["Brisk Walk", "Walk Intervals", "Walk-Jog Intervals", "Rowing Machine"].includes(item.name)));
  const swapEligible = (item: CatalogExercise) =>
    !(["Pull-Up", "Hanging Knee Raise", "Barbell Back Squat", "Barbell Romanian Deadlift", "Barbell Bench Press"].includes(item.name) && !completedNames.has(key(item.name)))
    && (item.name !== "Walk-Jog Intervals" || hasRunningHistory);
  const primaryEligible = (item: CatalogExercise) => !item.swapOnly && swapEligible(item);
  const mostRecentDay = history.find(session => session.date && session.date <= today)?.date;
  const mostRecentDayAgeMs = mostRecentDay
    ? Date.parse(`${today}T00:00:00Z`) - Date.parse(`${mostRecentDay}T00:00:00Z`)
    : Number.NaN;
  const mostRecentDayNames = new Set(mostRecentDayAgeMs >= 0 && mostRecentDayAgeMs <= 7 * 86_400_000
    ? history.filter(session => session.date === mostRecentDay).flatMap(session => session.names.map(key))
    : []);
  const mostRecentDayFamilies = new Set([...mostRecentDayNames].map(name => catalogItemFor(name)).filter((item): item is CatalogExercise => Boolean(item)).map(movementFamily));
  const recentAccessoryTargets = history.slice(0, 4).flatMap(session => session.names.map(catalogItemFor)
    .filter((item): item is CatalogExercise => item?.pattern === "accessory" && Boolean(item.target)).map(item => item.target!));
  const availableSquats = eligibleChoices("squat");
  if (patterns.includes("squat") && availableSquats.length === 1 && mostRecentDayNames.has(key(availableSquats[0].name))) {
    // A single suitable squat would otherwise repeat every day. Rotate that
    // slot to another lower-body pattern, or cardio if both are already in the plan.
    patterns[patterns.indexOf("squat")] = !patterns.includes("single_leg") ? "single_leg"
      : !patterns.includes("hinge") ? "hinge" : "cardio";
  }
  // Some settings cannot safely supply every template movement. Replace an
  // impossible slot with a distinct movement the selected space actually supports.
  const substitutions: Record<Pattern, Pattern[]> = {
    squat: ["single_leg", "hinge", "cardio", "mobility"],
    hinge: ["single_leg", "squat", "cardio", "mobility"],
    push: ["pull", "single_leg", "cardio", "mobility", "core"],
    pull: ["single_leg", "hinge", "cardio", "mobility", "core"],
    single_leg: ["squat", "hinge", "cardio", "mobility"],
    accessory: ["single_leg", "core", "cardio", "mobility"],
    core: ["mobility", "cardio", "single_leg", "hinge"],
    cardio: ["mobility", "core", "single_leg"],
    mobility: ["cardio", "core", "single_leg"],
    balance: ["mobility", "core", "cardio"]
  };
  for (let index = 0; index < patterns.length; index++) {
    if (eligibleChoices(patterns[index]).some(primaryEligible)) continue;
    const replacement = substitutions[patterns[index]].find(pattern => !patterns.includes(pattern)
      && eligibleChoices(pattern).some(primaryEligible));
    if (replacement) patterns[index] = replacement;
    else patterns.splice(index--, 1);
  }
  const prescribe = (item: CatalogExercise): Omit<CoachWorkoutExercise, "alternatives"> => ({
    name: item.name,
    sets: item.duration ? gentle && item.pattern === "mobility" ? 2 : null
      : item.name === "Standing Upper-Back Squeeze" ? 1
      : ["core", "mobility", "balance"].includes(item.pattern) ? 2
      : latest?.effort === "too_hard" && latest.names.some(name => key(name) === key(item.name)) ? 2
      : input.conservative || gentle || minutes <= 20 ? 2 : goal === "muscle_gain" || minutes >= 45 ? 3 : 2,
    reps: goal === "strength" && !input.conservative && item.reps && ["squat", "hinge", "push", "pull", "single_leg"].includes(item.pattern)
      && item.kit.some(value => value === "dumbbells" || value === "gym")
      ? item.reps.includes("each side") ? "6-10 each side" : "6-10" : item.reps ?? null,
    duration: item.name === "Short Bar Hang" ? (() => {
      const hold = recentObservedHoldSeconds(item.name, input.recentWorkouts);
      return hold && hold.effort !== "too_hard" ? hold.seconds >= 15 ? "15-20 sec" : hold.seconds >= 10 ? "10-15 sec" : "5-10 sec"
        : "5-10 sec";
    })()
      : item.pattern === "cardio" ? minutes <= 20 ? "5-8 min" : goal === "recovery" ? "10-15 min" : minutes >= 60 ? "12-20 min" : "8-15 min" : item.duration ?? null,
    rest: item.pattern === "cardio" ? null
      : item.name === "Standing Upper-Back Squeeze" ? "As needed"
      : gentle || item.pattern === "mobility" || item.pattern === "balance" ? "As needed"
        : item.pattern === "core" ? "30-60 sec"
          : goal === "strength" ? "90-120 sec" : goal === "fat_loss" || goal === "general_fitness" ? "45-75 sec" : "60-90 sec",
    note: [item.note, recentObservedNote(item.name, input.recentWorkouts, item.reps)].filter(Boolean).join(" ")
  });
  const exercises = patterns.map((pattern, index) => {
    const choices = eligibleChoices(pattern);
    const ranked = choices.map(item => ({ item, score:
      (selected.has(key(item.name)) ? 1000 : 0) +
      (avoided.has(key(item.name)) ? 200 : 0) +
      // Prefer a different movement from the last training day whenever the
      // available equipment offers one. An explicit avoid still ranks higher.
      (mostRecentDayNames.has(key(item.name)) ? 90 : 0) +
      (anchorNames.has(key(item.name)) ? -180 : 0) +
      // Prefer a different angle after the last session, while keeping each
      // movement family available again once enough recovery time has passed.
      (mostRecentDayFamilies.has(movementFamily(item)) ? 14 : 0) +
      (recentNames.includes(key(item.name)) ? 35 : 0) +
      (allNames.includes(key(item.name)) ? index === 0 ? -12 : 5 : 0) +
      (selectedFamilies.has(movementFamily(item)) ? 80 : 0) +
      (item.pattern === "accessory" ? recentAccessoryTargets.filter(target => target === item.target).length * 12 : 0) +
      (item.pattern === "cardio" && input.location !== "hotel" && ["March in Place", "Side Step Touch"].includes(item.name) ? 25 : 0) +
      (preferredKit === "gym" && !gentle && ["squat", "hinge", "push", "pull"].includes(item.pattern)
        && (!item.kit.includes("gym") || item.name === "Bench Incline Push-Up") ? 45 : 0) +
      (!gentle && item.kit.includes(preferredKit) ? -8 : 0) +
      (hash(`${today}:${pattern}:${item.name}`) % (pattern === "accessory" ? 31 : 7))
    })).sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
    // Completed history gates advanced bar work and jogging in both the plan
    // and its swaps. A planned exercise alone does not establish ability.
    const primaryChoices = ranked.filter(choice => primaryEligible(choice.item));
    const chosen = primaryChoices[0].item;
    selected.add(key(chosen.name));
    selectedFamilies.add(movementFamily(chosen));
    // An accessory swap must still work the intended area; a biceps curl is
    // not a substitute for a leg curl just because both are accessories.
    const alternatives = ranked.filter(choice => swapEligible(choice.item) && key(choice.item.name) !== key(chosen.name)
      && (pattern !== "accessory" || choice.item.target === chosen.target)).map(choice => prescribe(choice.item));
    const recentAnchor = allNames.includes(key(chosen.name)) && !recentNames.includes(key(chosen.name)) && !mostRecentDayNames.has(key(chosen.name));
    const prescription = prescribe(chosen);
    return {
      ...prescription,
      note: recentAnchor ? `Familiar movement to build consistency. ${prescription.note}` : prescription.note,
      alternatives
    };
  });
  const planNames = new Set(exercises.map(exercise => key(exercise.name)));
  for (const exercise of exercises) {
    // Keep other planned movements at the end. They are unavailable for an
    // initial swap, but become useful after an earlier swap frees that slot.
    const alternatives = exercise.alternatives ?? [];
    exercise.alternatives = [
      ...alternatives.filter(candidate => !planNames.has(key(candidate.name))),
      ...alternatives.filter(candidate => planNames.has(key(candidate.name)))
    ].slice(0, 12);
  }
  // Cardio can fill a template gap outdoors. Keep that fallback within the
  // time the member actually has, rather than letting its default range run long.
  const projectedMinutes = estimateWorkoutDurationMinutes(exercises);
  if (projectedMinutes > minutes + 1) {
    const cardio = exercises.find(exercise => catalogItemFor(exercise.name)?.pattern === "cardio" && exercise.duration?.includes("min"));
    if (cardio?.duration) {
      const bounds = cardio.duration.match(/(\d+)(?:-(\d+))?/);
      const midpoint = bounds ? (Number(bounds[1]) + Number(bounds[2] ?? bounds[1])) / 2 : 0;
      cardio.duration = `${Math.max(5, Math.floor(midpoint - (projectedMinutes - minutes)))} min`;
    }
  }
  if ([20, 30, 45, 60].includes(minutes)) {
    // Fill the time selected in the builder with comfortable movement, while
    // keeping cautious resistance work at two sets and recovery work gentle.
    const targetMinutes = minutes === 60 ? 60 : minutes === 45 ? 40 : minutes === 30 ? 27 : 18;
    for (let index = exercises.length - 1; index >= 0; index--) {
      const exercise = exercises[index];
      if (catalogItemFor(exercise.name)?.pattern !== "cardio") continue;
      if (avoided.has(key(exercise.name))) {
        exercises.splice(index, 1);
      } else {
        exercise.alternatives = exercise.alternatives?.filter(candidate => !avoided.has(key(candidate.name)));
      }
    }
    if (gentle && minutes >= 45) {
      for (const exercise of exercises) {
        if (catalogItemFor(exercise.name)?.pattern === "mobility" && exercise.sets) {
          exercise.sets = Math.max(3, exercise.sets);
          exercise.alternatives = exercise.alternatives?.map(candidate => ({ ...candidate, sets: Math.max(3, candidate.sets ?? 1) }));
        }
      }
    }
    const longCardioEligible = (item: CatalogExercise) => primaryEligible(item)
      && (!gentle || !["Brisk Walk", "Walk Intervals", "Walk-Jog Intervals", "Rowing Machine"].includes(item.name));
    const cardioLimit = (name: string) => input.location === "hotel" ? minutes === 20 ? 10 : minutes === 30 ? 16 : 22
      : ["March in Place", "Side Step Touch"].includes(name) ? minutes === 20 ? 10 : minutes === 30 ? 16 : 15
      : ["Walk-Jog Intervals", "Walk Intervals", "Rowing Machine"].includes(name)
        ? minutes === 20 ? 10 : minutes === 30 ? 15 : 20
        : minutes === 20 ? 10 : minutes === 30 ? 16 : minutes === 45 ? 25 : 35;
    const setCardioMinutes = (exercise: CoachWorkoutExercise, durationMinutes: number) => {
      exercise.duration = `${durationMinutes} min`;
      exercise.alternatives = exercise.alternatives?.filter(candidate => {
        const item = catalogItemFor(candidate.name);
        return item?.pattern === "cardio" && longCardioEligible(item)
          && !avoided.has(key(item.name));
      }).map(candidate => ({ ...candidate, duration: `${Math.min(durationMinutes, cardioLimit(candidate.name))} min` }));
    };
    for (const exercise of exercises) {
      if (catalogItemFor(exercise.name)?.pattern !== "cardio" || !exercise.duration?.includes("min")) continue;
      const bounds = exercise.duration.match(/(\d+)(?:-(\d+))?/);
      const current = bounds ? Math.round((Number(bounds[1]) + Number(bounds[2] ?? bounds[1])) / 2) : 0;
      const gap = targetMinutes - estimateWorkoutDurationMinutes(exercises);
      setCardioMinutes(exercise, Math.min(cardioLimit(exercise.name), current + Math.max(0, gap)));
    }
    while (estimateWorkoutDurationMinutes(exercises) < targetMinutes - 1) {
      const remaining = targetMinutes - estimateWorkoutDurationMinutes(exercises) - 1;
      const existingCardio = exercises.filter(exercise => catalogItemFor(exercise.name)?.pattern === "cardio");
      if (minutes >= 45 && input.location !== "hotel" && existingCardio.length === 1 && remaining <= 5
        && Number.parseInt(existingCardio[0].duration ?? "0", 10) >= 20) {
        const mobilityChoices = eligibleChoices("mobility").filter(item => primaryEligible(item)
          && !avoided.has(key(item.name)) && !exercises.some(exercise => key(exercise.name) === key(item.name)));
        mobilityChoices.sort((a, b) => Number(mostRecentDayNames.has(key(a.name))) - Number(mostRecentDayNames.has(key(b.name)))
          || Number(a.name !== "Standing Chest Opener") - Number(b.name !== "Standing Chest Opener")
          || a.name.localeCompare(b.name));
        const mobility = mobilityChoices[0];
        if (mobility) {
          const alternatives = eligibleChoices("mobility").filter(item => primaryEligible(item) && item.name !== mobility.name
            && !avoided.has(key(item.name))).map(item => ({ ...prescribe(item), sets: 3, rest: "As needed" }));
          const prescription = prescribe(mobility);
          exercises.push({ ...prescription, note: prescription.note, sets: 3, rest: "As needed", alternatives });
          continue;
        }
      }
      const candidates = eligibleChoices("cardio").filter(item => longCardioEligible(item)
        && !avoided.has(key(item.name))
        && !exercises.some(exercise => key(exercise.name) === key(item.name)));
      const preference = input.location === "hotel" ? ["March in Place", "Side Step Touch", "Gentle Knee March"]
        : kit.has("gym") ? ["Treadmill Walk", "Stationary Bike", "Easy Walk", "Elliptical Trainer"]
          : kit.has("route") && !gentle ? ["Walk Intervals", "Easy Walk", "March in Place"]
            : ["Easy Walk", "March in Place", "Side Step Touch", "Brisk Walk"];
      candidates.sort((a, b) => Number(mostRecentDayNames.has(key(a.name))) - Number(mostRecentDayNames.has(key(b.name)))
        || (preference.includes(a.name) ? preference.indexOf(a.name) : 100)
          - (preference.includes(b.name) ? preference.indexOf(b.name) : 100)
        || a.name.localeCompare(b.name));
      const chosen = candidates[0];
      if (!chosen) break;
      const gap = targetMinutes - estimateWorkoutDurationMinutes(exercises) - 1; // transition into the added block
      const durationMinutes = Math.min(cardioLimit(chosen.name), Math.max(3, gap));
      const alternatives = eligibleChoices("cardio").filter(item => longCardioEligible(item)
        && !avoided.has(key(item.name))
        && item.name !== chosen.name)
        .map(item => ({ ...prescribe(item), duration: `${Math.min(durationMinutes, cardioLimit(item.name))} min` }));
      const prescription = prescribe(chosen);
      exercises.push({ ...prescription, note: prescription.note, duration: `${durationMinutes} min`, alternatives });
    }
  }
  const strengthGoal = goal === "strength" || goal === "muscle_gain";
  const resistedPull = exercises.some(exercise => catalogItemFor(exercise.name)?.pattern === "pull"
    && !["Prone W Raise", "Reverse Snow Angel", "Short Bar Hang", "Standing Upper-Back Squeeze"].includes(exercise.name));
  const limitedOutdoorResistance = input.location === "outdoors" && !gentle
    && (!patterns.includes("push") || !resistedPull);
  const limitedIndoorBodyweightResistance = input.location !== "outdoors" && !gentle && !resistedPull
    && !kit.has("gym") && !kit.has("dumbbells") && !kit.has("bands");
  const limitedIndoorFocus = emphasis === "upper" ? "Upper body strength practice"
    : emphasis === "lower" ? "Lower body strength practice" : "Bodyweight strength practice";
  const focus = limitedOutdoorResistance ? strengthGoal ? "Outdoor strength and conditioning" : "Outdoor movement and conditioning"
    : limitedIndoorBodyweightResistance ? strengthGoal ? limitedIndoorFocus : "Bodyweight strength and cardio"
    : goal === "recovery" ? "Recovery and mobility" : goal === "mobility" ? "Mobility and range of motion"
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
  const settingReason = input.location === "outdoors" && !kit.has("mat")
    ? "The outdoor exercises stay off the ground because you did not select a mat."
    : input.location === "hotel" ? "The hotel-room exercises avoid unconfirmed furniture and long travel space." : "";
  const usesSelectedEquipment = input.equipment === "Bodyweight" || exercises.some(exercise => {
    const item = catalogItemFor(exercise.name);
    return input.equipment === "Exercise Mat" ? item?.requiresFloor === true : item?.kit.includes(preferredKit) === true;
  });
  const equipmentReason = usesSelectedEquipment ? ""
    : kit.has("route") ? "Use your chosen route for the warm-up and cooldown."
      : gentle ? `Your ${input.equipment.toLowerCase()} is available, but this easy session does not need it.`
        : history.some(session => session.evidence !== "planned")
          ? `Your ${input.equipment.toLowerCase()} is available, but Zoe rotated to other movements after your recent workouts.`
          : `Your ${input.equipment.toLowerCase()} is available, but this short session prioritizes other movements.`;
  const barIntroduction = kit.has("pullup_bar") && exercises.some(exercise => exercise.name === "Short Bar Hang") && !completedNames.has(key("Pull-Up"))
    ? "The bar is used for a short hold; Zoe has no completed pull-up on record yet." : "";
  const anchorReason = exercises.some(exercise => anchorNames.has(key(exercise.name)))
    ? "A familiar movement returns so you can build on it, while the rest of the session varies." : "";
  const goalExplanation = limitedOutdoorResistance
    ? "Today's equipment supports lower-body work and conditioning, with limited upper-body resistance."
    : limitedIndoorBodyweightResistance
      ? "This equipment supports strength practice, but not a resisted back pull."
    : goalReason[goal];
  const timeTarget = minutes === 60 ? 60 : minutes === 45 ? 40 : minutes === 30 ? 27 : 18;
  const timeReason = [20, 30, 45, 60].includes(minutes) && estimateWorkoutDurationMinutes(exercises) < timeTarget - 3 && avoided.size
    ? "This session is shorter than your chosen time because the remaining easy movements are on your avoid list." : "";
  const whyToday = `${whyTodayBase} ${goalExplanation}${anchorReason ? ` ${anchorReason}` : ""}${settingReason ? ` ${settingReason}` : ""}${equipmentReason ? ` ${equipmentReason}` : ""}${barIntroduction ? ` ${barIntroduction}` : ""}${timeReason ? ` ${timeReason}` : ""}`;
  const upcoming = gentle ? ["Balanced strength", "Mobility or easy cardio"]
    : focus.startsWith("Upper") ? ["Lower body and core", "Recovery and mobility"]
      : focus.startsWith("Lower") ? ["Upper body and easy conditioning", "Recovery and mobility"]
        : ["Recovery and mobility", "Strength with rotated movements"];
  const coreMinutes = estimateWorkoutDurationMinutes(exercises);
  return {
    exercises, location: input.location, equipment: input.equipment, timeAvailableMinutes: minutes, focus, whyToday,
    estimatedDurationMinutes: coreMinutes,
    conservative: input.conservative === true,
    nextSessionPreview: `Next: ${upcoming[0].toLowerCase()}. This may change with your next check-in.`,
    sessionRoadmap: [{ step: "Today", focus }, { step: "Next", focus: upcoming[0] }, { step: "Then", focus: upcoming[1] }],
    history: history.slice(0, 6)
  };
}

export function applyWorkoutBlueprint(plan: CoachWorkoutPlan, blueprint: WorkoutBlueprint): CoachWorkoutPlan {
  const alignDurationCopy = (value: string) => blueprint.estimatedDurationMinutes === blueprint.timeAvailableMinutes ? value
    : value.replace(new RegExp(`\\b${blueprint.timeAvailableMinutes}(?=\\s*[-–]?\\s*(?:minutes?|mins?)\\b)`, "gi"),
      String(blueprint.estimatedDurationMinutes));
  return {
    ...plan,
    title: alignDurationCopy(plan.title),
    intro: alignDurationCopy(plan.intro),
    coachTip: alignDurationCopy(plan.coachTip),
    focus: blueprint.focus,
    estimatedDurationMinutes: blueprint.estimatedDurationMinutes,
    intensity: blueprint.focus === "Recovery and mobility" || blueprint.focus === "Mobility and range of motion" ? "easy"
      : blueprint.conservative && plan.intensity === "challenging" ? "moderate" : plan.intensity,
    warmup: [blueprint.location === "hotel" ? "3 minutes quiet marching or side steps"
      : blueprint.location === "outdoors" && blueprint.equipment === "Walking or Running Route" ? "3 minutes easy walking on your chosen route"
        : "3 minutes easy walking or marching", "1 minute gentle shoulder circles and hip hinges"],
    cooldown: [blueprint.location === "hotel" ? "2 minutes slow marching in place"
      : blueprint.location === "outdoors" && blueprint.equipment === "Walking or Running Route" ? "2 minutes easy walking on your chosen route"
        : "2 minutes easy walking", "1 minute slow breathing and gentle stretching"],
    exercises: blueprint.exercises,
    whyToday: blueprint.whyToday,
    nextSessionPreview: blueprint.nextSessionPreview,
    sessionRoadmap: blueprint.sessionRoadmap,
    experienceVersion: 2
  };
}

/** Add reviewed swaps to an already saved V2 plan without another Gemini call. */
export function fillMissingWorkoutSwaps(plan: CoachWorkoutPlan, setting: { location: string; equipment: string }): CoachWorkoutPlan {
  if (plan.experienceVersion !== 2) return plan;
  const kit = availableKit(setting.equipment, setting.location);
  const usedNames = new Set(plan.exercises.map(exercise => key(exercise.name)));
  let changed = false;
  const exercises = plan.exercises.map(exercise => {
    if (exercise.alternatives?.some(candidate => !usedNames.has(key(candidate.name)))) return exercise;
    const current = catalogItemFor(exercise.name);
    if (!current) return exercise;
    const existingNames = new Set((exercise.alternatives ?? []).map(candidate => key(candidate.name)));
    const additions = V2_WORKOUT_CATALOG.filter(candidate => candidate.pattern === current.pattern
      && (current.pattern !== "accessory" || candidate.target === current.target)
      && key(candidate.name) !== key(exercise.name) && !usedNames.has(key(candidate.name))
      && !existingNames.has(key(candidate.name)) && suitableForSetting(candidate, kit, setting.location)
      && !candidate.advanced).slice(0, 3).map(candidate => ({
        name: candidate.name,
        sets: candidate.duration ? null : exercise.sets ?? 2,
        reps: candidate.reps ?? null,
        duration: preserveTimedSwapDuration(exercise, candidate).duration ?? null,
        rest: candidate.pattern === "cardio" ? null : exercise.rest ?? "As needed",
        note: candidate.note
      }));
    if (!additions.length) return exercise;
    changed = true;
    return { ...exercise, alternatives: [...(exercise.alternatives ?? []), ...additions] };
  });
  return changed ? { ...plan, exercises } : plan;
}

export function rotateWorkoutExercise(plan: CoachWorkoutPlan, index: number): CoachWorkoutPlan | null {
  if (plan.experienceVersion !== 2 || !Number.isInteger(index) || index < 0 || index >= plan.exercises.length) return null;
  const exercise = plan.exercises[index];
  const alternatives = exercise.alternatives ?? [];
  const replacementIndex = alternatives.findIndex(candidate => candidate.name && !plan.exercises.some((other, otherIndex) => otherIndex !== index && key(other.name) === key(candidate.name)));
  if (replacementIndex < 0) return null;
  const replacement = preserveTimedSwapDuration(exercise, alternatives[replacementIndex]);
  const next = [...plan.exercises];
  next[index] = {
    ...replacement,
    alternatives: [...alternatives.slice(replacementIndex + 1), ...alternatives.slice(0, replacementIndex), {
      name: exercise.name, sets: exercise.sets, reps: exercise.reps, duration: exercise.duration, rest: exercise.rest, note: exercise.note
    }]
  };
  const barIntroduced = "The bar is used for a short hold; Zoe has no completed pull-up on record yet.";
  const barSwapped = "You swapped the bar hold for a lighter upper-back movement.";
  const whyToday = exercise.name === "Short Bar Hang" && replacement.name === "Standing Upper-Back Squeeze"
    ? plan.whyToday?.replace(barIntroduced, barSwapped)
    : exercise.name === "Standing Upper-Back Squeeze" && replacement.name === "Short Bar Hang"
      ? plan.whyToday?.replace(barSwapped, barIntroduced) : plan.whyToday;
  return { ...plan, exercises: next, estimatedDurationMinutes: estimateWorkoutDurationMinutes(next), whyToday };
}
