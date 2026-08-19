import { getProgressPhotoImageBlob } from "@/lib/ascendApi";
import type { AscendStoryContext, AscendStoryFormat, AscendStoryPhoto } from "@/lib/ascendStories";

type PhotoBlobLoader = (photoId: string) => Promise<Blob>;

export type PreparedStoryPhotos = {
  context: AscendStoryContext;
  release: () => void;
};

export async function prepareStoryPhotos(
  context: AscendStoryContext,
  format: AscendStoryFormat,
  loadPhotoBlob: PhotoBlobLoader = getProgressPhotoImageBlob
): Promise<PreparedStoryPhotos> {
  const required = format === "then-now" ? [context.firstPhoto, context.latestPhoto] : [context.latestPhoto];
  const unique = Array.from(new Map(required.map((photo) => [photo.id, photo])).values());
  const objectUrls = new Map<string, string>();

  try {
    await Promise.all(unique.map(async (photo) => {
      const blob = await loadPhotoBlob(photo.id);
      if (!blob.type.startsWith("image/") || !blob.size) throw new Error("Progress photo is unavailable.");
      objectUrls.set(photo.id, URL.createObjectURL(blob));
    }));
  } catch {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    throw new Error("Ascend could not securely load this photo. Please try again.");
  }

  const replaceUrl = (photo: AscendStoryPhoto) => {
    const url = objectUrls.get(photo.id);
    return url ? { ...photo, url } : photo;
  };
  let released = false;
  return {
    context: {
      ...context,
      firstPhoto: replaceUrl(context.firstPhoto),
      latestPhoto: replaceUrl(context.latestPhoto)
    },
    release: () => {
      if (released) return;
      released = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  };
}
