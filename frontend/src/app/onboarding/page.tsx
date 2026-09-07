"use client";

import { Suspense } from "react";
import { BadgeCheck } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { ProgressiveClientOnboarding } from "@/components/onboarding/ProgressiveClientOnboarding";
import { BackButton } from "@/components/BackButton";
import { BrandMark } from "@/components/BrandMark";
import { PublicFooter } from "@/components/legal/PublicFooter";
import { getOnboardingVersion } from "@/lib/onboardingVersion";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function OnboardingPage() {
  const { t } = useI18n();
  const onboardingVersion = getOnboardingVersion();
  const isProgressive = onboardingVersion === "v2";

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/login" />
          <BrandMark />
          <div>
            <p className="text-lg font-semibold">{isProgressive ? t("onboarding.welcome") : t("onboarding.setup")}</p>
            <p className="text-xs text-zinc-400">{isProgressive ? t("onboarding.simple") : t("onboarding.targets")}</p>
          </div>
        </header>

        {!isProgressive ? (
          <section className="mt-4 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 text-lime" size={20} />
              <p className="text-sm leading-6 text-zinc-300">
                {t("onboarding.referralHelp")}
              </p>
            </div>
          </section>
        ) : null}

        {isProgressive ? (
          <Suspense fallback={<div className="ascend-skeleton mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-zinc-300">{t("onboarding.preparing")}</div>}>
            <ProgressiveClientOnboarding />
          </Suspense>
        ) : <OnboardingForm />}
        <PublicFooter compact />
      </div>
    </main>
  );
}
