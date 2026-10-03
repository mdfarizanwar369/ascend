import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = path.resolve(import.meta.dirname, "..");
let total = 0;
for (const version of ["ascend-original-v1", "ascend-original-v2", "ascend-original-v3"]) {
  const sourceRoot = path.join(projectRoot, "docs", "exercise-visual-source", version);
  const outputRoot = path.join(projectRoot, "frontend", "public", "exercise-visuals", version);
  const sourceNames = (await fs.readdir(sourceRoot)).filter(name => name.endsWith(".png")).sort();
  await fs.mkdir(outputRoot, { recursive: true });
  for (const name of sourceNames) {
    await sharp(path.join(sourceRoot, name))
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 88, effort: 6 })
      .toFile(path.join(outputRoot, name.replace(/\.png$/, ".webp")));
  }
  total += sourceNames.length;
}

console.log(`Prepared ${total} Ascend exercise visuals.`);
