"use client";

import { Check, Moon, Palette, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ASCEND_APPEARANCES, applyAscendAppearance, getAscendAppearanceRevision, parseAscendAppearance, type AscendAppearance } from "@/lib/ascendAppearance";
import { ascendSiri } from "@/lib/ascendSiri";
import { getNativeCapacitorPlatform, isNativeCapacitorPlatform } from "@/lib/nativePlatform";

const legacyAvailableThemes = ASCEND_APPEARANCES.filter(option => option.id !== "ascend-club").map(option => option.id);

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [appearance, setAppearance] = useState<AscendAppearance>("classic");
  const [nativePicker, setNativePicker] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [availableThemes, setAvailableThemes] = useState<readonly AscendAppearance[]>(legacyAvailableThemes);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const current = parseAscendAppearance(document.documentElement.dataset.appearance) ?? "classic";
    setAppearance(current);
    if (!isNativeCapacitorPlatform() || getNativeCapacitorPlatform() !== "ios") return;

    const revision = getAscendAppearanceRevision();
    void ascendSiri.getWidgetTheme().then(({ theme, availableThemes: nativeAvailableThemes }) => {
      if (cancelled) return;
      const nativeTheme = parseAscendAppearance(theme);
      if (!nativeTheme) return;
      const supportedThemes = Array.isArray(nativeAvailableThemes)
        ? nativeAvailableThemes.map(parseAscendAppearance).filter((item): item is AscendAppearance => item !== null)
        : legacyAvailableThemes;
      // The device preference is shared with the widget. A stale web cache must
      // not reset it when a different page or the picker mounts.
      if (revision === getAscendAppearanceRevision()) applyAscendAppearance(nativeTheme);
      setAppearance(parseAscendAppearance(document.documentElement.dataset.appearance) ?? nativeTheme);
      setAvailableThemes(supportedThemes);
      setNativePicker(true);
    }).catch(() => { /* Older iOS builds keep the existing light/dark toggle. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const nextLegacy: AscendAppearance = appearance === "light" ? "classic" : "light";
  const Icon = nativePicker ? Palette : nextLegacy === "light" ? Sun : Moon;
  const label = nativePicker ? "Choose Ascend appearance" : nextLegacy === "light" ? "Switch to light mode" : "Switch to dark mode";

  async function select(theme: AscendAppearance) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await ascendSiri.setWidgetTheme({ theme });
      applyAscendAppearance(theme);
      setAppearance(theme);
      setOpen(false);
      trigger.current?.focus();
    } catch {
      setError("Could not update the widget. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`ascend-pressable grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line bg-surface text-zinc-100 hover:border-calm/50 ${className}`}
        aria-label={label}
        title={label}
        onClick={() => {
          if (nativePicker) { setOpen(true); return; }
          applyAscendAppearance(nextLegacy);
          setAppearance(nextLegacy);
        }}
      >
        <Icon size={19} aria-hidden="true" />
      </button>

      {nativePicker && open ? (
        <div className="ascend-theme-picker fixed inset-0 z-[100] flex items-center justify-center bg-black/75 px-4 py-5" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="ascend-theme-title" className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-ink shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-lime">Make it yours</p>
                <h2 id="ascend-theme-title" className="mt-1 text-xl font-semibold text-white">Choose your Ascend look</h2>
                <p className="mt-1 text-xs text-zinc-400">Your home screen widget will match.</p>
              </div>
              <button ref={close} type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-zinc-100" onClick={() => { setOpen(false); trigger.current?.focus(); }} aria-label="Close appearance picker"><X size={17} /></button>
            </div>
            <div className="grid max-h-[min(68dvh,620px)] grid-cols-2 gap-3 overflow-y-auto p-4">
              {ASCEND_APPEARANCES.filter(option => availableThemes.includes(option.id)).map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={saving}
                  onClick={() => { void select(option.id); }}
                  aria-pressed={appearance === option.id}
                  className={`overflow-hidden rounded-2xl border text-left transition active:scale-[0.98] ${appearance === option.id ? "border-lime ring-2 ring-lime/25" : "border-line hover:border-lime/50"}`}
                >
                  <span
                    className={`relative block h-20 bg-cover bg-center ${option.id === "classic" ? "bg-[linear-gradient(135deg,#0f161f,#17273c,#0c756b)]" : option.id === "light" ? "bg-[linear-gradient(135deg,#f4f7f9,#d8eae9,#ffffff)]" : ""}`}
                    style={option.preview ? { backgroundImage: `url(${option.preview})` } : undefined}
                  >
                    <span className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full ${appearance === option.id ? "bg-lime text-ink" : "bg-black/35 text-white"}`}>{appearance === option.id ? <Check size={14} /> : null}</span>
                  </span>
                  <span className="block bg-surface px-3 py-2.5">
                    <span className="block text-sm font-semibold text-white">{option.name}</span>
                    <span className="block text-xs text-zinc-400">{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
            {error ? <p role="alert" className="px-5 pb-4 text-sm text-rose-300">{error}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
