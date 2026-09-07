"use client";

import type { AscendCoachClientListItem } from "@ascend/shared";
import { AlertCircle, ChevronRight, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AscendHeroPanel, BusinessSigil } from "@/components/AscendVisualIdentity";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { SkeletonCardList } from "@/components/PerceivedLoading";
import { getAscendCoachClients } from "@/lib/ascendCoachApi";
import { useI18n } from "@/lib/i18n/I18nProvider";

function relativeTime(value: string | null | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  if (!value) return t("trainer.noWorkoutsYet");
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return t("trainer.lastWorkoutToday");
  if (days === 1) return t("trainer.lastWorkoutYesterday");
  return t("trainer.lastWorkoutDaysAgo", { days });
}

function goalLabel(goal: string | null | undefined, t: (key: string) => string) {
  if (goal === "fat_loss") return t("onboarding.goalFatLoss");
  if (goal === "muscle_gain") return t("onboarding.goalMuscleGain");
  if (goal === "maintenance") return t("onboarding.goalMaintenance");
  return null;
}

export function AscendCoachClientList() {
  const { t } = useI18n();
  const [clients, setClients] = useState<AscendCoachClientListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const platformOwnerMode = clients?.some((client) => client.accessMode === "platform_owner") === true;

  useEffect(() => {
    let mounted = true;
    setClients(null);
    setError(false);
    getAscendCoachClients()
      .then((result) => mounted && setClients(result.clients))
      .catch(() => mounted && setError(true));
    return () => { mounted = false; };
  }, [retry]);

  return (
    <div className="pb-4">
      <AscendHeroPanel
        eyebrow={t("common.ascendCoach")}
        title={t("trainer.clients")}
        body={platformOwnerMode ? t("trainer.platformOwnerClientList") : t("trainer.authorizedClientList")}
        tone="trainer"
        visual={<BusinessSigil status={clients ? t("trainer.activeCount", { count: clients.length }) : t("common.coach")} />}
      />

      <section className="mt-5" aria-labelledby="coach-client-list-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="ascend-eyebrow text-calm">{t("trainer.client360")}</p>
            <h2 id="coach-client-list-title" className="mt-1 text-xl font-semibold">{platformOwnerMode ? t("trainer.allActiveClients") : t("trainer.authorizedClients")}</h2>
          </div>
        </div>

        {!clients && !error ? <SkeletonCardList count={3} compact /> : null}

        {error ? (
          <div className="rounded-2xl border border-amber/35 bg-amber/10 p-5" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 shrink-0 text-amber" size={20} />
              <div>
                <h3 className="font-semibold">{t("trainer.clientListUnavailable")}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-300">{t("trainer.clientListUnavailableDetail")}</p>
              </div>
            </div>
            <button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink">
              <RefreshCw size={18} /> {t("common.tryAgain")}
            </button>
          </div>
        ) : null}

        {clients?.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <Users className="mx-auto text-calm" size={28} />
            <h3 className="mt-3 font-semibold">{t("trainer.noActiveClients")}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{t("trainer.noActiveClientsDetail")}</p>
          </div>
        ) : null}

        {clients?.length ? (
          <div className="space-y-3">
            {clients.map((client) => {
              const visibleName = client.displayName ?? t("trainer.clientProfileNotShared");
              const hasTraining = Object.prototype.hasOwnProperty.call(client, "lastWorkoutAt");
              return (
                <Link key={`${client.accessMode}:${client.clientId}`} href={`/trainer/clients/${client.clientId}/360`} className="ascend-pressable flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft hover:border-calm/45">
                  <ProfileAvatar name={client.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold text-white">{visibleName}</p>
                    <p className="mt-1 text-sm capitalize text-zinc-400">{goalLabel(client.goal, t) ?? t("trainer.goalNotShared")}</p>
                    <p className="mt-2 text-xs text-zinc-500">{hasTraining ? relativeTime(client.lastWorkoutAt, t) : t("trainer.trainingDataNotShared")}{client.accessMode === "platform_owner" ? ` · ${t("trainer.platformOwnerAccess")}` : ""}</p>
                  </div>
                  <ChevronRight className="shrink-0 text-zinc-500" size={20} aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}
