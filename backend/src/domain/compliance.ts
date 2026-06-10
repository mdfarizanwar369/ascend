import { COMPLIANCE_WEIGHTS, ComplianceBreakdown, GoalType } from "@ascend/shared";

export interface ComplianceInputs {
  foodLogsToday: number;
  weightLogsThisWeek: number;
  waterMlToday: number;
  waterTargetMl: number;
  habitsCompletedToday: number;
  habitsAssignedToday: number;
}

export function calculateComplianceScore(input: ComplianceInputs): ComplianceBreakdown {
  const foodScore =
    input.foodLogsToday >= 2 ? COMPLIANCE_WEIGHTS.food : input.foodLogsToday === 1 ? COMPLIANCE_WEIGHTS.food / 2 : 0;
  const weightScore = Math.min(input.weightLogsThisWeek / 3, 1) * COMPLIANCE_WEIGHTS.weight;
  const waterScore = Math.min(input.waterMlToday / Math.max(input.waterTargetMl, 1), 1) * COMPLIANCE_WEIGHTS.water;
  const habitRatio =
    input.habitsAssignedToday === 0 ? 1 : input.habitsCompletedToday / Math.max(input.habitsAssignedToday, 1);
  const habitScore = Math.min(habitRatio, 1) * COMPLIANCE_WEIGHTS.habits;
  const totalScore = Math.round(foodScore + weightScore + waterScore + habitScore);

  return {
    foodScore: Math.round(foodScore),
    weightScore: Math.round(weightScore),
    waterScore: Math.round(waterScore),
    habitScore: Math.round(habitScore),
    totalScore
  };
}

export function isWeightTrendOffGoal(goal: GoalType, startWeightKg: number, latestWeightKg: number) {
  const delta = latestWeightKg - startWeightKg;

  if (goal === "fat_loss") return delta > 0.8;
  if (goal === "muscle_gain") return delta < -0.8;
  return Math.abs(delta) > 1.5;
}

