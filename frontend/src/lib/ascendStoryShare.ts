import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

function fileName() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `ascend-story-${timestamp}.png`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const value = String(reader.result ?? "");
      const base64 = value.includes(",") ? value.split(",")[1] : value;
      if (!base64) reject(new Error("Could not prepare the story image."));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not prepare the story image."));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, name = fileName()) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function writeNativeFile(blob: Blob, directory: Directory, path: string) {
  const result = await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory,
    recursive: true
  });
  return result.uri;
}

export async function shareAscendStory(blob: Blob, caption?: string) {
  const name = fileName();
  const text = caption?.trim() || "Still ascending.";
  if (Capacitor.isNativePlatform()) {
    const temporaryPath = "shares/ascend-story.png";
    try {
      const uri = await writeNativeFile(blob, Directory.Cache, temporaryPath);
      await Share.share({
        title: "Share Your Ascent",
        text,
        files: [uri],
        dialogTitle: "Share Your Ascent"
      });
      return "native" as const;
    } finally {
      await Filesystem.deleteFile({ path: temporaryPath, directory: Directory.Cache }).catch(() => undefined);
    }
  }

  const file = new File([blob], name, { type: "image/png" });
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
    await navigator.share({ title: "Share Your Ascent", text, files: [file] });
    return "web-share" as const;
  }

  downloadBlob(blob, name);
  return "download" as const;
}

export async function saveAscendStory(blob: Blob) {
  const name = fileName();
  if (Capacitor.isNativePlatform()) {
    await writeNativeFile(blob, Directory.Documents, `Ascend/${name}`);
    return { platform: "native" as const, location: `Documents/Ascend/${name}` };
  }

  downloadBlob(blob, name);
  return { platform: "web" as const, location: name };
}
