"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Droplets } from "lucide-react";
import { getWaterLogs, saveWaterLog } from "@/lib/ascendApi";
import { DelightBadge } from "@/components/Delight";
import { localDateKey } from "@/lib/date";
import { rememberDashboardRecord } from "@/lib/dataSync";
import { markInstallEligible } from "@/lib/installAscend";
import { MetricPulse } from "@/components/ExperienceVisuals";
import { TrackingHero, TrackingPageHeader, TrackingStatus } from "@/components/tracking/TrackingVisuals";

const quickAmounts = [250, 500, 750, 1000];
const dailyTargetMl = 2500;

export function WaterLogClient() {
  const [todayMl, setTodayMl] = useState(0);
  const [status, setStatus] = useState("Loading today's water...");
  const [isSaving, setIsSaving] = useState(false);
  const saveLockRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const logs = await getWaterLogs();
        if (!isMounted) return;

        const today = localDateKey();
        const total = logs.waterLogs
          .filter((log) => localDateKey(log.logged_at) === today)
          .reduce((sum, log) => sum + log.amount_ml, 0);

        setTodayMl(total);
        setStatus("");
      } catch {
        if (isMounted) setStatus("Please log in again if water tracking does not load.");
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const progress = useMemo(() => Math.min(100, Math.round((todayMl / dailyTargetMl) * 100)), [todayMl]);

  async function addWater(amountMl: number) {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSaving(true);
    setStatus(`Saving ${amountMl}ml...`);

    try {
      const saved = await saveWaterLog({ amountMl });
      rememberDashboardRecord("water", saved.waterLog);
      setTodayMl((current) => current + amountMl);
      setStatus(`${amountMl}ml saved to Ascend.`);
      markInstallEligible("first_action");
    } catch {
      setStatus("Could not save water. Please make sure you are logged in.");
    } finally {
      saveLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <main className="ascend-page px-4 py-3 text-white sm:py-5">
      <div className="ascend-member-frame">
        <TrackingPageHeader eyebrow="Daily tracking" title="Water" disabled={isSaving} />

        <TrackingHero icon={Droplets} label="Hydration today" value={<MetricPulse pulseKey={todayMl}>{(todayMl / 1000).toFixed(1)}L</MetricPulse>} detail="2.5L daily guide" progress={progress} tone="teal">
          <DelightBadge tone={progress >= 100 ? "lime" : "teal"}>{progress >= 100 ? "Hydration goal complete" : "Every glass moves you forward"}</DelightBadge>
        </TrackingHero>

        <section className="ascend-surface mt-4 p-4">
          <p className="text-base font-semibold">Add water</p>
          <p className="mt-1 text-sm text-zinc-400">Choose the amount you just finished.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                disabled={isSaving}
                onClick={() => addWater(amount)}
                className="ascend-pressable ascend-inset h-16 text-lg font-semibold text-white hover:border-calm/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                +{amount >= 1000 ? `${amount / 1000}L` : `${amount}ml`}
              </button>
            ))}
          </div>
        </section>

        <TrackingStatus message={status} success={status.includes("saved")} />
      </div>
    </main>
  );
}
