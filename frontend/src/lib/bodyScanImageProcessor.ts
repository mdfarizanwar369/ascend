import {
  BodyScanQualityStats,
  BodyScanQualityWarning,
  dataUrlByteSize,
  getBodyScanQualityWarnings,
  isLikelyDuplicateBodyScanImage
} from "@ascend/shared";

export interface OptimizedBodyScanImage {
  id: string;
  fileName: string;
  dataUrl: string;
  hash: string;
  originalBytes: number;
  optimizedBytes: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  crop: { x: number; y: number; width: number; height: number };
  stats: BodyScanQualityStats;
  warnings: BodyScanQualityWarning[];
  duplicate: boolean;
}

export interface BodyScanProcessOptions {
  existingHashes?: string[];
  signal?: AbortSignal;
  onStage?: (message: string) => void;
}

const cache = new Map<string, OptimizedBodyScanImage>();

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
}

function fileCacheKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function canvasToImageData(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read scan image.");
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function loadImage(file: File, signal?: AbortSignal) {
  assertNotCancelled(signal);
  try {
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      assertNotCancelled(signal);
      return bitmap;
    }
  } catch {
    // Fall back to HTMLImageElement below for browsers without createImageBitmap support for this file.
  }

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      assertNotCancelled(signal);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read this image. If it is HEIC, try taking a normal photo or screenshot."));
    };
    image.src = objectUrl;
  });
}

function drawToCanvas(source: CanvasImageSource, maxLongSide: number) {
  const width = "width" in source ? Number(source.width) : 1;
  const height = "height" in source ? Number(source.height) : 1;
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not prepare scan image.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cornerBrightness(data: Uint8ClampedArray, width: number, height: number) {
  const sample = Math.max(8, Math.floor(Math.min(width, height) * 0.05));
  const points = [
    [0, 0],
    [width - sample, 0],
    [0, height - sample],
    [width - sample, height - sample]
  ];
  let total = 0;
  let count = 0;
  for (const [startX, startY] of points) {
    for (let y = startY; y < startY + sample; y += 2) {
      for (let x = startX; x < startX + sample; x += 2) {
        const index = (y * width + x) * 4;
        total += (data[index] + data[index + 1] + data[index + 2]) / 3;
        count += 1;
      }
    }
  }
  return count ? total / count : 245;
}

function detectContentBounds(imageData: ImageData) {
  const { data, width, height } = imageData;
  const background = cornerBrightness(data, width, height);
  const threshold = Math.max(18, Math.min(42, Math.abs(background - 128) * 0.22 + 18));
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let changed = 0;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const index = (y * width + x) * 4;
      const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
      if (Math.abs(brightness - background) > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        changed += 1;
      }
    }
  }

  if (!changed) return { x: 0, y: 0, width, height, coverage: 1 };
  const padding = Math.round(Math.min(width, height) * 0.035);
  const x = Math.max(0, minX - padding);
  const y = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + padding);
  const bottom = Math.min(height, maxY + padding);
  const cropWidth = Math.max(1, right - x);
  const cropHeight = Math.max(1, bottom - y);
  return { x, y, width: cropWidth, height: cropHeight, coverage: (cropWidth * cropHeight) / (width * height) };
}

function cropCanvas(canvas: HTMLCanvasElement, crop: { x: number; y: number; width: number; height: number }) {
  const cropped = document.createElement("canvas");
  cropped.width = crop.width;
  cropped.height = crop.height;
  const context = cropped.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not crop scan image.");
  context.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return cropped;
}

function enhanceCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not enhance scan image.");
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  let sum = 0;
  for (let index = 0; index < data.length; index += 4) {
    sum += (data[index] + data[index + 1] + data[index + 2]) / 3;
  }
  const average = sum / (data.length / 4);
  const brightnessBoost = average < 95 ? 16 : average > 210 ? -10 : 0;
  const contrast = average < 110 ? 1.14 : 1.08;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.max(0, Math.min(255, (data[index] - 128) * contrast + 128 + brightnessBoost));
    data[index + 1] = Math.max(0, Math.min(255, (data[index + 1] - 128) * contrast + 128 + brightnessBoost));
    data[index + 2] = Math.max(0, Math.min(255, (data[index + 2] - 128) * contrast + 128 + brightnessBoost));
  }

  context.putImageData(imageData, 0, 0);
  context.filter = "contrast(1.04) brightness(1.01)";
  context.drawImage(canvas, 0, 0);
  context.filter = "none";
  return canvas;
}

function laplacianBlurScore(grayscale: number[], width: number, height: number) {
  const values: number[] = [];
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = grayscale[y * width + x] * 4;
      const laplace = center - grayscale[y * width + x - 1] - grayscale[y * width + x + 1] - grayscale[(y - 1) * width + x] - grayscale[(y + 1) * width + x];
      values.push(laplace);
    }
  }
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function analyzeCanvas(canvas: HTMLCanvasElement, contentCoverage: number): BodyScanQualityStats {
  const imageData = canvasToImageData(canvas);
  const grayscale: number[] = [];
  let brightnessTotal = 0;
  let brightPixels = 0;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const gray = (imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3;
    grayscale.push(gray);
    brightnessTotal += gray;
    if (gray > 245) brightPixels += 1;
  }

  const brightness = brightnessTotal / grayscale.length;
  const contrast = Math.sqrt(grayscale.reduce((sum, gray) => sum + (gray - brightness) ** 2, 0) / grayscale.length);

  return {
    width: canvas.width,
    height: canvas.height,
    brightness,
    contrast,
    blurScore: laplacianBlurScore(grayscale, canvas.width, canvas.height),
    glareRatio: brightPixels / grayscale.length,
    contentCoverage
  };
}

function averageHash(canvas: HTMLCanvasElement) {
  const small = document.createElement("canvas");
  small.width = 8;
  small.height = 8;
  const context = small.getContext("2d", { willReadFrequently: true });
  if (!context) return `${canvas.width}x${canvas.height}`;
  context.drawImage(canvas, 0, 0, 8, 8);
  const imageData = context.getImageData(0, 0, 8, 8);
  const values: number[] = [];
  for (let index = 0; index < imageData.data.length; index += 4) {
    values.push((imageData.data[index] + imageData.data[index + 1] + imageData.data[index + 2]) / 3);
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => value >= average ? "1" : "0").join("");
}

function exportOptimizedJpeg(canvas: HTMLCanvasElement) {
  for (const quality of [0.86, 0.82, 0.78]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlByteSize(dataUrl) <= 4.6 * 1024 * 1024) return dataUrl;
  }
  return canvas.toDataURL("image/jpeg", 0.74);
}

export async function optimizeBodyScanImage(file: File, options: BodyScanProcessOptions = {}): Promise<OptimizedBodyScanImage> {
  const key = fileCacheKey(file);
  const cached = cache.get(key);
  if (cached) return cached;

  options.onStage?.("Correcting orientation...");
  const image = await loadImage(file, options.signal);
  assertNotCancelled(options.signal);
  const originalWidth = Number("width" in image ? image.width : 0);
  const originalHeight = Number("height" in image ? image.height : 0);

  options.onStage?.("Detecting report area...");
  const baseCanvas = drawToCanvas(image, 1800);
  const bounds = detectContentBounds(canvasToImageData(baseCanvas));
  const croppedCanvas = cropCanvas(baseCanvas, bounds);

  options.onStage?.("Enhancing text clarity...");
  const maxTextSide = 1400;
  const resizedCanvas = croppedCanvas.width > maxTextSide || croppedCanvas.height > maxTextSide
    ? drawToCanvas(croppedCanvas, maxTextSide)
    : croppedCanvas;
  enhanceCanvas(resizedCanvas);

  assertNotCancelled(options.signal);
  const stats = analyzeCanvas(resizedCanvas, bounds.coverage);
  const warnings = getBodyScanQualityWarnings(stats);
  const dataUrl = exportOptimizedJpeg(resizedCanvas);
  const hash = averageHash(resizedCanvas);
  const duplicate = isLikelyDuplicateBodyScanImage(hash, options.existingHashes ?? []);
  const result: OptimizedBodyScanImage = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    fileName: file.name,
    dataUrl,
    hash,
    originalBytes: file.size,
    optimizedBytes: dataUrlByteSize(dataUrl),
    originalWidth,
    originalHeight,
    width: resizedCanvas.width,
    height: resizedCanvas.height,
    crop: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    stats,
    warnings,
    duplicate
  };
  cache.set(key, result);
  return result;
}

export function clearBodyScanImageCache() {
  cache.clear();
}
