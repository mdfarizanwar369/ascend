"use client";

export function workoutCaptureEnabled() {
  return process.env.NEXT_PUBLIC_WORKOUT_CAPTURE_V1 === "true";
}
