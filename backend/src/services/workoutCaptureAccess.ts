export function canUseWorkoutCapture(featureEnabled: boolean, isPlatformOwner: boolean) {
  return featureEnabled && isPlatformOwner;
}
