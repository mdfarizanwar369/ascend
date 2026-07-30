"use client";

export function workoutProgressionEnabled() {
  return process.env.NEXT_PUBLIC_WORKOUT_PROGRESSION_INTELLIGENCE_V1 === "true";
}
