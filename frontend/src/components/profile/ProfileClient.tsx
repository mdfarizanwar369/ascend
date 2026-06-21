"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Check, Trash2 } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { InstallAscendButton } from "@/components/InstallAscendButton";
import { getMe, getMySubscription, removeProfilePhoto, saveProfilePhoto } from "@/lib/ascendApi";
import { compressProfileImage } from "@/lib/profileImage";
import { usablePlan } from "@/lib/subscriptionPlan";

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ProfileClient() {
  const [user, setUser] = useState<Awaited<ReturnType<typeof getMe>>["user"] | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [plan, setPlan] = useState<"free" | "premium" | "trainer_pro">("free");
  const [preview, setPreview] = useState("");
  const [compressed, setCompressed] = useState("");
  const [compressionLabel, setCompressionLabel] = useState("");
  const [status, setStatus] = useState("Loading profile...");
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getMe(), getMySubscription()])
      .then(([me, subscription]) => {
        if (!mounted) return;
        setUser(me.user);
        setRoles(me.roles);
        setPlan(usablePlan(subscription.subscription.plan, subscription.subscription.status, subscription.subscription.current_period_end));
        setStatus("");
      })
      .catch((error) => mounted && setStatus(error instanceof Error ? error.message : "Could not load your profile."));
    return () => { mounted = false; };
  }, []);

  const canUpload = roles.some((role) => role === "owner" || role === "admin") || plan === "premium" || plan === "trainer_pro";
  const backHref = roles.some((role) => role === "owner" || role === "admin") ? "/admin" : roles.includes("trainer") ? "/trainer" : "/dashboard";
  const shownPhoto = preview || user?.profile_photo_url || null;

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsWorking(true);
    setStatus("Preparing a small profile photo...");
    try {
      const result = await compressProfileImage(file);
      setCompressed(result.dataUrl);
      setPreview(result.dataUrl);
      setCompressionLabel(`${formatBytes(result.originalBytes)} reduced to ${formatBytes(result.compressedBytes)}`);
      setStatus("Photo prepared. Save it when you are happy.");
    } catch (error) {
      setCompressed("");
      setPreview("");
      setCompressionLabel("");
      setStatus(error instanceof Error ? error.message : "This photo could not be prepared.");
    } finally {
      setIsWorking(false);
    }
  }

  async function save() {
    if (!compressed || isWorking) return;
    setIsWorking(true);
    setStatus("Saving profile photo...");
    try {
      const response = await saveProfilePhoto(compressed);
      setUser((current) => current ? { ...current, profile_photo_url: response.profilePhotoUrl } : current);
      setCompressed("");
      setPreview("");
      setStatus("Profile photo saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile photo could not be saved.");
    } finally {
      setIsWorking(false);
    }
  }

  async function remove() {
    if (isWorking) return;
    setIsWorking(true);
    setStatus("Removing profile photo...");
    try {
      await removeProfilePhoto();
      setUser((current) => current ? { ...current, profile_photo_url: null } : current);
      setCompressed("");
      setPreview("");
      setCompressionLabel("");
      setStatus("Profile photo removed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Profile photo could not be removed.");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref={backHref} />
          <div><p className="text-sm text-zinc-400">Account</p><h1 className="text-2xl font-semibold">Profile & settings</h1></div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-5 text-center">
          <div className="flex justify-center"><ProfileAvatar src={shownPhoto} name={user?.full_name} size="lg" /></div>
          <h2 className="mt-4 text-lg font-semibold">{user?.full_name || "Ascend member"}</h2>
          <p className="mt-1 text-sm text-zinc-400">{user?.email}</p>

          {canUpload ? (
            <>
              <label className={`mt-5 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-ink font-semibold ${isWorking ? "pointer-events-none opacity-60" : ""}`}>
                <Camera size={19} /> Choose photo
                <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={selectPhoto} className="sr-only" disabled={isWorking} />
              </label>
              {compressionLabel ? <p className="mt-3 text-xs font-medium text-lime">{compressionLabel}</p> : null}
              {compressed ? (
                <button type="button" onClick={save} disabled={isWorking} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lime font-semibold text-ink disabled:opacity-60">
                  <Check size={19} /> {isWorking ? "Saving..." : "Save photo"}
                </button>
              ) : null}
              {user?.profile_photo_url ? (
                <button type="button" onClick={remove} disabled={isWorking} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-zinc-300 disabled:opacity-60">
                  <Trash2 size={17} /> Remove photo
                </button>
              ) : null}
              <p className="mt-4 text-xs leading-5 text-zinc-500">Ascend crops the photo square and compresses it before upload. The original file is not stored.</p>
            </>
          ) : (
            <div className="mt-5 rounded-lg border border-calm/40 bg-calm/10 p-4 text-left">
              <p className="text-sm font-semibold text-calm">Profile photos are available with Premium.</p>
              <Link href="/subscription" className="mt-3 flex h-11 items-center justify-center rounded-lg bg-lime font-semibold text-ink">View plans</Link>
            </div>
          )}
        </section>
        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-semibold">App settings</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Install Ascend on this device for faster access and a full-screen app experience.</p>
          <div className="mt-4"><InstallAscendButton /></div>
        </section>
        {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}
      </div>
    </main>
  );
}
