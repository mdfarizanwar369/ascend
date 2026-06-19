import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

