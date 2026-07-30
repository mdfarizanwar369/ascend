export function trainerSessionDeltaEnabled() {
  return process.env.NEXT_PUBLIC_TRAINER_SESSION_DELTA_V2 === "true";
}
