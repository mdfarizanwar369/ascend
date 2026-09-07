"use client";

import Link from "next/link";
import { RoleGate } from "@/components/RoleGate";
import { ascendCoachV1Enabled } from "@/lib/ascendCoachFlag";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function AscendCoachGate({ children, hideWhenDenied = false }: { children: React.ReactNode; hideWhenDenied?: boolean }) {
  const { t } = useI18n();
  if (!ascendCoachV1Enabled()) {
    if (hideWhenDenied) return null;
    return (
      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <h1 className="text-xl font-semibold">{t("access.coachUnavailableTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{t("access.coachUnavailableMessage")}</p>
        <Link href="/dashboard" className="mt-4 flex h-12 items-center justify-center rounded-lg bg-lime font-semibold text-ink">
          {t("access.backToDashboard")}
        </Link>
      </section>
    );
  }

  return (
    <RoleGate
      allowedRoles={["trainer"]}
      allowPlatformOwner
      hideWhenDenied={hideWhenDenied}
      fallbackTitleKey="access.trainerOrOwnerOnly"
      fallbackMessageKey="access.cannotOpenCoach"
      requiredPlan="trainer_pro"
      planFeatureKey="common.ascendCoach"
    >
      {children}
    </RoleGate>
  );
}
