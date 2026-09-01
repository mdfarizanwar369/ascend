export function ascendCoachV1Enabled() {
  return process.env.NEXT_PUBLIC_ASCEND_COACH_V1 === "true";
}

export function canSeeAscendCoachShell(input: {
  roles?: readonly string[];
  primaryRole?: string | null;
  isPlatformOwner?: boolean;
}) {
  if (!ascendCoachV1Enabled()) return false;
  const roles = input.roles ?? [];
  return input.isPlatformOwner === true
    || input.primaryRole === "trainer"
    || roles.includes("trainer");
}
