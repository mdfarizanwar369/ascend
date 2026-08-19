export type OnboardingVersion = "v1" | "v2";

export function getOnboardingVersion(): OnboardingVersion {
  const configured = process.env.NEXT_PUBLIC_ONBOARDING_VERSION ?? process.env.ONBOARDING_VERSION ?? "v2";
  return configured === "v1" ? "v1" : "v2";
}

export function isProgressiveOnboardingEnabled() {
  return getOnboardingVersion() === "v2";
}

export function hasCompletedClientOnboardingProfile(input: {
  goal_type?: unknown;
  starting_weight_kg?: unknown;
}) {
  return Boolean(input.goal_type && input.starting_weight_kg);
}
