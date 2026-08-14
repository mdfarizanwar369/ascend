import { z } from "zod";
import sharp, { Metadata } from "sharp";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const IMAGE_PROCESSING_TIMEOUT_SECONDS = 10;

export const imageContentTypeSchema = z.enum(ALLOWED_IMAGE_TYPES);

export const imageDataUrlSchema = z.string().superRefine((value, context) => {
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || !ALLOWED_IMAGE_TYPES.includes(match[1] as typeof ALLOWED_IMAGE_TYPES[number])) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Use a JPEG, PNG, or WebP image." });
    return;
  }

  const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
  const decodedBytes = Math.floor((match[2].length * 3) / 4) - padding;
  if (decodedBytes > MAX_IMAGE_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Image must be 5 MB or smaller." });
  }
});

export function parseImageDataUrl(value: string) {
  const validated = imageDataUrlSchema.parse(value);
  const match = validated.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)!;
  return { contentType: imageContentTypeSchema.parse(match[1]), buffer: Buffer.from(match[2], "base64") };
}

export type ValidatedImage = {
  buffer: Buffer;
  contentType: typeof ALLOWED_IMAGE_TYPES[number];
  width: number;
  height: number;
};

function detectImageContentType(buffer: Buffer): typeof ALLOWED_IMAGE_TYPES[number] | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function validateImageBuffer(buffer: Buffer, declaredContentType: string, maxBytes = MAX_IMAGE_BYTES): Promise<ValidatedImage> {
  const declared = imageContentTypeSchema.parse(declaredContentType);
  if (!buffer.length) throw new Error("Image is empty or truncated.");
  if (buffer.byteLength > maxBytes) throw new Error(`Image must be ${Math.floor(maxBytes / 1024 / 1024) || 1} MB or smaller.`);

  const detected = detectImageContentType(buffer);
  if (!detected || detected !== declared) throw new Error("Image contents do not match the selected file type.");

  let metadata: Metadata;
  try {
    const image = sharp(buffer, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS });
    metadata = await image.metadata();
    await image
      .clone()
      .timeout({ seconds: IMAGE_PROCESSING_TIMEOUT_SECONDS })
      .resize({ width: 1, height: 1, fit: "inside", withoutEnlargement: true })
      .toBuffer();
  } catch {
    throw new Error("Image is malformed, truncated, or too complex to process safely.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("Image dimensions are too large.");
  }
  if (metadata.pages && metadata.pages > 1) throw new Error("Animated or multi-page images are not supported.");

  return { buffer, contentType: detected, width, height };
}

export async function validateImageDataUrl(value: string, maxBytes = MAX_IMAGE_BYTES) {
  const parsed = parseImageDataUrl(value);
  return validateImageBuffer(parsed.buffer, parsed.contentType, maxBytes);
}
