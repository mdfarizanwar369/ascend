export type BodyScanImportStageId =
  | "select"
  | "correct_orientation"
  | "optimize"
  | "quality_check"
  | "upload"
  | "read"
  | "dna"
  | "nutrition"
  | "insights"
  | "complete";

export type BodyScanQualityWarningCode =
  | "resolution_low"
  | "excessive_blur"
  | "excessive_glare"
  | "too_dark"
  | "too_bright"
  | "low_contrast"
  | "cropping_issue";

export type BodyScanQualitySeverity = "info" | "warning" | "blocking";

export interface BodyScanQualityWarning {
  code: BodyScanQualityWarningCode;
  severity: BodyScanQualitySeverity;
  message: string;
}

export interface BodyScanQualityStats {
  width: number;
  height: number;
  brightness: number;
  contrast: number;
  blurScore: number;
  glareRatio: number;
  contentCoverage: number;
}

export const BODY_SCAN_IMPORT_STAGES: Array<{ id: BodyScanImportStageId; label: string; message: string }> = [
  { id: "select", label: "Photo selected", message: "Preparing your scan image." },
  { id: "correct_orientation", label: "Correcting orientation", message: "Making sure the report is upright." },
  { id: "optimize", label: "Optimizing images", message: "Cropping borders and preserving small numbers." },
  { id: "quality_check", label: "Checking quality", message: "Checking blur, glare, brightness, and text clarity." },
  { id: "upload", label: "Uploading images", message: "Sending optimized images securely." },
  { id: "read", label: "Reading body composition", message: "Gemini Flash Vision is extracting visible values only." },
  { id: "dna", label: "Building your Ascend DNA", message: "Merging scan values into one confirmed draft." },
  { id: "nutrition", label: "Calculating nutrition", message: "Preparing scan-informed nutrition signals." },
  { id: "insights", label: "Generating insights", message: "Creating coach-friendly trend notes." },
  { id: "complete", label: "Complete", message: "Review every value before saving." }
];

export function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function hammingDistance(left: string, right: string) {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

export function isLikelyDuplicateBodyScanImage(hash: string, existingHashes: string[], maxDistance = 6) {
  return existingHashes.some((existing) => hammingDistance(hash, existing) <= maxDistance);
}

export function getBodyScanQualityWarnings(stats: BodyScanQualityStats): BodyScanQualityWarning[] {
  const warnings: BodyScanQualityWarning[] = [];
  const shortestSide = Math.min(stats.width, stats.height);

  if (shortestSide < 720) {
    warnings.push({
      code: "resolution_low",
      severity: "blocking",
      message: "Resolution is low. Retake the report closer so small numbers are readable."
    });
  }

  if (stats.blurScore < 18) {
    warnings.push({
      code: "excessive_blur",
      severity: "blocking",
      message: "Image looks blurry. Hold the phone steady and retake the photo."
    });
  } else if (stats.blurScore < 35) {
    warnings.push({
      code: "excessive_blur",
      severity: "warning",
      message: "Some text may be soft. Retake if the numbers look unclear."
    });
  }

  if (stats.glareRatio > 0.08) {
    warnings.push({
      code: "excessive_glare",
      severity: "blocking",
      message: "There is strong glare over the report. Tilt the phone or screen and retake."
    });
  } else if (stats.glareRatio > 0.035) {
    warnings.push({
      code: "excessive_glare",
      severity: "warning",
      message: "Some glare is visible. Check the values carefully before saving."
    });
  }

  if (stats.brightness < 55) {
    warnings.push({
      code: "too_dark",
      severity: "warning",
      message: "Image is dark. More light will help Ascend read the report."
    });
  }

  if (stats.brightness > 225) {
    warnings.push({
      code: "too_bright",
      severity: "warning",
      message: "Image is very bright. Check that numbers are not washed out."
    });
  }

  if (stats.contrast < 22) {
    warnings.push({
      code: "low_contrast",
      severity: "warning",
      message: "Text contrast is low. Try a sharper screenshot or better lighting."
    });
  }

  if (stats.contentCoverage < 0.18) {
    warnings.push({
      code: "cropping_issue",
      severity: "warning",
      message: "Only a small part of the report was detected. Make sure the full report is visible."
    });
  }

  if (stats.contentCoverage > 0.98) {
    warnings.push({
      code: "cropping_issue",
      severity: "info",
      message: "Ascend kept the full image because no empty border was detected."
    });
  }

  return warnings;
}

export function hasBlockingBodyScanWarnings(warnings: BodyScanQualityWarning[]) {
  return warnings.some((warning) => warning.severity === "blocking");
}
