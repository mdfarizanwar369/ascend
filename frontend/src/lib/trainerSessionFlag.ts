export function trainerSessionCaptureEnabled() {
  return process.env.NEXT_PUBLIC_TRAINER_SESSION_CAPTURE_V1 === "true";
}
