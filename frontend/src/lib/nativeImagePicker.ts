import { isNativeAndroidCapacitor } from "./nativePlatform";

type NativeImagePickerSource = "camera" | "gallery";

function inferFileExtension(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("heic") || mimeType.includes("heif")) return "heic";
  return "jpg";
}

export async function pickNativeImage(source: NativeImagePickerSource) {
  if (!isNativeAndroidCapacitor()) return null;

  const [{ Camera, CameraResultType, CameraSource }] = await Promise.all([
    import("@capacitor/camera")
  ]);

  const result = await Camera.getPhoto({
    source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
    resultType: CameraResultType.Uri,
    quality: 88,
    correctOrientation: true
  });

  if (!result.webPath) {
    return null;
  }

  const response = await fetch(result.webPath);
  if (!response.ok) {
    throw new Error(source === "camera" ? "Camera photo could not be loaded yet." : "Selected photo could not be loaded yet.");
  }

  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const extension = inferFileExtension(mimeType);
  const filename = `ascend-${source}-${Date.now()}.${extension}`;
  return new File([blob], filename, { type: mimeType, lastModified: Date.now() });
}
