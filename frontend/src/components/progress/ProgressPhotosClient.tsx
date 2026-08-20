"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, Expand, ImagePlus, ShieldCheck, Trash2, X } from "lucide-react";
import { deleteProgressPhoto, getProgressPhotos, saveProgressPhoto, uploadProgressPhotoDataUrl } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { rememberDashboardAction } from "@/lib/dataSync";
import { AscendStoriesLauncher } from "@/components/progress/AscendStoriesLauncher";
import { ascendStoriesEnabled } from "@/lib/ascendStoriesFlag";

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

function resizeImageToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const maxSize = 900;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not prepare image."));
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image."));
    };

    image.src = objectUrl;
  });
}

export function ProgressPhotosClient() {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoType, setPhotoType] = useState<PhotoType>("front");
  const [comparisonType, setComparisonType] = useState<PhotoType>("front");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<ProgressPhoto | null>(null);
  const [status, setStatus] = useState("Add a clear progress photo so your trainer can compare changes over time.");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const saveLockRef = useRef(false);

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
  const comparisonPhotos = useMemo(
    () => photos.filter((photo) => photo.photo_type === comparisonType && photo.image_url).sort((left, right) => new Date(left.logged_at).getTime() - new Date(right.logged_at).getTime()),
    [comparisonType, photos]
  );
  const firstComparisonPhoto = comparisonPhotos[0] ?? null;
  const selectedComparisonPhoto = comparisonPhotos.find((photo) => photo.id === selectedPhotoId) ?? comparisonPhotos.at(-1) ?? null;

  useEffect(() => {
    setSelectedPhotoId(comparisonPhotos.at(-1)?.id ?? null);
  }, [comparisonPhotos]);

  useEffect(() => {
    if (!photos.length || photos.some((photo) => photo.photo_type === comparisonType && photo.image_url)) return;
    const firstAvailable = photoTypes.find((type) => photos.some((photo) => photo.photo_type === type.value && photo.image_url));
    if (firstAvailable) setComparisonType(firstAvailable.value);
  }, [comparisonType, photos]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStatus("Photo selected. Choose the angle, then save.");
  }

  async function handleSave() {
    if (!selectedFile) return;
    if (saveLockRef.current) return;
    saveLockRef.current = true;

    setIsSaving(true);
    setStatus("Saving progress photo...");

    try {
      const imageDataUrl = await resizeImageToDataUrl(selectedFile);
      const upload = await uploadProgressPhotoDataUrl(imageDataUrl);
      if (upload.storageConfigured === false) throw new Error("Photo storage is not configured yet.");
      const imageS3Key = upload.key;
      const saved = await saveProgressPhoto({ imageS3Key, photoType });
      setPhotos((current) => [
        { ...saved.progressPhoto, photo_type: photoType, image_url: previewUrl },
        ...current.filter((photo) => photo.id !== saved.progressPhoto.id)
      ]);
      loadPhotos().catch(() => undefined);
      setSelectedFile(null);
      setPreviewUrl(null);
      setStatus("Progress photo saved.");
      rememberDashboardAction("progress_photo");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save progress photo. Please try again.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  async function removePhoto(photo: ProgressPhoto) {
    if (!window.confirm("Permanently remove this progress photo? This cannot be undone.")) return;
    setDeletingId(photo.id);
    try {
      await deleteProgressPhoto(photo.id);
      setPhotos((current) => current.filter((entry) => entry.id !== photo.id));
      if (fullscreenPhoto?.id === photo.id) setFullscreenPhoto(null);
      setStatus("Progress photo removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove that progress photo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/dashboard" disabled={isSaving} />
          <div>
            <p className="text-sm text-zinc-400">Progress photos</p>
            <h1 className="text-2xl font-semibold">Track visible change</h1>
          </div>
        </header>

        {photos.length ? (
          <section className="ascend-surface mt-3 overflow-hidden p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-300">Your visual progress</p>
                <h2 className="mt-1 text-xl font-semibold">Then and now</h2>
              </div>
              <span className="rounded-full border border-line bg-ink px-3 py-1 text-xs text-zinc-400">{photos.length} saved</span>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Choose comparison angle">
              {photoTypes.map((type) => {
                const available = photos.some((photo) => photo.photo_type === type.value && photo.image_url);
                return (
                  <button
                    key={type.value}
                    type="button"
                    disabled={!available}
                    onClick={() => setComparisonType(type.value)}
                    className={`ascend-pressable h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${comparisonType === type.value ? "border-lime bg-lime text-ink" : "border-line bg-ink text-zinc-300"} disabled:opacity-35`}
                  >
                    {type.label}
                  </button>
                );
              })}
            </div>

            {firstComparisonPhoto && selectedComparisonPhoto ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {[{ label: "Started", photo: firstComparisonPhoto }, { label: "Latest", photo: selectedComparisonPhoto }].map(({ label, photo }) => (
                  <button key={`${label}-${photo.id}`} type="button" onClick={() => setFullscreenPhoto(photo)} className="ascend-pressable relative overflow-hidden rounded-xl border border-line bg-ink text-left">
                    <div className="aspect-[3/4] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.image_url ?? ""} alt={`${label} ${formatPhotoType(photo.photo_type)} progress`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/75 to-transparent p-3 pt-10">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-lime">{label}</p>
                      <p className="mt-1 text-xs text-zinc-300">{new Date(photo.logged_at).toLocaleDateString()}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="ascend-inset mt-4 p-4 text-sm leading-6 text-zinc-400">Add another {formatPhotoType(comparisonType).toLowerCase()} photo to unlock a clear comparison.</p>
            )}

            {comparisonPhotos.length > 1 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span>{new Date(comparisonPhotos[0].logged_at).toLocaleDateString()}</span>
                  <span>Choose a check-in</span>
                  <span>{new Date(comparisonPhotos.at(-1)!.logged_at).toLocaleDateString()}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={comparisonPhotos.length - 1}
                  value={Math.max(0, comparisonPhotos.findIndex((photo) => photo.id === selectedComparisonPhoto?.id))}
                  onChange={(event) => setSelectedPhotoId(comparisonPhotos[Number(event.target.value)]?.id ?? null)}
                  className="mt-3 h-11 w-full accent-lime"
                  aria-label="Choose progress photo date"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {ascendStoriesEnabled() ? <AscendStoriesLauncher photos={photos} /> : null}

        <section className="mt-4 grid aspect-[4/5] place-items-center overflow-hidden rounded-2xl border border-line bg-surface">
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

        <section className="ascend-surface mt-4 p-4">
          <p className="text-sm font-semibold">Photo angle</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {photoTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setPhotoType(type.value)}
                className={`ascend-pressable h-11 rounded-xl border text-sm font-medium ${
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
            className="ascend-pressable mt-4 flex h-12 w-full items-center justify-center rounded-xl bg-lime font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="mr-2" size={18} />
            {isSaving ? "Saving..." : "Save progress photo"}
          </button>
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Latest by angle</h2>
            <p className="text-sm text-zinc-400">{photos.length} saved</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {photoTypes.slice(0, 3).map((type) => {
              const photo = latestByType.get(type.value);
              return (
                <button key={type.value} type="button" disabled={!photo} onClick={() => photo && setFullscreenPhoto(photo)} className="ascend-pressable overflow-hidden rounded-xl border border-line bg-surface text-left disabled:cursor-default">
                  <div className="grid aspect-[3/4] place-items-center bg-ink">
                    {photo?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.image_url} alt={`${type.label} progress`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <Camera className="text-zinc-600" size={24} />
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium">{type.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{photo ? new Date(photo.logged_at).toLocaleDateString() : "Not added yet"}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ascend-surface mt-4 p-4">
          <h2 className="text-base font-semibold">Recent photos</h2>
          <div className="mt-3 space-y-2">
            {photos.slice(0, 8).map((photo) => (
              <div key={photo.id} className="flex items-center gap-2 rounded-xl bg-ink p-2">
                <button type="button" onClick={() => setFullscreenPhoto(photo)} className="ascend-pressable flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left">
                  {photo.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.image_url} alt={formatPhotoType(photo.photo_type)} className="h-14 w-14 rounded-lg object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="grid h-14 w-14 place-items-center rounded-lg bg-surface">
                      <Camera className="text-zinc-500" size={18} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatPhotoType(photo.photo_type)}</p>
                    <p className="mt-1 truncate text-xs text-zinc-400">{new Date(photo.logged_at).toLocaleString()}</p>
                  </div>
                  <Expand className="ml-auto shrink-0 text-zinc-500" size={18} />
                </button>
                <button type="button" onClick={() => removePhoto(photo)} disabled={deletingId === photo.id} className="ascend-pressable grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50" aria-label={`Remove ${formatPhotoType(photo.photo_type)} progress photo`}>
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {!photos.length ? <p className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-400">Your first progress photo will appear here. Small visual wins become easier to notice over time.</p> : null}
          </div>
        </section>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-calm/25 bg-calm/8 p-4 text-sm leading-6 text-zinc-300">
          <ShieldCheck className="mt-0.5 shrink-0 text-calm" size={19} />
          <p>Your progress photos are private to your Ascend account and your assigned coach when you have one.</p>
        </div>
      </div>

      {fullscreenPhoto?.image_url ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-3" role="dialog" aria-modal="true" aria-label="Progress photo viewer">
          <button type="button" onClick={() => setFullscreenPhoto(null)} className="ascend-pressable absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/70 text-white" aria-label="Close photo viewer"><X size={22} /></button>
          <button type="button" onClick={() => {
            const index = photos.findIndex((photo) => photo.id === fullscreenPhoto.id);
            const previous = photos[index + 1];
            if (previous) setFullscreenPhoto(previous);
          }} className="ascend-pressable absolute left-3 grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white disabled:opacity-30" disabled={photos.findIndex((photo) => photo.id === fullscreenPhoto.id) >= photos.length - 1} aria-label="Previous photo"><ChevronLeft size={24} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fullscreenPhoto.image_url} alt={`${formatPhotoType(fullscreenPhoto.photo_type)} progress from ${new Date(fullscreenPhoto.logged_at).toLocaleDateString()}`} className="max-h-[82vh] max-w-full rounded-xl object-contain" />
          <button type="button" onClick={() => {
            const index = photos.findIndex((photo) => photo.id === fullscreenPhoto.id);
            const next = photos[index - 1];
            if (next) setFullscreenPhoto(next);
          }} className="ascend-pressable absolute right-3 grid h-12 w-12 place-items-center rounded-full bg-black/70 text-white disabled:opacity-30" disabled={photos.findIndex((photo) => photo.id === fullscreenPhoto.id) <= 0} aria-label="Next photo"><ChevronRight size={24} /></button>
          <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-4 py-2 text-center text-sm text-white">
            {formatPhotoType(fullscreenPhoto.photo_type)} · {new Date(fullscreenPhoto.logged_at).toLocaleDateString()}
          </div>
        </div>
      ) : null}
    </main>
  );
}
