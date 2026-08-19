import type { AscendStoryContext, AscendStoryCrop, AscendStoryDraft, AscendStoryPhoto } from "@/lib/ascendStories";
import { formatStoryDate, storyElapsedLabel } from "@/lib/ascendStories";

export const ASCEND_STORY_WIDTH = 1080;
export const ASCEND_STORY_HEIGHT = 1920;
export const ASCEND_STORY_LOGO_URL = "/brand/ascend-mark-exact.png";

const INK = "#09111c";
const WHITE = "#f8fafc";
const MUTED = "#c5ceda";
const PURPLE = "#a484ff";
const TEAL = "#35f2d0";

function loadImage(url: string) {
  return new Promise<HTMLImageElement>(async (resolve, reject) => {
    const image = new Image();
    let objectUrl: string | null = null;

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not prepare this photo. Reopen Progress Photos and try again."));
    };

    try {
      const response = await fetch(url, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("Photo request failed.");
      objectUrl = URL.createObjectURL(await response.blob());
      image.src = objectUrl;
    } catch {
      image.crossOrigin = "anonymous";
      image.src = url;
    }
  });
}

export function calculateStoryCoverPlacement(
  image: { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
  crop: AscendStoryCrop
) {
  const baseScale = Math.max(width / image.width, height / image.height);
  const scale = baseScale * crop.zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = x + (width - drawWidth) / 2 + (crop.x / 100) * width * 0.42;
  const offsetY = y + (height - drawHeight) / 2 + (crop.y / 100) * height * 0.42;
  return { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight };
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number; height: number },
  x: number,
  y: number,
  width: number,
  height: number,
  crop: AscendStoryCrop
) {
  const placement = calculateStoryCoverPlacement(image, x, y, width, height, crop);

  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.drawImage(image, placement.x, placement.y, placement.width, placement.height);
  context.restore();
}

function fillVerticalGradient(context: CanvasRenderingContext2D, top: number, bottom: number, stops: Array<[number, string]>) {
  const gradient = context.createLinearGradient(0, top, 0, bottom);
  for (const [position, color] of stops) gradient.addColorStop(position, color);
  context.fillStyle = gradient;
  context.fillRect(0, top, ASCEND_STORY_WIDTH, bottom - top);
}

function splitTokenToWidth(context: Pick<CanvasRenderingContext2D, "measureText">, token: string, maxWidth: number) {
  const chunks: string[] = [];
  let current = "";
  for (const character of Array.from(token)) {
    const next = `${current}${character}`;
    if (!current || context.measureText(next).width <= maxWidth) current = next;
    else {
      chunks.push(current);
      current = character;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function wrapStoryText(context: Pick<CanvasRenderingContext2D, "measureText">, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean).flatMap((word) => (
    context.measureText(word).width > maxWidth ? splitTokenToWidth(context, word, maxWidth) : [word]
  ));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);

  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let finalLine = lines[lines.length - 1];
    while (finalLine && context.measureText(`${finalLine}...`).width > maxWidth) {
      finalLine = Array.from(finalLine).slice(0, -1).join("").trimEnd();
    }
    lines[lines.length - 1] = `${finalLine}...`;
  }
  return lines;
}

function drawBrand(context: CanvasRenderingContext2D, logo: HTMLImageElement, quiet = false) {
  const size = quiet ? 72 : 88;
  context.drawImage(logo, 72, 176, size, size * (logo.height / logo.width));
  context.fillStyle = WHITE;
  context.font = "700 38px Arial, sans-serif";
  context.fillText("ASCEND", 72 + size + 20, 224);
  context.fillStyle = quiet ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.72)";
  context.font = "600 18px Arial, sans-serif";
  context.letterSpacing = "5px";
  context.fillText("MADE WITH ASCEND", 72 + size + 20, 256);
  context.letterSpacing = "0px";
}

function drawCaption(context: CanvasRenderingContext2D, draft: AscendStoryDraft, y: number, compact = false) {
  if (!draft.caption.trim()) return y;
  const fontSize = compact
    ? draft.style === "loud" ? 60 : draft.style === "quiet" ? 46 : 54
    : draft.style === "loud" ? 74 : draft.style === "quiet" ? 56 : 64;
  context.fillStyle = WHITE;
  context.font = `${draft.style === "quiet" ? 600 : 700} ${fontSize}px Arial, sans-serif`;
  const lines = wrapStoryText(context, draft.caption, 930, 3);
  const lineHeight = fontSize * 1.18;
  lines.forEach((line, index) => context.fillText(line, 74, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function drawMetrics(context: CanvasRenderingContext2D, story: AscendStoryContext, y: number, metricKeys: AscendStoryDraft["metricKeys"]) {
  const metrics = story.metrics.filter((metric) => metricKeys.includes(metric.key)).slice(0, 3);
  if (!metrics.length) return;
  const gap = 18;
  const width = (936 - gap * (metrics.length - 1)) / metrics.length;
  metrics.forEach((metric, index) => {
    const x = 72 + index * (width + gap);
    context.fillStyle = "rgba(8, 14, 24, 0.72)";
    context.beginPath();
    context.roundRect(x, y, width, 132, 24);
    context.fill();
    context.strokeStyle = "rgba(164, 132, 255, 0.34)";
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = MUTED;
    context.font = "600 21px Arial, sans-serif";
    context.fillText(metric.label.toUpperCase(), x + 22, y + 40);
    context.fillStyle = WHITE;
    context.font = "700 36px Arial, sans-serif";
    context.fillText(metric.value, x + 22, y + 92);
  });
}

function drawCinematicContours(context: CanvasRenderingContext2D) {
  context.save();
  context.strokeStyle = "rgba(164,132,255,0.18)";
  context.lineWidth = 2;
  for (let index = 0; index < 4; index += 1) {
    context.beginPath();
    context.ellipse(980, 460, 190 + index * 50, 330 + index * 62, -0.45, 0.15, Math.PI * 1.45);
    context.stroke();
  }
  context.restore();
}

function drawTodayOrEarned(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  logo: HTMLImageElement,
  story: AscendStoryContext,
  draft: AscendStoryDraft
) {
  const hasMetrics = draft.metricKeys.length > 0;
  drawCover(context, image, 0, 0, ASCEND_STORY_WIDTH, ASCEND_STORY_HEIGHT, draft.latestCrop);

  if (draft.style === "quiet") {
    fillVerticalGradient(context, 0, ASCEND_STORY_HEIGHT, [
      [0, "rgba(9,17,28,0.36)"],
      [0.58, "rgba(9,17,28,0.06)"],
      [1, "rgba(9,17,28,0.92)"]
    ]);
  } else if (draft.style === "loud") {
    fillVerticalGradient(context, 0, ASCEND_STORY_HEIGHT, [
      [0, "rgba(7,10,18,0.58)"],
      [0.5, "rgba(7,10,18,0.02)"],
      [1, "rgba(30,12,58,0.96)"]
    ]);
    const accent = context.createLinearGradient(72, 0, 760, 0);
    accent.addColorStop(0, PURPLE);
    accent.addColorStop(1, TEAL);
    context.fillStyle = accent;
    context.fillRect(72, 1390, 238, 10);
  } else {
    fillVerticalGradient(context, 0, ASCEND_STORY_HEIGHT, [
      [0, "rgba(8,12,22,0.52)"],
      [0.48, "rgba(8,12,22,0.04)"],
      [1, "rgba(8,12,22,0.96)"]
    ]);
    drawCinematicContours(context);
  }

  if (draft.showAttribution) drawBrand(context, logo, draft.style === "quiet");
  if (draft.format === "earned" && story.milestone) {
    context.fillStyle = draft.style === "quiet" ? WHITE : TEAL;
    context.font = "700 24px Arial, sans-serif";
    context.letterSpacing = "7px";
    context.fillText("EARNED", 74, hasMetrics ? 1140 : 1260);
    context.letterSpacing = "0px";
  }
  const captionBottom = drawCaption(context, draft, hasMetrics ? 1210 : draft.format === "earned" ? 1350 : 1320, hasMetrics);
  if (draft.showDate) {
    context.fillStyle = MUTED;
    context.font = "500 28px Arial, sans-serif";
    context.fillText(formatStoryDate(story.latestPhoto.loggedAt), 74, Math.min(hasMetrics ? 1470 : 1610, captionBottom + 18));
  }
  if (hasMetrics) drawMetrics(context, story, 1520, draft.metricKeys);
}

function drawThenNow(
  context: CanvasRenderingContext2D,
  first: HTMLImageElement,
  latest: HTMLImageElement,
  logo: HTMLImageElement,
  story: AscendStoryContext,
  draft: AscendStoryDraft
) {
  const hasMetrics = draft.metricKeys.length > 0;
  const half = ASCEND_STORY_WIDTH / 2;
  drawCover(context, first, 0, 0, half, ASCEND_STORY_HEIGHT, draft.firstCrop);
  drawCover(context, latest, half, 0, half, ASCEND_STORY_HEIGHT, draft.latestCrop);
  context.fillStyle = "rgba(255,255,255,0.85)";
  context.fillRect(half - 2, 0, 4, ASCEND_STORY_HEIGHT);
  fillVerticalGradient(context, 0, ASCEND_STORY_HEIGHT, [
    [0, "rgba(6,10,18,0.56)"],
    [0.5, "rgba(6,10,18,0.02)"],
    [1, draft.style === "loud" ? "rgba(28,10,54,0.97)" : "rgba(6,10,18,0.96)"]
  ]);
  if (draft.style === "cinematic") drawCinematicContours(context);
  if (draft.showAttribution) drawBrand(context, logo, draft.style === "quiet");

  context.font = "700 24px Arial, sans-serif";
  context.letterSpacing = "6px";
  context.fillStyle = MUTED;
  context.fillText("THEN", 72, hasMetrics ? 1100 : 1210);
  context.fillStyle = TEAL;
  context.fillText("NOW", half + 36, hasMetrics ? 1100 : 1210);
  context.letterSpacing = "0px";

  const captionBottom = drawCaption(context, draft, hasMetrics ? 1180 : 1300, hasMetrics);
  if (draft.showDate) {
    context.fillStyle = MUTED;
    context.font = "500 26px Arial, sans-serif";
    const dates = `${formatStoryDate(story.firstPhoto.loggedAt)}  /  ${formatStoryDate(story.latestPhoto.loggedAt)}`;
    context.fillText(dates, 74, Math.min(hasMetrics ? 1435 : 1560, captionBottom + 18));
  }
  if (draft.showElapsed) {
    context.fillStyle = MUTED;
    context.font = "500 24px Arial, sans-serif";
    context.fillText(storyElapsedLabel(story.firstPhoto.loggedAt, story.latestPhoto.loggedAt), 74, hasMetrics ? 1480 : 1620);
  }
  if (hasMetrics) drawMetrics(context, story, 1520, draft.metricKeys);
}

export async function renderAscendStory(story: AscendStoryContext, draft: AscendStoryDraft) {
  if (typeof document === "undefined") throw new Error("Story export is available on your device.");

  const canvas = document.createElement("canvas");
  canvas.width = ASCEND_STORY_WIDTH;
  canvas.height = ASCEND_STORY_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This device could not prepare the story image.");

  context.fillStyle = INK;
  context.fillRect(0, 0, ASCEND_STORY_WIDTH, ASCEND_STORY_HEIGHT);

  const [first, distinctLatest, logo] = await Promise.all([
    loadImage(story.firstPhoto.url),
    story.firstPhoto.id === story.latestPhoto.id ? Promise.resolve(null) : loadImage(story.latestPhoto.url),
    loadImage(ASCEND_STORY_LOGO_URL)
  ]);
  const latest = distinctLatest ?? first;

  if (draft.format === "then-now") drawThenNow(context, first, latest, logo, story, draft);
  else drawTodayOrEarned(context, latest, logo, story, draft);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create the story image.")), "image/png");
  });
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}
