import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const s3 = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: Boolean(env.AWS_S3_ENDPOINT)
});

export async function createUploadUrl(key: string, contentType: string) {
  if (!env.AWS_S3_BUCKET) {
    return { uploadUrl: "", key, storageConfigured: false };
  }

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType
  });

  return {
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: 300 }),
    key,
    storageConfigured: true
  };
}

export async function uploadDataUrl(key: string, imageDataUrl: string) {
  if (!env.AWS_S3_BUCKET) {
    return { key, storageConfigured: false };
  }

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data.");
  }

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: match[1],
    Body: Buffer.from(match[2], "base64")
  });

  await s3.send(command);
  return { key, storageConfigured: true };
}

export async function createReadUrl(key?: string | null) {
  if (!env.AWS_S3_BUCKET || !key) return null;

  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key
  });

  return getSignedUrl(s3, command, { expiresIn: 900 });
}
