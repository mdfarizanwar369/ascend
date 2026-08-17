"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  AscendTopographyOpening,
  type AscendTopographySignal
} from "@/components/dashboard/AscendTopographyOpening";
import type { LivingAscentMode } from "@/components/dashboard/livingAscentPolicy";

type SignalKey = AscendTopographySignal["key"];
type Point = { x: number; y: number };

type QualityProfile = {
  contourCount: number;
  pointCount: number;
  dprCap: number;
  bloomPasses: number;
  shadowBlur: number;
};

type Contour = {
  depth: number;
  points: Float32Array;
};

type SceneGeometry = {
  width: number;
  height: number;
  scale: number;
  center: Point;
  summit: Point;
  momentum: Point;
  momentumRadius: number;
  signalTargets: Record<SignalKey, Point>;
};

type Timeline = {
  duration: number;
  awakenEnd: number;
  recognitionStart: number;
  recognitionEnd: number;
  ascentStart: number;
  ascentEnd: number;
  summitCharge: number;
  summitRelease: number;
  summitEnd: number;
  foldStart: number;
  foldEnd: number;
  settleStart: number;
};

type MotionState = {
  awaken: number;
  recognition: number;
  ascent: number;
  summitCharge: number;
  summitPulse: number;
  summitTravel: number;
  fold: number;
  settle: number;
  veil: number;
};

type Palette = {
  light: boolean;
  backdrop: string;
  fog: string;
  fogEdge: string;
  contourTeal: string;
  contourPurple: string;
  contourFill: string;
  mountain: string;
  track: string;
  text: string;
};

const FULL_TIMELINE: Timeline = {
  duration: 2680,
  awakenEnd: 350,
  recognitionStart: 300,
  recognitionEnd: 750,
  ascentStart: 750,
  ascentEnd: 1350,
  summitCharge: 1350,
  summitRelease: 1435,
  summitEnd: 1800,
  foldStart: 1770,
  foldEnd: 2450,
  settleStart: 2380
};

const DAILY_TIMELINE: Timeline = {
  duration: 1060,
  awakenEnd: 170,
  recognitionStart: 80,
  recognitionEnd: 250,
  ascentStart: 180,
  ascentEnd: 530,
  summitCharge: 500,
  summitRelease: 555,
  summitEnd: 710,
  foldStart: 655,
  foldEnd: 930,
  settleStart: 900
};

const SIGNAL_COLORS: Record<SignalKey, string> = {
  fuel: "#a3ff46",
  move: "#a484ff",
  recover: "#35f2d0"
};

const SIGNAL_STARTS: Record<SignalKey, Point> = {
  fuel: { x: -0.49, y: 0.18 },
  move: { x: -0.03, y: 0.35 },
  recover: { x: 0.47, y: 0.16 }
};

const TAU = Math.PI * 2;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function smoothstep(start: number, end: number, value: number) {
  const progress = clamp((value - start) / Math.max(end - start, 1));
  return progress * progress * (3 - 2 * progress);
}

function easeInCubic(value: number) {
  return value * value * value;
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function selectQualityProfile(): QualityProfile {
  const device = navigator as Navigator & { deviceMemory?: number };
  const cores = device.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 4;
  const constrained = cores <= 4 || memory <= 3;
  const capable = cores >= 8 && memory >= 6;

  if (constrained) {
    return { contourCount: 8, pointCount: 56, dprCap: 1.25, bloomPasses: 1, shadowBlur: 10 };
  }

  if (capable) {
    return { contourCount: 13, pointCount: 84, dprCap: 1.75, bloomPasses: 3, shadowBlur: 22 };
  }

  return { contourCount: 10, pointCount: 68, dprCap: 1.5, bloomPasses: 2, shadowBlur: 16 };
}

function buildContours(profile: QualityProfile): Contour[] {
  return Array.from({ length: profile.contourCount }, (_, layer) => {
    const points = new Float32Array(profile.pointCount * 2);
    const layerProgress = layer / Math.max(profile.contourCount - 1, 1);
    const width = 1.04 - layerProgress * 0.5;
    const height = 0.64 - layerProgress * 0.23;
    const phase = layer * 0.57;

    for (let point = 0; point < profile.pointCount; point += 1) {
      const angle = (point / profile.pointCount) * TAU - Math.PI / 2;
      const organic = 1 + Math.sin(angle * 3 + phase) * 0.075 + Math.cos(angle * 5 - phase) * 0.04;
      const summitBias = layerProgress * 0.16;
      points[point * 2] = Math.cos(angle) * width * organic + summitBias + Math.sin(angle * 2 + phase * 0.2) * 0.045;
      points[point * 2 + 1] = Math.sin(angle) * height * organic - summitBias * 0.42 + Math.cos(angle * 2 - phase) * 0.025;
    }

    return { depth: layerProgress - 0.5, points };
  });
}

function paletteForTheme(): Palette {
  const light = document.documentElement.dataset.theme === "light";
  if (light) {
    return {
      light: true,
      backdrop: "rgba(238,243,248,0.98)",
      fog: "rgba(193,226,222,0.5)",
      fogEdge: "rgba(118,92,190,0.09)",
      contourTeal: "rgba(17,139,124,0.58)",
      contourPurple: "rgba(109,63,209,0.5)",
      contourFill: "rgba(255,255,255,0.18)",
      mountain: "rgba(17,139,124,0.9)",
      track: "rgba(16,29,42,0.12)",
      text: "rgba(16,29,42,0.94)"
    };
  }

  return {
    light: false,
    backdrop: "rgba(7,12,18,0.95)",
    fog: "rgba(18,35,47,0.88)",
    fogEdge: "rgba(98,74,165,0.09)",
    contourTeal: "rgba(86,232,207,0.62)",
    contourPurple: "rgba(164,132,255,0.58)",
    contourFill: "rgba(33,113,112,0.16)",
    mountain: "rgba(93,244,217,0.94)",
    track: "rgba(255,255,255,0.1)",
    text: "rgba(255,255,255,0.96)"
  };
}

function measureScene(): SceneGeometry | null {
  const momentumContainer = document.querySelector('[data-ascend-opening-target="momentum"]');
  const momentumRing = momentumContainer?.querySelector(".ascend-rise-momentum") ?? momentumContainer;
  const fuel = document.querySelector('[data-ascend-opening-target="fuel"]');
  const move = document.querySelector('[data-ascend-opening-target="move"]');
  const recover = document.querySelector('[data-ascend-opening-target="recover"]');

  if (!momentumRing || !fuel || !move || !recover) return null;

  const width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const height = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const momentumRect = momentumRing.getBoundingClientRect();
  const momentum = centerOf(momentumRing);
  const scale = Math.min(width * 0.92, height * 0.52, 410);
  const center = {
    x: momentum.x,
    y: clamp(momentum.y + scale * 0.06, scale * 0.56, height - scale * 0.42)
  };

  return {
    width,
    height,
    scale,
    center,
    summit: { x: center.x + scale * 0.32, y: center.y - scale * 0.37 },
    momentum,
    momentumRadius: Math.max(48, Math.min(momentumRect.width, momentumRect.height) * 0.38),
    signalTargets: {
      fuel: centerOf(fuel),
      move: centerOf(move),
      recover: centerOf(recover)
    }
  };
}

function updateMotion(state: MotionState, elapsed: number, timeline: Timeline) {
  state.awaken = smoothstep(0, timeline.awakenEnd, elapsed);
  state.recognition = smoothstep(timeline.recognitionStart, timeline.recognitionEnd, elapsed);
  state.ascent = easeInCubic(smoothstep(timeline.ascentStart, timeline.ascentEnd, elapsed));
  state.summitCharge = smoothstep(timeline.summitCharge, timeline.summitRelease, elapsed);
  const summitProgress = smoothstep(timeline.summitRelease, timeline.summitEnd, elapsed);
  state.summitTravel = summitProgress;
  state.summitPulse = Math.sin(summitProgress * Math.PI) * (1 - state.fold * 0.65);
  state.fold = easeInOutCubic(smoothstep(timeline.foldStart, timeline.foldEnd, elapsed));
  state.settle = easeOutCubic(smoothstep(timeline.settleStart, timeline.duration, elapsed));
  state.veil = clamp(1 - smoothstep(timeline.foldStart + 70, timeline.duration, elapsed));
}

function projectLandscapePoint(
  scene: SceneGeometry,
  localX: number,
  localY: number,
  depth: number,
  motion: MotionState,
  targetAngle: number,
  output: Point
) {
  const cameraAdvance = motion.recognition * 0.045 + motion.ascent * 0.075 - motion.summitPulse * 0.095;
  const perspective = 1 + depth * (0.14 + motion.ascent * 0.05);
  const separation = depth * scene.scale * motion.summitPulse * 0.19;
  const reaction = depth * scene.scale * motion.ascent * 0.025;
  const landscapeX = scene.center.x + localX * scene.scale * perspective * (1 + cameraAdvance) + separation + reaction;
  const landscapeY = scene.center.y + localY * scene.scale * (0.77 + cameraAdvance * 0.7) - separation * 0.52 - depth * scene.scale * 0.095;
  const ringX = scene.momentum.x + Math.cos(targetAngle) * scene.momentumRadius;
  const ringY = scene.momentum.y + Math.sin(targetAngle) * scene.momentumRadius;

  output.x = lerp(landscapeX, ringX, motion.fold);
  output.y = lerp(landscapeY, ringY, motion.fold);
}

function projectIdentityPoint(scene: SceneGeometry, localX: number, localY: number, motion: MotionState, output: Point) {
  const scale = scene.scale * (1 + motion.ascent * 0.08 - motion.summitPulse * 0.025);
  output.x = scene.center.x + localX * scale + motion.summitPulse * localX * 18;
  output.y = scene.center.y + localY * scale - motion.ascent * 7 - motion.summitPulse * 9;
}

function cubicPoint(start: Point, controlOne: Point, controlTwo: Point, end: Point, progress: number, output: Point) {
  const inverse = 1 - progress;
  const inverseSquared = inverse * inverse;
  const progressSquared = progress * progress;
  output.x = inverseSquared * inverse * start.x + 3 * inverseSquared * progress * controlOne.x + 3 * inverse * progressSquared * controlTwo.x + progressSquared * progress * end.x;
  output.y = inverseSquared * inverse * start.y + 3 * inverseSquared * progress * controlOne.y + 3 * inverse * progressSquared * controlTwo.y + progressSquared * progress * end.y;
}

function drawBackground(context: CanvasRenderingContext2D, scene: SceneGeometry, palette: Palette, motion: MotionState, mode: LivingAscentMode) {
  context.clearRect(0, 0, scene.width, scene.height);
  context.save();
  context.globalAlpha = motion.veil * (mode === "first" ? 0.98 : 0.9);
  context.fillStyle = palette.backdrop;
  context.fillRect(0, 0, scene.width, scene.height);

  const atmosphere = context.createRadialGradient(
    scene.summit.x,
    scene.summit.y,
    0,
    scene.center.x,
    scene.center.y,
    scene.scale * 1.05
  );
  atmosphere.addColorStop(0, palette.fog);
  atmosphere.addColorStop(0.48, palette.fogEdge);
  atmosphere.addColorStop(1, "rgba(0,0,0,0)");
  context.globalAlpha = motion.awaken * motion.veil * 0.68;
  context.fillStyle = atmosphere;
  context.fillRect(0, 0, scene.width, scene.height);
  context.restore();
}

function drawContours(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  contours: Contour[],
  palette: Palette,
  profile: QualityProfile,
  motion: MotionState
) {
  const projected = { x: 0, y: 0 };
  const primaryLayer = Math.floor(contours.length * 0.52);

  for (let layer = 0; layer < contours.length; layer += 1) {
    const contour = contours[layer];
    const isPrimary = layer === primaryLayer;
    const layerProgress = layer / Math.max(contours.length - 1, 1);
    const layerReveal = smoothstep(layerProgress * 0.18, 0.72 + layerProgress * 0.14, motion.awaken);
    const foldFade = isPrimary ? 1 : Math.pow(1 - motion.fold, 1.28);
    const alpha = layerReveal * foldFade * (0.24 + (layer / contours.length) * 0.52);
    const wavePosition = 1 - motion.summitTravel;
    const summitWave = Math.exp(-Math.pow((layerProgress - wavePosition) / 0.16, 2)) * motion.summitPulse;
    if (alpha <= 0.002) continue;

    context.beginPath();
    for (let point = 0; point < contour.points.length / 2; point += 1) {
      const angle = (point / (contour.points.length / 2)) * TAU - Math.PI / 2;
      projectLandscapePoint(
        scene,
        contour.points[point * 2],
        contour.points[point * 2 + 1],
        contour.depth,
        motion,
        angle,
        projected
      );
      if (point === 0) context.moveTo(projected.x, projected.y);
      else context.lineTo(projected.x, projected.y);
    }
    context.closePath();

    if (motion.fold < 0.72) {
      context.save();
      context.globalAlpha = alpha * (0.12 + layerProgress * 0.16);
      context.fillStyle = palette.contourFill;
      context.shadowColor = layer % 3 === 1 ? "rgba(164,132,255,0.2)" : "rgba(53,242,208,0.16)";
      context.shadowBlur = 12 + layerProgress * 12;
      context.shadowOffsetY = 5 + layerProgress * 8;
      context.fill();
      context.restore();
    }

    context.save();
    context.globalAlpha = alpha * (isPrimary ? 1.35 : 1);
    context.strokeStyle = layer % 3 === 1 ? palette.contourPurple : palette.contourTeal;
    context.lineWidth = isPrimary ? lerp(1.4, 8.5, motion.fold) : lerp(0.75, 1.25, motion.summitPulse);
    if (profile.bloomPasses > 1 && motion.summitPulse > 0.08) {
      context.shadowColor = layer % 3 === 1 ? "rgba(164,132,255,0.5)" : "rgba(53,242,208,0.5)";
      context.shadowBlur = profile.shadowBlur * motion.summitPulse;
    }
    context.stroke();
    context.restore();

    if (summitWave > 0.025 && profile.bloomPasses > 1) {
      context.save();
      context.globalCompositeOperation = palette.light ? "source-over" : "lighter";
      context.globalAlpha = summitWave * 0.7;
      context.strokeStyle = palette.light
        ? layer % 3 === 1 ? "rgba(109,63,209,0.78)" : "rgba(17,139,124,0.82)"
        : layer % 3 === 1 ? "rgba(198,180,255,0.94)" : "rgba(142,255,232,0.94)";
      context.lineWidth = 1.6 + summitWave * 2.2;
      context.shadowColor = layer % 3 === 1 ? "#a484ff" : "#35f2d0";
      context.shadowBlur = profile.shadowBlur * 1.15;
      context.stroke();
      context.restore();
    }
  }
}

function drawMountainIdentity(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  palette: Palette,
  profile: QualityProfile,
  motion: MotionState
) {
  const alpha = motion.recognition * Math.pow(1 - motion.fold, 1.5);
  if (alpha <= 0.002) return;

  const left = { x: 0, y: 0 };
  const crest = { x: 0, y: 0 };
  const valley = { x: 0, y: 0 };
  const right = { x: 0, y: 0 };
  projectIdentityPoint(scene, -0.43, 0.25, motion, left);
  projectIdentityPoint(scene, -0.13, -0.31, motion, crest);
  projectIdentityPoint(scene, 0.07, 0.04, motion, valley);
  projectIdentityPoint(scene, 0.27, 0.25, motion, right);

  context.save();
  context.globalAlpha = alpha * 0.76;
  context.strokeStyle = palette.mountain;
  context.lineWidth = lerp(2.3, 4.6, motion.recognition);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (profile.bloomPasses > 1) {
    context.shadowColor = "rgba(53,242,208,0.34)";
    context.shadowBlur = profile.shadowBlur * 0.6 * motion.recognition;
  }
  context.beginPath();
  context.moveTo(left.x, left.y);
  context.lineTo(crest.x, crest.y);
  context.lineTo(valley.x, valley.y);
  context.lineTo(right.x, right.y);
  context.stroke();
  context.restore();
}

function drawSignalTrajectories(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  signals: AscendTopographySignal[],
  palette: Palette,
  profile: QualityProfile,
  motion: MotionState
) {
  const start = { x: 0, y: 0 };
  const controlOne = { x: 0, y: 0 };
  const controlTwo = { x: 0, y: 0 };
  const end = { x: 0, y: 0 };
  const point = { x: 0, y: 0 };
  const marker = { x: 0, y: 0 };

  for (const signal of signals) {
    const localStart = SIGNAL_STARTS[signal.key];
    projectIdentityPoint(scene, localStart.x, localStart.y, motion, start);
    controlOne.x = lerp(start.x, scene.summit.x, 0.34);
    controlOne.y = start.y - scene.scale * (signal.key === "move" ? 0.14 : 0.08);
    controlTwo.x = lerp(start.x, scene.summit.x, 0.72);
    controlTwo.y = scene.summit.y + scene.scale * 0.12;
    end.x = scene.summit.x;
    end.y = scene.summit.y;

    const dataStrength = 0.22 + clamp(signal.progress / 100) * 0.78;
    const reveal = clamp(motion.recognition * (0.42 + dataStrength * 0.58) + motion.summitCharge * 0.5);
    const routeAlpha = motion.recognition * (1 - motion.fold) * (0.2 + dataStrength * 0.48);
    const samples = 28;

    context.save();
    context.globalAlpha = routeAlpha;
    context.strokeStyle = SIGNAL_COLORS[signal.key];
    context.lineCap = "round";
    context.lineWidth = 1.1 + dataStrength * 1.35;
    if (profile.bloomPasses > 1 && motion.summitPulse > 0.04) {
      context.globalCompositeOperation = palette.light ? "source-over" : "lighter";
      context.shadowColor = SIGNAL_COLORS[signal.key];
      context.shadowBlur = profile.shadowBlur * motion.summitPulse;
    }
    context.beginPath();
    for (let sample = 0; sample <= samples; sample += 1) {
      const progress = (sample / samples) * reveal;
      cubicPoint(start, controlOne, controlTwo, end, progress, point);
      if (sample === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.stroke();
    context.restore();

    const markerProgress = Math.min(0.82, 0.26 + dataStrength * 0.52);
    cubicPoint(start, controlOne, controlTwo, end, markerProgress, marker);
    marker.x = lerp(marker.x, scene.signalTargets[signal.key].x, motion.fold);
    marker.y = lerp(marker.y, scene.signalTargets[signal.key].y, motion.fold);
    const markerAlpha = motion.recognition * (1 - motion.settle) * (0.5 + motion.summitPulse * 0.5);

    context.save();
    context.globalCompositeOperation = palette.light ? "source-over" : "lighter";
    context.globalAlpha = markerAlpha;
    context.fillStyle = SIGNAL_COLORS[signal.key];
    context.shadowColor = SIGNAL_COLORS[signal.key];
    context.shadowBlur = profile.shadowBlur * (0.5 + motion.summitPulse);
    context.beginPath();
    context.arc(marker.x, marker.y, 2.5 + motion.summitPulse * 2.8, 0, TAU);
    context.fill();
    context.restore();

    if (motion.recognition > 0.55 && motion.fold < 0.2) {
      context.save();
      context.globalAlpha = smoothstep(0.55, 0.9, motion.recognition) * 0.34 * (1 - motion.summitPulse);
      context.fillStyle = palette.text;
      context.font = "700 9px system-ui, sans-serif";
      context.letterSpacing = "1.2px";
      context.fillText(`${signal.label.toUpperCase()} ${Math.round(clamp(signal.progress / 100) * 100)}%`, marker.x + 8, marker.y - 5);
      context.restore();
    }
  }
}

function drawSummitEvent(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  palette: Palette,
  profile: QualityProfile,
  motion: MotionState
) {
  const energy = motion.summitCharge * (1 - motion.fold) * 0.45 + motion.summitPulse;
  if (energy <= 0.01) return;

  context.save();
  context.globalCompositeOperation = palette.light ? "source-over" : "lighter";
  const pulseRadius = scene.scale * (0.09 + motion.summitPulse * 0.72);
  const pulse = context.createRadialGradient(scene.summit.x, scene.summit.y, 0, scene.summit.x, scene.summit.y, pulseRadius);
  pulse.addColorStop(0, palette.light ? `rgba(126,190,40,${0.28 * energy})` : `rgba(163,255,70,${0.5 * energy})`);
  pulse.addColorStop(0.26, palette.light ? `rgba(17,139,124,${0.2 * energy})` : `rgba(53,242,208,${0.32 * energy})`);
  pulse.addColorStop(0.62, palette.light ? `rgba(109,63,209,${0.1 * energy})` : `rgba(164,132,255,${0.16 * energy})`);
  pulse.addColorStop(1, "rgba(164,132,255,0)");
  context.fillStyle = pulse;
  context.fillRect(scene.summit.x - pulseRadius, scene.summit.y - pulseRadius, pulseRadius * 2, pulseRadius * 2);

  context.globalAlpha = motion.summitPulse * 0.78;
  context.strokeStyle = palette.light ? "rgba(17,139,124,0.58)" : "rgba(170,255,235,0.72)";
  context.lineWidth = 1.2;
  context.shadowColor = "rgba(53,242,208,0.72)";
  context.shadowBlur = profile.shadowBlur;
  for (let ray = 0; ray < 3; ray += 1) {
    const angle = -1.18 + ray * 0.62;
    const length = scene.scale * (0.22 + ray * 0.035) * motion.summitPulse;
    context.beginPath();
    context.moveTo(scene.summit.x, scene.summit.y);
    context.lineTo(scene.summit.x + Math.cos(angle) * length, scene.summit.y + Math.sin(angle) * length);
    context.stroke();
  }
  context.restore();
}

function drawMomentumRing(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  palette: Palette,
  score: number,
  isStarting: boolean,
  motion: MotionState
) {
  const ringAlpha = smoothstep(0.42, 0.9, motion.fold);
  if (ringAlpha <= 0.002) return;

  context.save();
  context.globalAlpha = ringAlpha * (1 - motion.settle * 0.82);
  context.strokeStyle = palette.track;
  context.lineWidth = 8.5;
  context.beginPath();
  context.arc(scene.momentum.x, scene.momentum.y, scene.momentumRadius, 0, TAU);
  context.stroke();

  if (!isStarting && score > 0) {
    const segmentCount = Math.max(4, Math.ceil(clamp(score / 100) * 34));
    const progressAngle = clamp(score / 100) * TAU;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const segmentStart = -Math.PI / 2 + (segment / segmentCount) * progressAngle;
      const segmentEnd = -Math.PI / 2 + ((segment + 1) / segmentCount) * progressAngle + 0.008;
      const colorProgress = segment / Math.max(segmentCount - 1, 1);
      context.strokeStyle = colorProgress < 0.5 ? "#35f2d0" : "#a3ff46";
      context.lineWidth = 8.5;
      context.lineCap = "round";
      context.beginPath();
      context.arc(scene.momentum.x, scene.momentum.y, scene.momentumRadius, segmentStart, segmentEnd);
      context.stroke();
    }
  }
  context.restore();
}

function drawArrow(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  profile: QualityProfile,
  score: number,
  isStarting: boolean,
  motion: MotionState
) {
  const base = { x: 0, y: 0 };
  const controlOne = { x: 0, y: 0 };
  const controlTwo = { x: 0, y: 0 };
  const summit = { x: 0, y: 0 };
  const arrow = { x: 0, y: 0 };
  const previous = { x: 0, y: 0 };
  projectIdentityPoint(scene, -0.39, 0.28, motion, base);
  projectIdentityPoint(scene, -0.16, 0.18, motion, controlOne);
  projectIdentityPoint(scene, 0.12, -0.12, motion, controlTwo);
  projectIdentityPoint(scene, 0.34, -0.37, motion, summit);

  const ascentProgress = clamp(motion.ascent);
  cubicPoint(base, controlOne, controlTwo, summit, ascentProgress, arrow);
  cubicPoint(base, controlOne, controlTwo, summit, Math.max(0, ascentProgress - 0.018), previous);

  if (motion.fold > 0) {
    const progress = isStarting ? 0 : clamp(score / 100);
    const angle = -Math.PI / 2 + progress * TAU;
    const target = {
      x: scene.momentum.x + Math.cos(angle) * scene.momentumRadius,
      y: scene.momentum.y + Math.sin(angle) * scene.momentumRadius
    };
    const foldArc = Math.sin(motion.fold * Math.PI) * scene.scale * 0.08;
    arrow.x = lerp(summit.x, target.x, motion.fold);
    arrow.y = lerp(summit.y, target.y, motion.fold) - foldArc;
    previous.x = lerp(summit.x - 5, target.x - Math.sin(angle) * 4, motion.fold);
    previous.y = lerp(summit.y + 3, target.y + Math.cos(angle) * 4, motion.fold) - foldArc;
  }

  const arrowAlpha = clamp(motion.recognition * 1.4) * (1 - motion.settle * 0.75);
  if (arrowAlpha <= 0.002) return;
  const angle = Math.atan2(arrow.y - previous.y, arrow.x - previous.x);

  if (motion.ascent > 0.03 && motion.fold < 0.45) {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.globalAlpha = arrowAlpha * (0.18 + motion.ascent * 0.32);
    context.strokeStyle = "#a3ff46";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.beginPath();
    const trailSamples = 10;
    for (let sample = 0; sample < trailSamples; sample += 1) {
      const trailProgress = Math.max(0, ascentProgress - 0.2 + (sample / trailSamples) * 0.2);
      cubicPoint(base, controlOne, controlTwo, summit, trailProgress, previous);
      if (sample === 0) context.moveTo(previous.x, previous.y);
      else context.lineTo(previous.x, previous.y);
    }
    context.stroke();
    context.restore();
  }

  context.save();
  context.translate(arrow.x, arrow.y);
  context.rotate(angle);
  context.globalAlpha = arrowAlpha;
  context.strokeStyle = "#a3ff46";
  context.lineWidth = 3.6;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(163,255,70,0.75)";
  context.shadowBlur = profile.shadowBlur * (0.45 + motion.summitPulse);
  context.beginPath();
  context.moveTo(-6, -5);
  context.lineTo(6, 0);
  context.lineTo(-6, 5);
  context.stroke();
  context.restore();
}

function drawMomentumValue(
  context: CanvasRenderingContext2D,
  scene: SceneGeometry,
  palette: Palette,
  score: number,
  isStarting: boolean,
  motion: MotionState
) {
  const alpha = smoothstep(0.34, 0.78, motion.fold) * (1 - smoothstep(0.86, 1, motion.fold));
  if (alpha <= 0.002) return;

  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = palette.text;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "650 42px system-ui, sans-serif";
  context.fillText(isStarting ? "--" : String(score), scene.momentum.x, scene.momentum.y - 8);
  context.globalAlpha = alpha * 0.72;
  context.font = "800 9px system-ui, sans-serif";
  context.letterSpacing = "2px";
  context.fillText("MOMENTUM", scene.momentum.x, scene.momentum.y + 24);
  context.restore();
}

export function AscendLivingAscentOpening({
  active,
  mode,
  score,
  isStarting,
  signals,
  onFinish
}: {
  active: boolean;
  mode: LivingAscentMode;
  score: number;
  isStarting: boolean;
  signals: AscendTopographySignal[];
  onFinish: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const finishRef = useRef(onFinish);
  const configRef = useRef({ score, isStarting, signals });
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    finishRef.current = onFinish;
    configRef.current = { score, isStarting, signals };
  }, [isStarting, onFinish, score, signals]);

  useEffect(() => {
    if (!active) setUseFallback(false);
  }, [active]);

  useLayoutEffect(() => {
    if (!active || useFallback) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishRef.current();
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) {
      setUseFallback(true);
      return;
    }

    const profile = selectQualityProfile();
    const contours = buildContours(profile);
    const palette = paletteForTheme();
    const timeline = mode === "first" ? FULL_TIMELINE : DAILY_TIMELINE;
    const motion: MotionState = { awaken: 0, recognition: 0, ascent: 0, summitCharge: 0, summitPulse: 0, summitTravel: 0, fold: 0, settle: 0, veil: 1 };
    let scene = measureScene();
    let animationFrame = 0;
    let resizeFrame = 0;
    let startedAt = 0;
    let finished = false;

    const resize = () => {
      scene = measureScene();
      if (!scene) throw new Error("Living Ascent targets are unavailable");
      const dpr = Math.min(window.devicePixelRatio || 1, profile.dprCap);
      canvas.width = Math.max(1, Math.round(scene.width * dpr));
      canvas.height = Math.max(1, Math.round(scene.height * dpr));
      canvas.style.width = `${scene.width}px`;
      canvas.style.height = `${scene.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(resizeFrame);
      context.clearRect(0, 0, canvas.width, canvas.height);
      finishRef.current();
    };

    const fallback = () => {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(resizeFrame);
      setUseFallback(true);
    };

    const render = (timestamp: number) => {
      if (finished || !scene) return;
      if (!startedAt) startedAt = timestamp;
      const elapsed = Math.min(timestamp - startedAt, timeline.duration);

      try {
        updateMotion(motion, elapsed, timeline);
        const config = configRef.current;
        drawBackground(context, scene, palette, motion, mode);
        drawContours(context, scene, contours, palette, profile, motion);
        drawSignalTrajectories(context, scene, config.signals, palette, profile, motion);
        drawMountainIdentity(context, scene, palette, profile, motion);
        drawSummitEvent(context, scene, palette, profile, motion);
        drawMomentumRing(context, scene, palette, config.score, config.isStarting, motion);
        drawArrow(context, scene, profile, config.score, config.isStarting, motion);
        drawMomentumValue(context, scene, palette, config.score, config.isStarting, motion);
      } catch {
        fallback();
        return;
      }

      if (elapsed >= timeline.duration) finish();
      else animationFrame = window.requestAnimationFrame(render);
    };

    const handleResize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        try {
          resize();
        } catch {
          fallback();
        }
      });
    };
    const handleVisibility = () => {
      if (document.hidden) finish();
    };

    try {
      resize();
      animationFrame = window.requestAnimationFrame(render);
    } catch {
      fallback();
    }

    window.addEventListener("resize", handleResize, { passive: true });
    window.visualViewport?.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("scroll", finish, { passive: true, once: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      finished = true;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", finish);
      document.removeEventListener("visibilitychange", handleVisibility);
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, mode, useFallback]);

  if (useFallback) {
    return (
      <AscendTopographyOpening
        active={active}
        score={score}
        isStarting={isStarting}
        signals={signals}
        onFinish={onFinish}
      />
    );
  }

  if (!active) return null;

  return (
    <div className="ascend-living-ascent-overlay" aria-hidden="true" data-testid="ascend-living-ascent-opening" data-mode={mode}>
      <canvas ref={canvasRef} className="ascend-living-ascent-canvas" />
    </div>
  );
}
