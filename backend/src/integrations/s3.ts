import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const s3 = new S3Client({ region: env.AWS_REGION });

export async function createUploadUrl(key: string, contentType: string) {
  if (!env.AWS_S3_BUCKET) {
    return { uploadUrl: `http://localhost/mock-upload/${key}`, key };
  }

  const command = new PutObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
    ContentType: contentType
  });

  return {
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: 300 }),
    key
  };
}

