import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const repoRoot = process.cwd();
const sourceLogo = path.join(repoRoot, "frontend", "public", "brand", "ascend-logo.png");
const outputDir = path.join(repoRoot, "assets");
const dark = "#07090d";
const teal = "#3de6d1";
const purple = "#8b5cf6";

function gradientSvg(size) {
  return Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${purple}" stop-opacity="0.9"/>
          <stop offset="58%" stop-color="${teal}" stop-opacity="0.92"/>
          <stop offset="100%" stop-color="${dark}" stop-opacity="1"/>
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="18%" r="72%">
          <stop offset="0%" stop-color="${teal}" stop-opacity="0.34"/>
          <stop offset="55%" stop-color="${purple}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${dark}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${dark}"/>
      <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#halo)"/>
      <rect x="${Math.round(size * 0.04)}" y="${Math.round(size * 0.04)}" width="${Math.round(size * 0.92)}" height="${Math.round(size * 0.92)}" rx="${Math.round(size * 0.2)}" fill="url(#bg)" opacity="0.18"/>
    </svg>
  `);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function centeredLogo(size, scale, transparent) {
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: transparent ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 7, g: 9, b: 13, alpha: 1 }
    }
  });
  const resizedLogo = await sharp(sourceLogo).resize(Math.round(size * scale), Math.round(size * scale), { fit: "contain" }).png().toBuffer();
  return base.composite([{ input: resizedLogo, gravity: "center" }]).png().toBuffer();
}

async function run() {
  await ensureDir(outputDir);
  const iconOnly = await centeredLogo(1024, 0.82, true);
  const iconForeground = await centeredLogo(1024, 0.7, true);
  const iconBackground = await sharp(gradientSvg(1024)).png().toBuffer();
  const splashOverlay = await sharp(gradientSvg(2732)).png().toBuffer();
  const splashLogo = await sharp(sourceLogo).resize(1240, 1240, { fit: "contain" }).png().toBuffer();
  const splash = await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 7, g: 9, b: 13, alpha: 1 }
    }
  }).composite([
    { input: splashOverlay, gravity: "center" },
    { input: splashLogo, gravity: "center" }
  ]).png().toBuffer();

  await Promise.all([
    fs.writeFile(path.join(outputDir, "icon-only.png"), iconOnly),
    fs.writeFile(path.join(outputDir, "icon-foreground.png"), iconForeground),
    fs.writeFile(path.join(outputDir, "icon-background.png"), iconBackground),
    fs.writeFile(path.join(outputDir, "splash.png"), splash),
    fs.writeFile(path.join(outputDir, "splash-dark.png"), splash)
  ]);
}

run().catch((error) => {
  console.error("Could not generate Android branding assets.", error);
  process.exitCode = 1;
});
