import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:/Users/Admin/Documents/Codex/2026-06-09/you-are-a-senior-startup-cto";
const PHOTO_ROOT =
  "C:/Users/Admin/.codex/codex-remote-attachments/019eac58-81a5-7151-b134-1e02590880d1/70B0BCF4-AA09-4C9B-8A66-60DDD131B675";
const WORKOUT_ROOT =
  "C:/Users/Admin/.codex/codex-remote-attachments/019eac58-81a5-7151-b134-1e02590880d1/693E60D6-CA9F-4A2D-A315-0F7100F621AE";
const OUT = path.join(ROOT, "outputs", "Ascend_Gym_Owner_Product_Deck_With_Screenshots_2026.pptx");
const PREVIEW_DIR = path.join(ROOT, "outputs", "Ascend_Gym_Owner_Product_Deck_With_Screenshots_2026");

const C = {
  bg: "#06080d",
  ink: "#f8fafc",
  muted: "#a7adbb",
  faint: "#717a8c",
  panel: "#101722",
  panel2: "#151d2d",
  line: "#273348",
  black: "#05070c",
  teal: "#3DE6D1",
  purple: "#8B5CF6",
  amber: "#f6c65b",
  green: "#65e7a3",
  red: "#ff7171",
};

const assets = {
  logo: path.join(ROOT, "frontend", "public", "brand", "ascend-logo.png"),
  bodyCoach: path.join(PHOTO_ROOT, "1-Photo-1.jpg"),
  bodyNutrition: path.join(PHOTO_ROOT, "2-Photo-2.jpg"),
  bodyHistory: path.join(PHOTO_ROOT, "3-Photo-3.jpg"),
  ownerInsights: path.join(PHOTO_ROOT, "4-Photo-4.jpg"),
  ownerEngagement: path.join(PHOTO_ROOT, "5-Photo-5.jpg"),
  ownerOpportunities: path.join(PHOTO_ROOT, "6-Photo-6.jpg"),
  ownerCommand: path.join(PHOTO_ROOT, "7-Photo-7.jpg"),
  trainerMeals: path.join(PHOTO_ROOT, "8-Photo-8.jpg"),
  trainerTools: path.join(PHOTO_ROOT, "9-Photo-9.jpg"),
  aiTimeline: path.join(PHOTO_ROOT, "10-Photo-10.jpg"),
  trainerWeekly: path.join(PHOTO_ROOT, "11-Photo-11.jpg"),
  trainerPriorities: path.join(PHOTO_ROOT, "12-Photo-12.jpg"),
  habitsGoals: path.join(PHOTO_ROOT, "13-Photo-13.jpg"),
  coachZoe: path.join(PHOTO_ROOT, "14-Photo-14.jpg"),
  tasksProgress: path.join(PHOTO_ROOT, "15-Photo-15.jpg"),
  mealHistory: path.join(PHOTO_ROOT, "16-Photo-16.jpg"),
  foodUpload: path.join(PHOTO_ROOT, "17-Photo-17.jpg"),
  workoutGoal: path.join(WORKOUT_ROOT, "1-Photo-1.jpg"),
  workoutTime: path.join(WORKOUT_ROOT, "2-Photo-2.jpg"),
  workoutEquipment: path.join(WORKOUT_ROOT, "3-Photo-3.jpg"),
  workoutPlan: path.join(WORKOUT_ROOT, "4-Photo-4.jpg"),
  workoutComplete: path.join(WORKOUT_ROOT, "5-Photo-5.jpg"),
};

async function bytes(file) {
  return new Uint8Array(await fs.readFile(file));
}

function shape(slide, geometry, left, top, width, height, opts = {}) {
  return slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill: opts.fill ?? "none",
    line: opts.line ?? { style: "solid", fill: "none", width: 0 },
    borderRadius: opts.borderRadius,
    shadow: opts.shadow,
    name: opts.name,
  });
}

function text(slide, value, left, top, width, height, style = {}) {
  const s = shape(slide, "textbox", left, top, width, height);
  s.text = value;
  s.text.style = {
    fontFace: "Aptos",
    fontSize: style.fontSize ?? 18,
    bold: style.bold ?? false,
    color: style.color ?? C.ink,
    alignment: style.alignment ?? "left",
    verticalAlignment: style.verticalAlignment ?? "top",
  };
  return s;
}

function bg(slide) {
  slide.background.fill = C.bg;
  shape(slide, "rect", 0, 0, 1280, 720, { fill: C.bg });
  shape(slide, "rect", 0, 586, 1280, 134, { fill: "#0b0715" });
  shape(slide, "rect", 990, 0, 290, 720, { fill: "#071817" });
  shape(slide, "ellipse", 944, 112, 260, 260, {
    fill: "#0b2724",
    line: { style: "solid", fill: "none", width: 0 },
  });
}

async function logo(slide, left = 70, top = 46) {
  slide.images.add({
    blob: await bytes(assets.logo),
    contentType: "image/png",
    alt: "Ascend logo",
    fit: "contain",
    position: { left, top, width: 48, height: 48 },
  });
}

function title(slide, value, subtitle) {
  text(slide, value, 68, 56, 980, 94, { fontSize: 38, bold: true });
  if (subtitle) text(slide, subtitle, 70, 143, 850, 52, { fontSize: 18, color: C.muted });
}

function card(slide, left, top, width, height, opts = {}) {
  return shape(slide, "roundRect", left, top, width, height, {
    fill: opts.fill ?? C.panel,
    line: { style: "solid", fill: opts.line ?? C.line, width: opts.lineWidth ?? 1.4 },
    borderRadius: opts.radius ?? 22,
    shadow: opts.shadow ?? "shadow-sm",
  });
}

function pill(slide, label, left, top, width, opts = {}) {
  card(slide, left, top, width, 34, {
    fill: opts.fill ?? "#121a27",
    line: opts.line ?? C.line,
    radius: 17,
    shadow: "none",
  });
  text(slide, label, left, top + 7, width, 18, {
    fontSize: opts.fontSize ?? 13,
    bold: true,
    color: opts.color ?? C.teal,
    alignment: "center",
  });
}

function bullet(slide, label, body, left, top, width, color = C.teal) {
  shape(slide, "ellipse", left, top + 6, 9, 9, { fill: color });
  text(slide, label, left + 22, top, width - 22, 23, { fontSize: 18, bold: true });
  text(slide, body, left + 22, top + 27, width - 22, 38, { fontSize: 15, color: C.muted });
}

async function phoneImage(slide, file, left, top, width, height, crop = { left: 0, top: 0, right: 0, bottom: 0 }) {
  shape(slide, "roundRect", left - 10, top - 12, width + 20, height + 24, {
    fill: C.black,
    line: { style: "solid", fill: "#30394c", width: 2 },
    borderRadius: 34,
    shadow: "shadow-lg",
  });
  shape(slide, "roundRect", left + width * 0.34, top - 1, width * 0.32, 8, {
    fill: "#202838",
    borderRadius: 5,
  });
  slide.images.add({
    blob: await bytes(file),
    contentType: "image/jpeg",
    alt: "Ascend product screenshot",
    fit: "contain",
    position: { left, top, width, height },
    geometry: "roundRect",
    borderRadius: 24,
  });
}

async function imageCard(slide, file, left, top, width, height, crop = { left: 0, top: 0, right: 0, bottom: 0 }) {
  card(slide, left - 5, top - 5, width + 10, height + 10, { fill: "#0a0e16", line: "#2b3548", radius: 18 });
  slide.images.add({
    blob: await bytes(file),
    contentType: "image/jpeg",
    alt: "Ascend product screenshot",
    fit: "cover",
    crop,
    position: { left, top, width, height },
    geometry: "roundRect",
    borderRadius: 14,
  });
}

function metricCard(slide, label, value, body, left, top, width, color = C.teal) {
  card(slide, left, top, width, 136);
  text(slide, label.toUpperCase(), left + 24, top + 23, width - 48, 18, { fontSize: 12, bold: true, color: C.faint });
  text(slide, value, left + 24, top + 55, width - 48, 34, { fontSize: 32, bold: true, color });
  text(slide, body, left + 24, top + 96, width - 48, 22, { fontSize: 14, color: C.muted });
}

function bigQuote(slide, quote, left = 76, top = 220) {
  card(slide, left, top, 520, 220, { fill: "#0b111b", line: "#304055" });
  text(slide, quote, left + 34, top + 40, 452, 130, { fontSize: 32, bold: true });
  pill(slide, "THE 166-HOUR GAP", left + 34, top + 164, 178, { fill: "#10251f", color: C.teal });
}

function journeyStep(slide, label, left, top, width, color = C.teal) {
  card(slide, left, top, width, 58, { fill: "#0d131d", line: color, radius: 18, shadow: "none" });
  text(slide, label, left, top + 17, width, 22, { fontSize: 18, bold: true, alignment: "center" });
}

function down(slide, left, top, color = C.muted) {
  text(slide, "↓", left, top, 36, 34, { fontSize: 30, bold: true, color, alignment: "center" });
}

async function main() {
  await fs.rm(PREVIEW_DIR, { recursive: true, force: true });
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

  // 1
  {
    const s = p.slides.add(); bg(s); await logo(s);
    text(s, "ASCEND", 128, 52, 220, 30, { fontSize: 25, bold: true });
    text(s, "Your trainers coach members for one hour each week.", 72, 150, 650, 126, { fontSize: 48, bold: true });
    text(s, "Ascend coaches them during the other 166 hours.", 76, 304, 620, 72, { fontSize: 32, bold: true, color: C.teal });
    pill(s, "The operating system for fitness accountability", 78, 430, 360, { fill: "#111d2d", color: C.teal });
    await phoneImage(s, assets.foodUpload, 742, 104, 184, 520);
    await phoneImage(s, assets.trainerPriorities, 930, 78, 184, 520);
    await phoneImage(s, assets.ownerCommand, 1114, 120, 154, 460);
  }

  // 2
  {
    const s = p.slides.add(); bg(s);
    title(s, "The week breaks after the session.");
    bigQuote(s, "Results are built during the other 166 hours of the week.");
    bullet(s, "Members drift", "Habits happen away from the club.", 670, 250, 430);
    bullet(s, "Trainers guess", "Signals arrive too late.", 670, 350, 430, C.purple);
    bullet(s, "Owners react", "Retention risk stays hidden.", 670, 450, 430, C.amber);
  }

  // 3
  {
    const s = p.slides.add(); bg(s);
    title(s, "How Ascend closes the 166-hour gap.");
    card(s, 90, 174, 440, 420, { fill: "#0b111b", line: "#2b3548" });
    text(s, "Traditional coaching", 130, 214, 300, 32, { fontSize: 30, bold: true });
    journeyStep(s, "PT Session", 178, 286, 260, C.amber);
    down(s, 290, 350);
    journeyStep(s, "7 days with little visibility", 178, 402, 260, C.faint);
    down(s, 290, 466);
    journeyStep(s, "Next PT Session", 178, 518, 260, C.amber);
    text(s, "The coach finds out after the week has already happened.", 132, 622, 330, 32, { fontSize: 16, color: C.muted, alignment: "center" });

    card(s, 612, 174, 520, 420, { fill: "#102018", line: C.teal });
    text(s, "Ascend coaching", 652, 214, 300, 32, { fontSize: 30, bold: true });
    const steps = ["PT Session", "Coach Zoe", "Food Logging", "Workout Guidance", "Hydration", "Progress Tracking", "Trainer Visibility", "Next PT Session"];
    steps.forEach((step, i) => {
      const x = 660 + (i % 2) * 222;
      const y = 274 + Math.floor(i / 2) * 76;
      journeyStep(s, step, x, y, 180, i === 0 || i === 7 ? C.amber : C.teal);
    });
    text(s, "Every action between sessions becomes visible to the trainer.", 658, 622, 420, 30, { fontSize: 21, bold: true, color: C.teal, alignment: "center" });
  }

  // 4
  {
    const s = p.slides.add(); bg(s);
    title(s, "Why AI?");
    card(s, 84, 172, 470, 394, { fill: "#0b111b", line: "#2b3548" });
    text(s, "Without Ascend", 128, 220, 310, 34, { fontSize: 32, bold: true });
    text(s, "Trainer manages 40 clients", 130, 296, 330, 36, { fontSize: 28, bold: true, color: C.amber });
    text(s, "Meals\nWorkouts\nHydration\nHabits\nProgress\nMotivation", 136, 360, 260, 150, { fontSize: 22, color: C.muted });
    text(s, "Important signals are missed.", 130, 520, 340, 28, { fontSize: 24, bold: true, color: C.red });

    card(s, 682, 172, 470, 394, { fill: "#102018", line: C.teal });
    text(s, "With Ascend", 726, 220, 310, 34, { fontSize: 32, bold: true });
    journeyStep(s, "AI observes", 760, 294, 300, C.teal);
    down(s, 892, 354, C.teal);
    journeyStep(s, "AI summarizes", 760, 402, 300, C.teal);
    down(s, 892, 462, C.teal);
    journeyStep(s, "Trainer coaches", 760, 510, 300, C.amber);
    text(s, "AI replaces admin. Not coaching.", 334, 622, 600, 42, { fontSize: 34, bold: true, color: C.teal, alignment: "center" });
  }

  // 5
  {
    const s = p.slides.add(); bg(s);
    title(s, "Ascend connects the three stakeholders that drive results.", "Client action creates trainer visibility. Trainer visibility creates owner confidence.");
    await phoneImage(s, assets.coachZoe, 94, 202, 212, 430);
    await phoneImage(s, assets.trainerPriorities, 524, 202, 212, 430);
    await phoneImage(s, assets.ownerCommand, 950, 202, 212, 430);
    text(s, "CLIENT", 126, 648, 150, 22, { fontSize: 14, bold: true, color: C.teal, alignment: "center" });
    text(s, "TRAINER", 558, 648, 150, 22, { fontSize: 14, bold: true, color: C.purple, alignment: "center" });
    text(s, "OWNER", 982, 648, 150, 22, { fontSize: 14, bold: true, color: C.amber, alignment: "center" });
    shape(s, "chevron", 360, 376, 80, 44, { fill: C.teal });
    shape(s, "chevron", 790, 376, 80, 44, { fill: C.teal });
  }

  // 6
  {
    const s = p.slides.add(); bg(s);
    title(s, "Members know what to do today before they scroll.");
    await phoneImage(s, assets.tasksProgress, 86, 176, 230, 470);
    await phoneImage(s, assets.coachZoe, 348, 156, 230, 470);
    card(s, 648, 216, 486, 320);
    text(s, "What this solves", 684, 252, 320, 28, { fontSize: 25, bold: true });
    bullet(s, "Less overwhelm", "The member sees today's task before the full feature set.", 684, 318, 370);
    bullet(s, "More consistency", "Simple progress cards reinforce small daily actions.", 684, 412, 370, C.purple);
    bullet(s, "Coach Zoe feels present", "One timely insight, not a wall of AI text.", 684, 506, 370, C.teal);
  }

  // 7
  {
    const s = p.slides.add(); bg(s);
    title(s, "Food logging that works in real life.");
    await phoneImage(s, assets.foodUpload, 70, 148, 212, 466);
    await phoneImage(s, assets.mealHistory, 312, 148, 212, 466);
    card(s, 608, 168, 500, 424);
    text(s, "No perfect photos. No calorie database. Just describe the meal.", 646, 204, 410, 24, { fontSize: 18, color: C.muted, alignment: "center" });
    text(s, "Take Photo", 650, 252, 170, 30, { fontSize: 27, bold: true, color: C.teal });
    text(s, "OR", 804, 254, 60, 28, { fontSize: 21, bold: true, color: C.muted, alignment: "center" });
    text(s, "Type what you ate", 890, 252, 190, 30, { fontSize: 27, bold: true, color: C.purple });
    card(s, 660, 318, 390, 86, { fill: C.black, line: "#2b3548", radius: 18 });
    text(s, "Chicken rice • Nasi lemak", 684, 334, 340, 20, { fontSize: 18, bold: true });
    text(s, "Protein shake • McChicken meal", 684, 360, 340, 20, { fontSize: 17, color: C.muted });
    text(s, "2 eggs and toast", 684, 384, 340, 18, { fontSize: 15, color: C.muted });
    down(s, 838, 410, C.teal);
    journeyStep(s, "AI analyses the meal", 712, 456, 290, C.teal);
    down(s, 838, 518, C.teal);
    text(s, "Calories  •  Protein  •  Carbs  •  Fat", 654, 552, 420, 28, { fontSize: 23, bold: true, alignment: "center" });
    text(s, "Save", 654, 582, 420, 26, { fontSize: 23, bold: true, color: C.teal, alignment: "center" });
  }

  // 8
  {
    const s = p.slides.add(); bg(s);
    title(s, "Members get a workout they can actually start.");
    await phoneImage(s, assets.workoutGoal, 70, 150, 214, 462);
    await phoneImage(s, assets.workoutTime, 304, 150, 214, 462);
    await phoneImage(s, assets.workoutEquipment, 538, 150, 214, 462);
    card(s, 822, 190, 320, 386, { fill: "#102018", line: C.teal });
    text(s, "Fast enough for real life", 856, 258, 230, 66, { fontSize: 32, bold: true });
    bullet(s, "Goal", "Fat loss, strength, recovery or mobility.", 856, 350, 230);
    bullet(s, "Time", "20, 30, 45 or 60+ minutes.", 856, 434, 230, C.purple);
    bullet(s, "Equipment", "Gym, home, hotel or bands.", 856, 518, 230, C.green);
  }

  // 9
  {
    const s = p.slides.add(); bg(s);
    title(s, "Workout completion becomes accountability.");
    await phoneImage(s, assets.workoutPlan, 104, 132, 245, 500);
    await phoneImage(s, assets.workoutComplete, 390, 132, 245, 500);
    card(s, 726, 194, 390, 420, { fill: "#0b111b", line: "#2b3548" });
    text(s, "So what?", 762, 254, 220, 36, { fontSize: 34, bold: true });
    bullet(s, "Members finish the plan", "A clear session beats another vague instruction.", 762, 320, 290);
    bullet(s, "Progress is saved", "Workout history, momentum and activity update automatically.", 762, 418, 290, C.teal);
    bullet(s, "Trainers see effort", "The next conversation starts with evidence.", 762, 516, 290, C.purple);
  }

  // 10
  {
    const s = p.slides.add(); bg(s);
    title(s, "Trainers begin each day with a coaching plan.");
    await phoneImage(s, assets.trainerPriorities, 96, 142, 232, 486);
    await phoneImage(s, assets.trainerWeekly, 376, 152, 232, 466);
    card(s, 716, 200, 400, 358);
    text(s, "Why trainers care", 750, 248, 280, 28, { fontSize: 26, bold: true });
    bullet(s, "Faster triage", "Premium and Athlete clients surface in one priority list.", 750, 314, 300);
    bullet(s, "Clear next action", "Each card suggests what the coach should do next.", 750, 404, 300, C.purple);
    bullet(s, "Weekly summary", "Trainers can see improving, plateaued and at-risk clients.", 750, 480, 300, C.teal);
  }

  // 10
  {
    const s = p.slides.add(); bg(s);
    title(s, "Every client check-in starts with evidence, not guesswork.");
    await phoneImage(s, assets.trainerMeals, 94, 138, 246, 500);
    await phoneImage(s, assets.trainerTools, 388, 138, 246, 500);
    metricCard(s, "Meal evidence", "Latest", "Food logs are visible where the coach reviews the client.", 710, 214, 260);
    metricCard(s, "Missions", "Assign", "Simple actions keep the client accountable between sessions.", 710, 384, 260, C.purple);
    metricCard(s, "Nutrition plan", "Adjust", "Trainer can set context without replacing Ascend's recommendation.", 994, 384, 220, C.amber);
  }

  // 11
  {
    const s = p.slides.add(); bg(s);
    title(s, "Every week begins with a coaching summary instead of guesswork.");
    await phoneImage(s, assets.aiTimeline, 92, 128, 250, 510);
    card(s, 430, 214, 660, 310);
    text(s, "A coaching briefing, not an activity dump", 466, 252, 520, 34, { fontSize: 30, bold: true });
    bullet(s, "Nutrition summary", "Meals, calories and protein are grouped by day.", 466, 328, 500);
    bullet(s, "Hydration summary", "Water logs become one coaching signal.", 466, 420, 500, C.teal);
    bullet(s, "Coach Zoe interventions", "The trainer sees when Zoe supported the client.", 466, 512, 500, C.purple);
  }

  // 12
  {
    const s = p.slides.add(); bg(s);
    title(s, "Premium members receive a coaching experience worth paying for.");
    await phoneImage(s, assets.bodyCoach, 78, 120, 236, 520);
    await phoneImage(s, assets.bodyNutrition, 358, 120, 236, 520);
    card(s, 676, 214, 420, 300);
    text(s, "Why this matters commercially", 712, 250, 330, 32, { fontSize: 28, bold: true });
    bullet(s, "Higher perceived value", "Body scans turn Athlete Mode into a premium coaching product.", 712, 322, 310);
    bullet(s, "Better reviews", "Trainer can discuss body fat, muscle and nutrition without a data dump.", 712, 414, 310, C.purple);
    bullet(s, "More retention hooks", "Progress beyond the scale gives clients a reason to continue.", 712, 506, 310, C.green);
  }

  // 13
  {
    const s = p.slides.add(); bg(s);
    title(s, "Progress beyond the scale gives clients a reason to stay.");
    await phoneImage(s, assets.bodyHistory, 92, 116, 260, 530);
    card(s, 456, 188, 620, 360);
    text(s, "What the coach can review", 496, 226, 420, 32, { fontSize: 30, bold: true });
    bullet(s, "Current vs previous", "Weight, body fat, muscle and score changes are easy to compare.", 498, 312, 450);
    bullet(s, "Source evidence", "The scan photo stays attached so reviews feel credible.", 498, 412, 450, C.teal);
    bullet(s, "Nutrition update", "Athlete targets can use confirmed scan data without changing normal members.", 498, 512, 450, C.purple);
  }

  // 14
  {
    const s = p.slides.add(); bg(s);
    title(s, "Owners see the business levers that deserve attention.");
    await phoneImage(s, assets.ownerOpportunities, 88, 132, 238, 500);
    await imageCard(s, assets.ownerInsights, 420, 148, 470, 470);
    card(s, 936, 224, 230, 300);
    text(s, "CEO view", 966, 260, 180, 28, { fontSize: 25, bold: true });
    text(s, "Revenue opportunities. Retention watchlist. Trainer performance. Members needing attention. Growth opportunities.", 966, 314, 160, 150, { fontSize: 16, color: C.muted });
  }

  // 15
  {
    const s = p.slides.add(); bg(s);
    title(s, "The owner dashboard should drive action, not report trivia.");
    await phoneImage(s, assets.trainerPriorities, 82, 118, 235, 518);
    card(s, 398, 178, 760, 402);
    text(s, "Trainer Engagement", 436, 218, 350, 34, { fontSize: 31, bold: true });
    metricCard(s, "Clients contacted", "24", "This week", 438, 292, 210, C.teal);
    metricCard(s, "Weekly reviews", "9", "Completed", 678, 292, 210, C.purple);
    metricCard(s, "Follow-ups", "7", "Outstanding", 918, 292, 210, C.amber);
    text(s, "Owners care about whether trainers are creating accountability, not internal system metrics.", 440, 472, 630, 46, { fontSize: 22, bold: true, color: C.ink });
  }

  // 16
  {
    const s = p.slides.add(); bg(s);
    title(s, "A pilot should prove usage, not promise miracles.");
    const steps = [
      ["1-2 clubs", "Controlled"],
      ["Selected trainers", "Coaching buy-in"],
      ["Selected members", "Real usage"],
      ["60-90 days", "Enough signal"],
    ];
    steps.forEach((step, i) => {
      const x = 78 + i * 292;
      card(s, x, 230, 246, 200);
      text(s, String(i + 1), x + 24, 258, 60, 50, { fontSize: 42, bold: true, color: C.teal });
      text(s, step[0], x + 24, 334, 190, 26, { fontSize: 23, bold: true });
      text(s, step[1], x + 24, 374, 180, 28, { fontSize: 16, color: C.muted });
    });
    card(s, 160, 500, 960, 76);
    text(s, "Measure usage. Trainer action. Member feedback.", 190, 524, 900, 30, { fontSize: 28, bold: true, alignment: "center" });
  }

  // 17
  {
    const s = p.slides.add(); bg(s);
    title(s, "Ascend doesn't replace coaching. It extends coaching.");
    card(s, 86, 184, 500, 292, { fill: "#0b111b", line: C.amber });
    text(s, "Trainer", 132, 226, 260, 42, { fontSize: 42, bold: true });
    text(s, "1", 134, 278, 160, 100, { fontSize: 100, bold: true, color: C.amber });
    text(s, "hour", 292, 314, 180, 50, { fontSize: 46, bold: true, color: C.amber });
    text(s, "per week", 138, 398, 260, 28, { fontSize: 24, color: C.muted });
    card(s, 690, 184, 500, 292, { fill: "#102018", line: C.teal });
    text(s, "Ascend", 736, 226, 260, 42, { fontSize: 42, bold: true });
    text(s, "166", 738, 278, 240, 100, { fontSize: 100, bold: true, color: C.teal });
    text(s, "hours", 986, 314, 170, 50, { fontSize: 46, bold: true, color: C.teal });
    text(s, "per week", 742, 398, 260, 28, { fontSize: 24, color: C.muted });
    text(s, "Members stay accountable. Trainers stay informed. Owners stay in control.", 132, 534, 1010, 36, { fontSize: 30, bold: true, alignment: "center" });
    text(s, "The gym session starts results. Consistency finishes them.", 190, 596, 900, 28, { fontSize: 24, color: C.muted, alignment: "center" });
  }

  // 18
  {
    const s = p.slides.add(); bg(s); await logo(s);
    text(s, "ASCEND", 128, 52, 220, 30, { fontSize: 25, bold: true });
    text(s, "Let's show the live product.", 78, 170, 640, 94, { fontSize: 54, bold: true });
    text(s, "A short walkthrough can show how Ascend supports members, trainers and club operations without replacing the coaching model already inside the gym.", 82, 304, 620, 76, { fontSize: 24, color: C.muted });
    pill(s, "www.getascend.fit", 84, 430, 260, { fill: "#10251f", color: C.teal });
    text(s, "Fariz Anwar", 84, 532, 280, 30, { fontSize: 26, bold: true });
    text(s, "Founder / Ascend", 84, 568, 280, 24, { fontSize: 17, color: C.muted });
    await phoneImage(s, assets.foodUpload, 794, 104, 184, 500);
    await phoneImage(s, assets.ownerCommand, 990, 124, 170, 460);
  }

  for (const [index, slide] of p.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    const png = await p.export({ slide, format: "png", scale: 1 });
    await fs.writeFile(path.join(PREVIEW_DIR, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  }
  const inspect = await p.inspect({ kind: "slide,textbox,shape,image", maxChars: 15000 });
  await fs.writeFile(`${OUT}.inspect.ndjson`, inspect.ndjson);
  const pptx = await PresentationFile.exportPptx(p);
  await pptx.save(OUT);
  console.log(OUT);
}

function featureRow(slide, label, body, left, top, color) {
  card(slide, left, top, 650, 72, { fill: "#0d131d", line: "#29364a", radius: 18 });
  shape(slide, "ellipse", left + 24, top + 24, 16, 16, { fill: color });
  text(slide, label, left + 58, top + 18, 220, 24, { fontSize: 21, bold: true });
  text(slide, body, left + 280, top + 20, 330, 22, { fontSize: 16, color: C.muted });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
