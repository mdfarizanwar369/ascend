import { describe, expect, it } from "vitest";
import {
  BODY_SCAN_IMPORT_STAGES,
  dataUrlByteSize,
  getBodyScanQualityWarnings,
  hasBlockingBodyScanWarnings,
  hammingDistance,
  isLikelyDuplicateBodyScanImage
} from "@ascend/shared";

describe("Body scan image import quality rules", () => {
  it("flags blurry images before Gemini extraction", () => {
    const warnings = getBodyScanQualityWarnings({
      width: 1200,
      height: 900,
      brightness: 130,
      contrast: 40,
      blurScore: 10,
      glareRatio: 0.01,
      contentCoverage: 0.7
    });

    expect(warnings.some((warning) => warning.code === "excessive_blur")).toBe(true);
    expect(hasBlockingBodyScanWarnings(warnings)).toBe(true);
  });

  it("flags glare and washed out reports", () => {
    const warnings = getBodyScanQualityWarnings({
      width: 1400,
      height: 1000,
      brightness: 232,
      contrast: 18,
      blurScore: 55,
      glareRatio: 0.12,
      contentCoverage: 0.65
    });

    expect(warnings.map((warning) => warning.code)).toContain("excessive_glare");
    expect(warnings.map((warning) => warning.code)).toContain("too_bright");
    expect(warnings.map((warning) => warning.code)).toContain("low_contrast");
  });

  it("detects duplicate images by perceptual hash distance", () => {
    const original = "1111000011110000111100001111000011110000111100001111000011110000";
    const nearDuplicate = "1111000011110000111100001111000011110000111100001111000011110011";

    expect(hammingDistance(original, nearDuplicate)).toBe(2);
    expect(isLikelyDuplicateBodyScanImage(nearDuplicate, [original])).toBe(true);
  });

  it("keeps progress stages in the expected user-facing order", () => {
    expect(BODY_SCAN_IMPORT_STAGES.map((stage) => stage.id)).toEqual([
      "select",
      "correct_orientation",
      "optimize",
      "quality_check",
      "upload",
      "read",
      "dna",
      "nutrition",
      "insights",
      "complete"
    ]);
  });

  it("estimates base64 upload size for optimized images", () => {
    expect(dataUrlByteSize("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataUrlByteSize("data:image/jpeg;base64,AAA=")).toBe(2);
  });
});
