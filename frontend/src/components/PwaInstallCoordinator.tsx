"use client";

import { canAutoOfferInstall, detectInstallPlatform, InstallPlatform } from "@ascend/shared";
import { Check, ChevronRight, Download, MoreVertical, Share, Smartphone, SquarePlus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import {
  INSTALL_ELIGIBLE_EVENT,
  INSTALL_REQUEST_EVENT,
  clearAscendInstalled,
  installStorageKeys,
  isAscendInstalled,
  markAscendInstalled,
  readInstallValue
} from "@/lib/installAscend";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const BANNER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function store(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The prompt still works for the current visit when storage is restricted.
  }
}

function eligibleAppPath(pathname: string) {
  return !new Set(["/", "/login", "/launch", "/reset", "/onboarding"]).has(pathname);
}

export function PwaInstallCoordinator() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<InstallPlatform>("desktop");
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [alreadyPrompted, setAlreadyPrompted] = useState(false);
  const [postponed, setPostponed] = useState(false);
  const [bannerDismissedAt, setBannerDismissedAt] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    setPlatform(detectInstallPlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    setInstalled(isAscendInstalled());
    setEligible(Boolean(readInstallValue(installStorageKeys.eligible)));
    setAlreadyPrompted(readInstallValue(installStorageKeys.prompted) === "true");
    setPostponed(readInstallValue(installStorageKeys.postponed) === "true");
    setBannerDismissedAt(Number(readInstallValue(installStorageKeys.bannerDismissedAt) ?? 0));

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      clearAscendInstalled();
      setInstalled(false);
      setNativePrompt(event as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      markAscendInstalled();
      setInstalled(true);
      setModalOpen(false);
      setPostponed(false);
    };
    const handleEligible = () => setEligible(true);
    const handleManualRequest = () => {
      setManualOpen(true);
      setModalOpen(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(INSTALL_ELIGIBLE_EVENT, handleEligible);
    window.addEventListener(INSTALL_REQUEST_EVENT, handleManualRequest);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(INSTALL_ELIGIBLE_EVENT, handleEligible);
      window.removeEventListener(INSTALL_REQUEST_EVENT, handleManualRequest);
    };
  }, []);

  useEffect(() => {
    const canOffer = canAutoOfferInstall({ eligible, installed, alreadyPrompted, pathname });
    const platformReady = platform === "ios" || Boolean(nativePrompt);
    if (!canOffer || !platformReady) return;

    const timeout = window.setTimeout(() => {
      store(installStorageKeys.prompted, "true");
      setAlreadyPrompted(true);
      setManualOpen(false);
      setModalOpen(true);
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [alreadyPrompted, eligible, installed, nativePrompt, pathname, platform]);

  const showBanner = useMemo(() => {
    const bannerSnoozed = bannerDismissedAt > 0 && Date.now() - bannerDismissedAt < BANNER_SNOOZE_MS;
    return eligibleAppPath(pathname) && postponed && !installed && !modalOpen && !bannerSnoozed;
  }, [bannerDismissedAt, installed, modalOpen, pathname, postponed]);

  function postpone() {
    store(installStorageKeys.prompted, "true");
    store(installStorageKeys.postponed, "true");
    setAlreadyPrompted(true);
    setPostponed(true);
    setManualOpen(false);
    setModalOpen(false);
  }

  function dismissBanner() {
    const dismissedAt = Date.now();
    store(installStorageKeys.bannerDismissedAt, String(dismissedAt));
    setBannerDismissedAt(dismissedAt);
  }

  async function installNative() {
    if (!nativePrompt) return;
    await nativePrompt.prompt();
    const choice = await nativePrompt.userChoice;
    setNativePrompt(null);
    if (choice.outcome === "accepted") {
      markAscendInstalled();
      setInstalled(true);
      setModalOpen(false);
      setPostponed(false);
    } else {
      postpone();
    }
  }

  if (installed) return null;

  const nativeInstallReady = platform !== "ios" && Boolean(nativePrompt);

  return (
    <>
      {modalOpen ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-ink/95 px-4 py-[max(1.25rem,env(safe-area-inset-top))] text-white backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="install-ascend-title">
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center">
            <div className="relative overflow-hidden rounded-lg border border-calm/40 bg-surface p-5 shadow-2xl shadow-calm/10">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet via-calm to-lime" />
              <button type="button" onClick={postpone} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg border border-line bg-ink text-zinc-300" aria-label="Close install instructions">
                <X size={19} />
              </button>

              <div className="flex items-center gap-3 pr-12">
                <BrandMark size="sm" />
                <div>
                  <p className="text-sm font-semibold uppercase text-calm">Your Ascend app</p>
                  <h2 id="install-ascend-title" className="mt-1 text-3xl font-semibold">Install Ascend</h2>
                </div>
              </div>
              <p className="mt-4 text-base leading-7 text-zinc-300">Open Ascend from your home screen, use the full display, and stay signed in like a normal app.</p>

              {platform === "ios" ? (
                <div className="mt-6 space-y-3" aria-label="iPhone installation steps">
                  {[
                    { icon: Share, title: "Tap Share", detail: "Use Safari's Share button at the bottom of the screen." },
                    { icon: SquarePlus, title: "Choose Add to Home Screen", detail: "This is Safari's name for installing Ascend." },
                    { icon: Check, title: "Tap Add", detail: "Ascend will appear on your home screen." }
                  ].map((step, index) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.title} className="ascend-install-step flex items-center gap-3 rounded-lg border border-line bg-ink p-3" style={{ animationDelay: `${index * 700}ms` }}>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-calm text-ink"><Icon size={21} /></span>
                        <div className="min-w-0 flex-1"><p className="font-semibold">{step.title}</p><p className="mt-1 text-sm leading-5 text-zinc-400">{step.detail}</p></div>
                        {index < 2 ? <ChevronRight className="shrink-0 text-zinc-500" size={18} /> : null}
                      </div>
                    );
                  })}
                </div>
              ) : nativeInstallReady ? (
                <div className="mt-6 rounded-lg border border-calm/40 bg-calm/10 p-4 text-center">
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-calm text-ink"><Smartphone size={30} /></span>
                  <h3 className="mt-4 text-xl font-semibold">One tap. No app store.</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">Your browser will confirm the installation and place Ascend with your other apps.</p>
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-violet/40 bg-violet/10 p-4">
                  <div className="flex items-start gap-3"><MoreVertical className="mt-0.5 shrink-0 text-violet" size={21} /><div><h3 className="font-semibold">Install from your browser menu</h3><p className="mt-2 text-sm leading-6 text-zinc-300">Open the browser menu and choose <strong>Install Ascend</strong> or <strong>Install app</strong>.</p></div></div>
                </div>
              )}

              {nativeInstallReady ? (
                <button type="button" onClick={installNative} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-calm font-semibold text-ink">
                  <Download size={20} /> Install Ascend
                </button>
              ) : null}
              <button type="button" onClick={postpone} className="mt-3 h-11 w-full rounded-lg text-sm font-semibold text-zinc-400">
                {manualOpen ? "Close" : "Not now"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBanner ? (
        <aside className="fixed inset-x-3 bottom-24 z-[80] mx-auto max-w-md rounded-lg border border-calm/40 bg-surface p-3 text-white shadow-2xl shadow-black/40" aria-label="Install Ascend reminder">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-calm text-ink"><Download size={19} /></span>
            <button type="button" onClick={() => { setManualOpen(true); setModalOpen(true); }} className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold">Install Ascend</span>
              <span className="mt-0.5 block text-xs text-zinc-400">Use it like a normal app.</span>
            </button>
            <button type="button" onClick={dismissBanner} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400" aria-label="Dismiss install reminder"><X size={17} /></button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
