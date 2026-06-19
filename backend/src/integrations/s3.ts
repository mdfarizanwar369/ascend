import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { imageContentTypeSchema, parseImageDataUrl } from "../utils/images";

const s3 = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: Boolean(env.AWS_S3_ENDPOINT)
});

export async function createUploadUrl(key: string, contentType: string) {
  if (!env.AWS_S3_BUCKET) {
    return { uploadUrl: "", key, storageConfigured: false };
  }

  const safeContentType = imageContentTypeSchema.parse(contentType);
  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: safeContentType
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

  const image = parseImageDataUrl(imageDataUrl);

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: image.contentType,
    Body: image.buffer
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

export async function deleteStoredObjects(keys: Array<string | null | undefined>) {
  const uniqueKeys = Array.from(new Set(keys.filter((key): key is string => Boolean(key))));
  if (!env.AWS_S3_BUCKET || !uniqueKeys.length) return;

  for (let index = 0; index < uniqueKeys.length; index += 1000) {
    await s3.send(new DeleteObjectsCommand({
      Bucket: env.AWS_S3_BUCKET,
      Delete: { Objects: uniqueKeys.slice(index, index + 1000).map((Key) => ({ Key })), Quiet: true }
    }));
  }
}
