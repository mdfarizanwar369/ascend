import { z } from "zod";
import { deterministicTodayPriority } from "./todayPriorityService";
import { loadTodayPriorityFacts } from "./todayPriorityContextService";
import { getVoiceTodayData } from "./voiceTodayService";

export const widgetTodayQuery = z.object({
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840)
});

type WidgetSnapshotInput = {
  localDate: string;
  generatedAt: string;
  totals: { calories: number; waterMl: number };
  targets: { calories: number; waterMl: number };
  movement: { steps: number; workoutCompleted: boolean };
  recovery: { sleepQuality: "poor" | "okay" | "good" | null };
  priority: { key: "Meal" | "Water" | "Movement" | null; title: string; href: string; cta: string };
};

export function buildWidgetTodaySnapshot(input: WidgetSnapshotInput) {
  const caloriesRemaining = Math.max(0, Math.round(input.targets.calories - input.totals.calories));
  const waterRemainingMl = Math.max(0, Math.round(input.targets.waterMl - input.totals.waterMl));
  return {
    schemaVersion: 1,
    localDate: input.localDate,
    generatedAt: input.generatedAt,
    calories: {
      logged: Math.max(0, Math.round(input.totals.calories)),
      target: Math.max(0, Math.round(input.targets.calories)),
      remaining: caloriesRemaining
    },
    water: {
      loggedMl: Math.max(0, Math.round(input.totals.waterMl)),
      targetMl: Math.max(0, Math.round(input.targets.waterMl)),
      remainingMl: waterRemainingMl
    },
    movement: {
      steps: Math.max(0, Math.round(input.movement.steps)),
      workoutCompleted: input.movement.workoutCompleted
    },
    recovery: {
      sleepQuality: input.recovery.sleepQuality
    },
    priority: input.priority
  };
}

export async function getWidgetTodayData(
  userId: string,
  input: z.infer<typeof widgetTodayQuery>,
  now = new Date()
) {
  const [voice, priorityContext] = await Promise.all([
    getVoiceTodayData(userId, { intent: "today_summary", ...input }),
    loadTodayPriorityFacts(userId, input.timezoneOffsetMinutes, now.getTime())
  ]);
  const priority = deterministicTodayPriority(priorityContext.facts);
  return buildWidgetTodaySnapshot({
    localDate: priorityContext.context.localDate,
    generatedAt: now.toISOString(),
    totals: { calories: voice.totals.calories, waterMl: voice.totals.waterMl },
    targets: { calories: voice.targets.calories, waterMl: voice.targets.waterMl },
    movement: {
      steps: priorityContext.facts.stepsToday,
      workoutCompleted: priorityContext.facts.workoutCompletedToday
    },
    recovery: { sleepQuality: priorityContext.facts.sleepQuality },
    priority: { key: priority.key, title: priority.title, href: priority.href, cta: priority.cta }
  });
}
