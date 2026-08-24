import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const imageContentTypeSchema = z.enum(ALLOWED_IMAGE_TYPES);

function matchesImageSignature(contentType: typeof ALLOWED_IMAGE_TYPES[number], buffer: Buffer) {
  if (contentType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
}

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
    return;
  }

  const contentType = match[1] as typeof ALLOWED_IMAGE_TYPES[number];
  const buffer = Buffer.from(match[2], "base64");
  if (!matchesImageSignature(contentType, buffer)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Image contents do not match the selected file type." });
  }
});

export function parseImageDataUrl(value: string) {
  const validated = imageDataUrlSchema.parse(value);
  const match = validated.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)!;
  return { contentType: imageContentTypeSchema.parse(match[1]), buffer: Buffer.from(match[2], "base64") };
}
