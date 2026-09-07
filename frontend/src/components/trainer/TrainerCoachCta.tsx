"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function TrainerCoachCta() {
  const { t } = useI18n();

  return (
    <Link href="/trainer/clients" className="ascend-pressable mt-4 flex min-h-16 items-center gap-3 rounded-2xl border border-lime/35 bg-lime/10 p-4 shadow-soft">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink">
        <Sparkles size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-white">{t("trainer.openCoach")}</span>
        <span className="mt-1 block text-sm text-zinc-400">{t("trainer.openCoachDetail")}</span>
      </span>
      <ArrowRight className="shrink-0 text-lime" size={20} />
    </Link>
  );
}
