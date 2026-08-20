export function isTodayEssentialsMorphV22Requested() {
  const v22Setting = process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V22;
  const legacyProductionSetting = process.env.NEXT_PUBLIC_ASCEND_ESSENTIALS_MORPH_V2;
  return v22Setting === "true" || (v22Setting !== "false" && legacyProductionSetting === "true");
}
