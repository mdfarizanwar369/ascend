import { BadgeCheck } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/login" />
          <BrandMark />
          <div>
            <p className="text-lg font-semibold">Ascend setup</p>
            <p className="text-xs text-zinc-400">Goal, referral, and accountability profile</p>
          </div>
        </header>

        <section className="mt-4 rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 text-lime" size={20} />
            <p className="text-sm leading-6 text-zinc-300">
              Referral codes connect every subscription to the right gym and trainer revenue dashboard.
            </p>
          </div>
        </section>

        <OnboardingForm />
      </div>
    </main>
  );
}
