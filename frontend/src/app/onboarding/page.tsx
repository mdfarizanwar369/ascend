import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { ProgressiveClientOnboarding } from "@/components/onboarding/ProgressiveClientOnboarding";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { getOnboardingVersion } from "@/lib/onboardingVersion";

export default function OnboardingPage() {
  const onboardingVersion = getOnboardingVersion();
  const isProgressive = onboardingVersion === "v2";

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/login" />
          <BrandMark />
          <div>
            <p className="text-lg font-semibold">{isProgressive ? "Welcome to Ascend" : "Ascend setup"}</p>
            <p className="text-xs text-zinc-400">{isProgressive ? "Start simple, complete details later" : "Goal, support, and daily targets"}</p>
          </div>
        </header>

        {!isProgressive ? (
          <section className="mt-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 text-lime" size={20} />
              <p className="text-sm leading-6 text-zinc-300">
                Referral codes connect you to the right gym or trainer. You can skip this if you do not have one yet.
              </p>
            </div>
          </section>
        ) : null}

        {isProgressive ? (
          <Suspense fallback={<div className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-zinc-300">Loading setup...</div>}>
            <ProgressiveClientOnboarding />
          </Suspense>
        ) : <OnboardingForm />}
        <PublicFooter compact />
      </div>
    </main>
  );
}
