"use client";

export function trainerHomeworkEnabled() {
  return process.env.NEXT_PUBLIC_TRAINER_HOMEWORK_V1 === "true";
}
