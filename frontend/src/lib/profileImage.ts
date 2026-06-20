const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
const TARGET_BYTES = 150 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function dataUrlBytes(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] ?? "";
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("This photo format could not be read. Try a JPEG, PNG, or WebP photo."));
    };
    image.src = objectUrl;
  });
}

function renderSquare(image: HTMLImageElement, size: number, mimeType: "image/webp" | "image/jpeg", quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the profile photo.");

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL(mimeType, quality);
}

export async function compressProfileImage(file: File) {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("Choose a photo smaller than 25 MB.");
  const type = file.type.toLowerCase();
  if (type && !supportedTypes.has(type)) throw new Error("Use a JPEG, PNG, WebP, or iPhone HEIC photo.");

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("This photo has no readable dimensions.");

  let bestDataUrl = "";
  for (const size of [512, 448, 384]) {
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      let dataUrl = renderSquare(image, size, "image/webp", quality);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = renderSquare(image, size, "image/jpeg", quality);
      bestDataUrl = dataUrl;
      if (dataUrlBytes(dataUrl) <= TARGET_BYTES) {
        return { dataUrl, originalBytes: file.size, compressedBytes: dataUrlBytes(dataUrl), size };
      }
    }
  }

  return { dataUrl: bestDataUrl, originalBytes: file.size, compressedBytes: dataUrlBytes(bestDataUrl), size: 384 };
}

