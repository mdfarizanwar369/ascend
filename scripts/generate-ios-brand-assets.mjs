import sharp from "sharp";
import { readFile } from "node:fs/promises";

const logo = "frontend/public/brand/ascend-logo.png";
const assets = "ios/App/App/Assets.xcassets";
const icon = await sharp(logo).resize(840, 840, { fit: "inside" }).png().toBuffer();
const compositedIcon = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#07090d" } })
  .composite([{ input: icon, gravity: "centre" }]).png().toBuffer();
await sharp(compositedIcon).flatten({ background: "#07090d" }).removeAlpha()
  .png().toFile(`${assets}/AppIcon.appiconset/AppIcon-512@2x.png`);
const splashLogo = await sharp(logo).resize(900, 900, { fit: "inside" }).png().toBuffer();
const splash = await sharp({ create: { width: 2732, height: 2732, channels: 3, background: "#07090d" } })
  .composite([{ input: splashLogo, gravity: "centre" }]).png().toBuffer();
const { images } = JSON.parse(await readFile(`${assets}/Splash.imageset/Contents.json`, "utf8"));
for (const { filename } of images) await sharp(splash).toFile(`${assets}/Splash.imageset/${filename}`);
console.log("Generated opaque iOS icon and Ascend launch images.");
