export function trainerInsightsEnabled() {
  return process.env.NEXT_PUBLIC_TRAINER_INSIGHTS_V1 !== "false";
}
