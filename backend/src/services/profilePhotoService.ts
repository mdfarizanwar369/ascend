import { createReadUrl } from "../integrations/s3";

export async function withProfilePhotoUrl<T extends { profile_photo_s3_key?: string | null }>(row: T) {
  const { profile_photo_s3_key: key, ...safeRow } = row;
  return {
    ...safeRow,
    profile_photo_url: await createReadUrl(key)
  };
}

export function withProfilePhotoUrls<T extends { profile_photo_s3_key?: string | null }>(rows: T[]) {
  return Promise.all(rows.map(withProfilePhotoUrl));
}

