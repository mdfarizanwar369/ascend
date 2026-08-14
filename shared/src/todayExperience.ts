export type TodaySleepQuality = "poor" | "okay" | "good" | null;

export function calculateTodayRecoverySignal(input: {
  waterMl: number;
  waterTargetMl: number;
  sleepQuality: TodaySleepQuality;
}) {
  const waterProgress = input.waterTargetMl > 0
    ? Math.min(100, Math.max(0, Math.round((input.waterMl / input.waterTargetMl) * 100)))
    : 0;
  const sleepProgress = input.sleepQuality === "good"
    ? 100
    : input.sleepQuality === "okay"
      ? 65
      : input.sleepQuality === "poor"
        ? 25
        : 0;

  return {
    done: waterProgress >= 100 || input.sleepQuality === "good",
    progress: Math.max(waterProgress, sleepProgress)
  };
}

export function combineTodayActivityCalories(manualCalories: number, syncedCalories: number) {
  const manual = Number.isFinite(manualCalories) ? Math.max(0, manualCalories) : 0;
  const synced = Number.isFinite(syncedCalories) ? Math.max(0, syncedCalories) : 0;
  return Math.round(Math.max(manual, synced));
}
