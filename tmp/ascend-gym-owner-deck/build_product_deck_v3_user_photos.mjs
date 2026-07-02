import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const ROOT = "C:/Users/Admin/Documents/Codex/2026-06-09/you-are-a-senior-startup-cto";
const PHOTO_ROOT =
  "C:/Users/Admin/.codex/codex-remote-attachments/019eac58-81a5-7151-b134-1e02590880d1/70B0BCF4-AA09-4C9B-8A66-60DDD131B675";
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
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

  // 1
  {
    const s = p.slides.add(); bg(s); await logo(s);
    text(s, "ASCEND", 128, 52, 220, 30, { fontSize: 25, bold: true });
    text(s, "The operating system for fitness accountability.", 72, 150, 650, 122, { fontSize: 50, bold: true });
    text(s, "A working platform that helps members stay consistent, trainers coach between sessions and owners see the business signals that matter.", 76, 302, 610, 70, { fontSize: 21, color: C.muted });
    pill(s, "Built for members, trainers and gym operators", 78, 406, 330, { fill: "#111d2d", color: C.teal });
    await phoneImage(s, assets.foodUpload, 742, 104, 184, 520);
    await phoneImage(s, assets.trainerPriorities, 930, 78, 184, 520);
    await phoneImage(s, assets.ownerCommand, 1114, 120, 154, 460);
  }

  // 2
  {
    const s = p.slides.add(); bg(s);
    title(s, "The gym session is not the hard part.", "The gap happens after the client walks out of the club.");
    bigQuote(s, "Results are built during the other 166 hours of the week.");
    bullet(s, "Members lose momentum", "Nutrition, water, workouts and habits happen away from the trainer.", 670, 230, 430);
    bullet(s, "Trainers lose visibility", "By the next session, the important signals are already stale.", 670, 330, 430, C.purple);
    bullet(s, "Owners lose the business picture", "Retention risk, upgrade potential and trainer activity are hard to see in one place.", 670, 430, 430, C.amber);
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

  // 5
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

  // 6
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

  // 7
  {
    const s = p.slides.add(); bg(s);
    title(s, "Coach Zoe keeps the member moving between sessions.");
    await phoneImage(s, assets.coachZoe, 88, 148, 250, 510);
    card(s, 420, 190, 710, 340);
    text(s, "Coach Zoe supports the 166 hours", 458, 232, 560, 34, { fontSize: 30, bold: true });
    bullet(s, "Daily coaching insight", "Protein, hydration, recovery, consistency and motivation from existing data.", 460, 312, 560);
    bullet(s, "Workout planning", "Generate today's workout from goal, time, location and equipment.", 460, 408, 560, C.purple);
    bullet(s, "Workout memory", "Completed workouts can influence future recommendations.", 460, 504, 560, C.green);
  }

  // 8
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

  // 9
  {
    const s = p.slides.add(); bg(s);
    title(s, "Every client check-in starts with evidence, not guesswork.");
    await phoneImage(s, assets.trainerMeals, 94, 138, 246, 500);
    await phoneImage(s, assets.trainerTools, 388, 138, 246, 500);
    metricCard(s, "Meal evidence", "Latest", "Food logs are visible where the coach reviews the client.", 710, 214, 260);
    metricCard(s, "Missions", "Assign", "Simple actions keep the client accountable between sessions.", 710, 384, 260, C.purple);
    metricCard(s, "Nutrition plan", "Adjust", "Trainer can set context without replacing Ascend's recommendation.", 994, 384, 220, C.amber);
  }

  // 10
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

  // 11
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

  // 12
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

  // 13
  {
    const s = p.slides.add(); bg(s);
    title(s, "Owners see the business levers that deserve attention.");
    await phoneImage(s, assets.ownerCommand, 88, 132, 238, 500);
    await imageCard(s, assets.ownerInsights, 420, 148, 470, 470);
    card(s, 936, 224, 230, 300);
    text(s, "CEO view", 966, 260, 180, 28, { fontSize: 25, bold: true });
    text(s, "Revenue opportunities. Retention watchlist. Trainer performance. Members needing attention. Growth opportunities.", 966, 314, 160, 150, { fontSize: 16, color: C.muted });
  }

  // 14
  {
    const s = p.slides.add(); bg(s);
    title(s, "The owner dashboard should drive action, not report trivia.");
    await phoneImage(s, assets.ownerOpportunities, 82, 118, 235, 518);
    card(s, 398, 178, 760, 402);
    text(s, "Trainer Engagement", 436, 218, 350, 34, { fontSize: 31, bold: true });
    metricCard(s, "Clients contacted", "24", "This week", 438, 292, 210, C.teal);
    metricCard(s, "Weekly reviews", "9", "Completed", 678, 292, 210, C.purple);
    metricCard(s, "Follow-ups", "7", "Outstanding", 918, 292, 210, C.amber);
    text(s, "Owners care about whether trainers are creating accountability, not internal system metrics.", 440, 472, 630, 46, { fontSize: 22, bold: true, color: C.ink });
  }

  // 15
  {
    const s = p.slides.add(); bg(s);
    title(s, "The product is broad enough for a real pilot.", "The question is no longer whether it can be built. It is whether members and trainers use it.");
    const items = [
      ["Member", "Food, water, workouts, habits, progress, Coach Zoe"],
      ["Premium", "AI food scans, weekly reports, trainer support"],
      ["Athlete", "Body Scan, DNA, coach intelligence, scan-powered nutrition"],
      ["Trainer", "Priorities, client profile, coach tools, AI timeline"],
      ["Owner", "Business health, engagement, revenue and opportunities"],
      ["Android", "Google Play wrapper, Health Connect activity sync"],
    ];
    items.forEach((item, i) => {
      const x = 82 + (i % 3) * 382;
      const y = 208 + Math.floor(i / 3) * 172;
      card(s, x, y, 328, 126);
      text(s, item[0], x + 26, y + 26, 240, 26, { fontSize: 24, bold: true, color: i % 2 ? C.purple : C.teal });
      text(s, item[1], x + 26, y + 64, 270, 36, { fontSize: 16, color: C.muted });
    });
  }

  // 16
  {
    const s = p.slides.add(); bg(s);
    title(s, "Why a gym owner should care.", "Ascend is designed around the business outcomes that matter inside a club.");
    featureRow(s, "Retention", "Earlier intervention before members disengage.", 120, 214, C.teal);
    featureRow(s, "Trainer effectiveness", "Less guessing, better reviews, stronger renewal moments.", 120, 310, C.purple);
    featureRow(s, "Premium revenue", "AI coaching, Body Scan and Athlete Mode create paid upgrade paths.", 120, 406, C.green);
    featureRow(s, "Owner visibility", "The club can see engagement, referrals, AI cost and trainer activity in one place.", 120, 502, C.amber);
    await phoneImage(s, assets.trainerPriorities, 874, 156, 204, 450);
  }

  // 17
  {
    const s = p.slides.add(); bg(s);
    title(s, "A pilot should prove usage, not promise miracles.", "Start small, measure honestly and let the gym decide from real behaviour.");
    const steps = [
      ["1-2 clubs", "Controlled environment"],
      ["Selected trainers", "Coaches willing to use it"],
      ["Selected members", "Premium and Athlete candidates"],
      ["60-90 days", "Enough time to see patterns"],
    ];
    steps.forEach((step, i) => {
      const x = 78 + i * 292;
      card(s, x, 230, 246, 200);
      text(s, String(i + 1), x + 24, 258, 60, 50, { fontSize: 42, bold: true, color: C.teal });
      text(s, step[0], x + 24, 334, 190, 26, { fontSize: 23, bold: true });
      text(s, step[1], x + 24, 374, 180, 28, { fontSize: 16, color: C.muted });
    });
    card(s, 120, 500, 1040, 76);
    text(s, "Measure active users, food logs, workouts saved, trainer follow-ups, weekly reports, body scans, member feedback, trainer feedback and PT renewal opportunities.", 154, 526, 960, 28, { fontSize: 19 });
  }

  // 18
  {
    const s = p.slides.add(); bg(s);
    title(s, "Ascend doesn't replace coaching. It extends coaching.");
    card(s, 104, 202, 440, 270, { fill: "#0b111b", line: C.amber });
    text(s, "Trainer", 150, 248, 260, 48, { fontSize: 44, bold: true });
    text(s, "1 hour per week", 152, 324, 300, 42, { fontSize: 34, bold: true, color: C.amber });
    text(s, "The gym session starts results.", 154, 390, 300, 28, { fontSize: 20, color: C.muted });
    card(s, 704, 202, 440, 270, { fill: "#102018", line: C.teal });
    text(s, "Ascend", 750, 248, 260, 48, { fontSize: 44, bold: true });
    text(s, "166 hours per week", 752, 324, 330, 42, { fontSize: 34, bold: true, color: C.teal });
    text(s, "Consistency finishes them.", 754, 390, 300, 28, { fontSize: 20, color: C.muted });
    text(s, "Members stay accountable. Trainers stay informed. Owners stay in control.", 146, 534, 980, 40, { fontSize: 30, bold: true, alignment: "center" });
    text(s, "The gym session starts results. Consistency finishes them.", 190, 594, 900, 28, { fontSize: 23, color: C.muted, alignment: "center" });
  }

  // 19
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
