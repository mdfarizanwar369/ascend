import { Camera, ImagePlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function ProgressPage() {
  return (
    <AppShell active="client">
      <section className="mt-3">
        <p className="text-sm text-zinc-400">Progress photos</p>
        <h1 className="mt-1 text-2xl font-semibold">Monthly comparison</h1>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3">
        {["Front", "Side", "Back"].map((angle) => (
          <div key={angle} className="grid aspect-[3/4] place-items-center rounded-lg border border-line bg-surface">
            <div className="text-center">
              <Camera className="mx-auto text-zinc-500" size={24} />
              <p className="mt-2 text-xs text-zinc-400">{angle}</p>
            </div>
          </div>
        ))}
      </section>

      <button className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink">
        <ImagePlus className="mr-2" size={19} />
        Add progress photo
      </button>
    </AppShell>
  );
}

