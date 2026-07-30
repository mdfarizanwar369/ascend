"use client";

export function workoutProgressionV3Enabled() {
  return process.env.NEXT_PUBLIC_WORKOUT_PROGRESSION_INTELLIGENCE_V3 === "true";
}
