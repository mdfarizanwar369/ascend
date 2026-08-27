import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

function packageJson(relativePath: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

describe("Portion-Aware Nutrition production isolation", () => {
  it("does not depend on rejected calibration, segmentation, depth, or research ML packages", () => {
    const manifests = [
      packageJson("package.json"),
      packageJson("../package.json"),
      packageJson("../frontend/package.json")
    ];
    const installedNames = new Set(
      manifests.flatMap((manifest) => [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {})
      ])
    );

    expect([...installedNames].filter((name) => (
      /onnxruntime|transformers|huggingface|tensorflow|torch|opencv|segment-anything|sam|depth/i.test(name)
    ))).toEqual([]);
  });
});
