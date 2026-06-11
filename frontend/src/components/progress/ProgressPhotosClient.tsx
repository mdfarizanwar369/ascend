"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, ImagePlus } from "lucide-react";
import { getProgressPhotos, requestProgressUploadUrl, saveProgressPhoto } from "@/lib/ascendApi";

type ProgressPhoto = Awaited<ReturnType<typeof getProgressPhotos>>["progressPhotos"][number];
type PhotoType = ProgressPhoto["photo_type"];

const photoTypes: Array<{ label: string; value: PhotoType }> = [
  { label: "Front", value: "front" },
  { label: "Side", value: "side" },
  { label: "Back", value: "back" },
  { label: "Other", value: "other" }
];

function formatPhotoType(type: string) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

async function uploadProgressPhoto(file: File) {
  const upload = await requestProgressUploadUrl(file.type || "image/jpeg");
  if (!upload.storageConfigured || !upload.uploadUrl) {
    throw new Error("Storage is not configured yet.");
  }

  const response = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "image/jpeg"
    },
    body: file
  });

  if (!response.ok) throw new Error("Photo upload failed.");
  return upload.key;
}

export function ProgressPhotosClient() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoType, setPhotoType] = useState<PhotoType>("front");
  const [status, setStatus] = useState("Add a clear progress photo so your trainer can compare changes over time.");
  const [isSaving, setIsSaving] = useState(false);

  async function loadPhotos() {
    const response = await getProgressPhotos();
    setPhotos(response.progressPhotos);
  }

  useEffect(() => {
    loadPhotos().catch(() => {
      setStatus("Log in again if your progress photos do not load.");
    });
  }, []);

  const latestByType = useMemo(() => {
    const next = new Map<PhotoType, ProgressPhoto>();
    photos.forEach((photo) => {
      if (!next.has(photo.photo_type)) next.set(photo.photo_type, photo);
    });
    return next;
  }, [photos]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus("Photo selected. Choose the angle, then save.");
  }

  async function handleSave() {
    if (!selectedFile) return;

    setIsSaving(true);
    setStatus("Saving progress photo...");

    try {
      const imageS3Key = await uploadProgressPhoto(selectedFile);
      await saveProgressPhoto({ imageS3Key, photoType });
      await loadPhotos();
      setSelectedFile(null);
      setPreviewUrl(null);
      setStatus("Progress photo saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save progress photo. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <a href="/dashboard" className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface" aria-label="Back to dashboard">
            <ArrowLeft size={19} />
          </a>
          <div>
            <p className="text-sm text-zinc-400">Progress photos</p>
            <h1 className="text-2xl font-semibold">Track visible change</h1>
          </div>
        </header>

        <section className="mt-3 grid aspect-[4/5] place-items-center overflow-hidden rounded-lg border border-line bg-surface">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected progress" className="h-full w-full object-cover" />
          ) : (
            <label className="grid h-full w-full cursor-pointer place-items-center text-center">
              <input accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
              <span>
                <Camera className="mx-auto text-lime" size={36} />
                <span className="mt-3 block text-sm font-semibold text-zinc-200">Tap to add photo</span>
                <span className="mt-1 block text-xs text-zinc-500">Front, side, back, or custom check-in.</span>
              </span>
            </label>
          )}
        </section>

        {previewUrl ? (
          <label className="mt-3 flex h-11 cursor-pointer items-center justify-center rounded-lg border border-line bg-surface text-sm font-medium">
            <ImagePlus className="mr-2" size={18} />
            Change photo
            <input accept="image/*" className="hidden" type="file" onChange={handleFileChange} />
          </label>
        ) : null}

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">Photo angle</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {photoTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setPhotoType(type.value)}
                className={`h-11 rounded-lg border text-sm font-medium ${
                  photoType === type.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{status}</p>
          <button
            type="button"
            disabled={!selectedFile || isSaving}
            onClick={handleSave}
            className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save progress photo"}
          </button>
        </section>

        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Latest by angle</h2>
            <p className="text-sm text-zinc-400">{photos.length} saved</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {photoTypes.slice(0, 3).map((type) => {
              const photo = latestByType.get(type.value);
              return (
                <article key={type.value} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <div className="grid aspect-[3/4] place-items-center bg-ink">
                    {photo?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.image_url} alt={`${type.label} progress`} className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="text-zinc-600" size={24} />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{type.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{photo ? new Date(photo.logged_at).toLocaleDateString() : "Not added yet"}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <h2 className="text-base font-semibold">Recent photos</h2>
          <div className="mt-3 space-y-2">
            {photos.slice(0, 8).map((photo) => (
              <article key={photo.id} className="flex items-center gap-3 rounded-lg bg-ink p-3">
                {photo.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.image_url} alt={formatPhotoType(photo.photo_type)} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-lg bg-surface">
                    <Camera className="text-zinc-500" size={18} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">{formatPhotoType(photo.photo_type)}</p>
                  <p className="mt-1 text-xs text-zinc-400">{new Date(photo.logged_at).toLocaleString()}</p>
                </div>
              </article>
            ))}
            {!photos.length ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No progress photos yet.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
