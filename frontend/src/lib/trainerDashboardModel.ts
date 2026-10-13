import { calculateNutritionTargets } from "@ascend/shared";
import { getTrainerClients, getTrainerRiskAlerts } from "@/lib/ascendApi";
import { buildAthleteCoachInsights, daysSince } from "@/lib/coachIntelligence";

type TrainerClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
type RiskAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];

export function riskLabel(client: TrainerClient) {
  if (client.risk_severity === "high") return "High risk";
  if (client.risk_severity) return "Watch";
  if (client.compliance_score === null || client.compliance_score === undefined) return "No score";
  const score = Number(client.compliance_score);
  if (score < 50) return "High risk";
  if (score < 70) return "Watch";
  return "On track";
}

function daysAgo(value?: string | null) {
  if (!value) return "No check-in yet";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "No check-in yet";
  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function asNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function nutritionSummary(client: TrainerClient) {
  const calories = asNumber(client.calories_today);
  if (!calories) return "No food logged yet";

  const targets = calculateNutritionTargets({
    goalType: client.goal_type,
    sex: client.gender === "female" || client.gender === "male" ? client.gender : "prefer_not_to_say",
    ageYears: client.age_years,
    heightCm: client.height_cm,
    weightKg: client.latest_weight_kg ?? client.starting_weight_kg,
    targetWeightKg: client.target_weight_kg,
    activityLevel:
      client.activity_level === "low" || client.activity_level === "moderate" || client.activity_level === "high"
        ? client.activity_level
        : "moderate",
    bodyComposition: client.athlete_mode_enabled ? client.body_composition_nutrition ?? undefined : undefined
  });
  const labels: string[] = [];
  if (calories > targets.calorieTarget * 1.08) labels.push("Over calories");
  if (asNumber(client.protein_g_today) < targets.proteinTargetG * 0.55 && calories > targets.calorieTarget * 0.35) labels.push("Low protein");
  if (asNumber(client.fat_g_today) > targets.fatTargetG * 0.75) labels.push("High fat");
  if (asNumber(client.carbs_g_today) > targets.carbsTargetG * 0.8) labels.push("High carbs");
  return labels.length ? labels.slice(0, 2).join(", ") : "On track";
}

type PriorityCard = {
  client: TrainerClient;
  badge: "Premium" | "Athlete";
  reason: string;
  action: string;
  lastActivity: string;
  score: number;
  alertId?: string;
};

function maxDate(...values: Array<string | null | undefined>) {
  const times = values.map((value) => (value ? new Date(value).getTime() : 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function membershipBadge(client: TrainerClient): "Premium" | "Athlete" | null {
  if (client.athlete_mode_enabled) return "Athlete";
  return client.current_plan === "premium" || client.current_plan === "trainer_pro" ? "Premium" : null;
}

export function lastActivityFor(client: TrainerClient) {
  return client.last_activity_at ?? maxDate(client.last_food_logged_at, client.last_weight_logged_at, client.last_water_logged_at, client.last_client_message_at);
}

function premiumNeedsAttention(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 100);
  const lastFood = daysSince(client.last_food_logged_at);
  const lastWater = daysSince(client.last_water_logged_at);
  const lastWeight = daysSince(client.last_weight_logged_at);
  const openAlerts = Number(client.open_alerts ?? 0);

  if (client.risk_severity === "high" || score < 50 || openAlerts > 0) {
    return { reason: "Momentum needs attention", action: "Send a quick supportive check-in.", score: 95 };
  }
  if (lastFood !== null && lastFood >= 5) {
    return { reason: "No food logs for 5+ days", action: "Ask what made logging harder this week.", score: 85 };
  }
  if (lastWeight !== null && lastWeight >= 10) {
    return { reason: "Weight update is overdue", action: "Ask for a simple weight check-in.", score: 70 };
  }
  if (lastWater !== null && lastWater >= 5) {
    return { reason: "Water tracking has dropped", action: "Prompt one easy water target today.", score: 60 };
  }
  return null;
}

function premiumGreatProgress(client: TrainerClient) {
  const score = Number(client.compliance_score ?? 0);
  const streak = Number(client.consistency_streak ?? 0);
  const nutrition = nutritionSummary(client);

  if (client.goal_achieved_at) return { reason: "Goal achieved", action: "Celebrate the win and plan maintenance.", score: 100 };
  if (streak >= 5) return { reason: `${streak}-day consistency streak`, action: "Send praise to reinforce the habit.", score: 80 };
  if (score >= 80 && nutrition === "On track") return { reason: "Consistent nutrition and momentum", action: "Keep the current plan steady.", score: 70 };
  return null;
}

export function trainerPriorityCards(clients: TrainerClient[], alerts: RiskAlert[] = []) {
  const eligible = clients.filter((client) => membershipBadge(client));
  const needsAttention: PriorityCard[] = [];
  const greatProgress: PriorityCard[] = [];
  const alertByClient = new Map<string, RiskAlert>();
  for (const alert of alerts) {
    if (!alertByClient.has(alert.user_id)) alertByClient.set(alert.user_id, alert);
  }

  for (const client of eligible) {
    const badge = membershipBadge(client)!;
    const athleteInsight = client.athlete_mode_enabled
      ? buildAthleteCoachInsights({
          athlete: {
            profile: {
              user_id: client.id,
              enabled: true,
              goal_weight_kg: client.target_weight_kg,
              current_weight_kg: client.latest_weight_kg ?? client.starting_weight_kg
            }
          },
          summary: client.body_composition_summary ?? null
        })[0]
      : null;
    const premiumAttention = premiumNeedsAttention(client);
    const premiumProgress = premiumGreatProgress(client);
    const lastActivity = daysAgo(lastActivityFor(client));
    const riskAlert = alertByClient.get(client.id);

    if (riskAlert) {
      needsAttention.push({
        client,
        badge,
        reason: riskAlert.message,
        action: riskAlert.severity === "high" ? "Review this signal and contact the client today." : "Review the signal at the next useful touchpoint.",
        lastActivity,
        score: riskAlert.severity === "high" ? 120 : riskAlert.severity === "medium" ? 100 : 80,
        alertId: riskAlert.id
      });
      continue;
    }

    if (athleteInsight && ["red", "orange", "yellow"].includes(athleteInsight.tone)) {
      needsAttention.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumAttention) {
      needsAttention.push({ client, badge, reason: premiumAttention.reason, action: premiumAttention.action, lastActivity, score: premiumAttention.score });
      continue;
    }
    if (athleteInsight && ["green", "blue"].includes(athleteInsight.tone)) {
      greatProgress.push({ client, badge, reason: athleteInsight.title, action: athleteInsight.action, lastActivity, score: athleteInsight.priority + 10 });
      continue;
    }
    if (premiumProgress) {
      greatProgress.push({ client, badge, reason: premiumProgress.reason, action: premiumProgress.action, lastActivity, score: premiumProgress.score });
    }
  }

  return {
    eligible,
    needsAttention: needsAttention.sort((a, b) => b.score - a.score),
    greatProgress: greatProgress.sort((a, b) => b.score - a.score)
  };
}

export function countActiveToday(clients: TrainerClient[]) {
  return clients.filter((client) => client.active_today === true).length;
}

export function countHighRiskClients(clients: TrainerClient[], alerts: RiskAlert[]) {
  const eligibleIds = new Set(clients.filter((client) => membershipBadge(client)).map((client) => client.id));
  const clientIds = new Set(clients.filter((client) => eligibleIds.has(client.id) && riskLabel(client) === "High risk").map((client) => client.id));
  alerts.filter((alert) => alert.severity === "high" && eligibleIds.has(alert.user_id)).forEach((alert) => clientIds.add(alert.user_id));
  return clientIds.size;
}
