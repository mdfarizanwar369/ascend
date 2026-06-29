"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, Footprints, Flame, RefreshCw, Smartphone, Unplug } from "lucide-react";
import { BackButton } from "@/components/BackButton";
import { getHealthSyncStatus, HealthSyncStatus } from "@/lib/ascendApi";
import { canUseHealthConnect, getNativeHealthConnectStatus } from "@/lib/healthConnect";
import { disconnectHealthConnectFromAscend, runHealthConnectSync } from "@/lib/healthSyncClient";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not yet synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not yet synced";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function permissionLabel(permission: string) {
  if (permission.includes("STEPS")) return "Steps";
  if (permission.includes("ACTIVE_CALORIES")) return "Active calories";
  if (permission.includes("EXERCISE")) return "Exercise sessions";
  return permission;
}

export function HealthSyncClient() {
  const [backendStatus, setBackendStatus] = useState<HealthSyncStatus | null>(null);
  const [nativeStatus, setNativeStatus] = useState<Awaited<ReturnType<typeof getNativeHealthConnectStatus>> | null>(null);
  const [status, setStatus] = useState("Loading Health Sync...");
  const [working, setWorking] = useState(false);

  const onAndroid = canUseHealthConnect();

  async function refresh() {
    const [backend, native] = await Promise.all([
      getHealthSyncStatus().then((response) => response.status),
      getNativeHealthConnectStatus()
    ]);
    setBackendStatus(backend);
    setNativeStatus(native);
    setStatus("");
  }

  useEffect(() => {
    refresh().catch((error) => setStatus(error instanceof Error ? error.message : "Could not load Health Sync."));
  }, []);

  async function connect() {
    setWorking(true);
    setStatus("Connecting Health Connect...");
    try {
      await runHealthConnectSync({ interactive: true });
      await refresh();
      setStatus("Health Connect is now syncing with Ascend.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Health Connect could not be connected.");
    } finally {
      setWorking(false);
    }
  }

  async function syncNow() {
    setWorking(true);
    setStatus("Syncing your latest activity...");
    try {
      await runHealthConnectSync({ interactive: true });
      await refresh();
      setStatus("Health data synced successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Health Sync failed.");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setStatus("Disconnecting Health Connect...");
    try {
      await disconnectHealthConnectFromAscend();
      await refresh();
      setStatus("Health Connect has been disconnected from Ascend.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not disconnect Health Connect.");
    } finally {
      setWorking(false);
    }
  }

  const summary = backendStatus?.summary ?? null;
  const permissions = useMemo(() => {
    const fromBackend = backendStatus?.permissions ?? [];
    if (fromBackend.length) return fromBackend;
    return nativeStatus?.permissionsGranted ?? [];
  }, [backendStatus?.permissions, nativeStatus?.permissionsGranted]);

  return (
    <main className="min-h-screen bg-ink px-4 py-5 text-white">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-center gap-3 py-3">
          <BackButton fallbackHref="/profile" />
          <div>
            <p className="text-sm text-zinc-400">Settings</p>
            <h1 className="text-2xl font-semibold">Health Sync</h1>
          </div>
        </header>

        <section className="mt-4 rounded-2xl border border-calm/25 bg-surface p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">Health Connect</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Connect Health Connect so Ascend can read only your steps, workouts, and active calories for smarter coaching.
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Ascend does not read sleep, heart rate, blood pressure, location, nutrition, or medical records from Health Connect.
              </p>
            </div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl border border-calm/20 bg-calm/10 text-calm">
              <Smartphone size={20} />
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-line bg-ink p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Status</p>
              <p className="mt-1 text-lg font-semibold">
                {!onAndroid
                  ? "Available in the Android app"
                  : backendStatus?.connected
                    ? "Connected"
                    : "Not connected"}
              </p>
              <p className="mt-1 text-sm text-zinc-500">Last synced: {formatDateTime(backendStatus?.lastSyncedAt ?? null)}</p>
            </div>

            <div className="rounded-2xl border border-line bg-ink p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Permissions granted</p>
              {permissions.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {permissions.map((permission) => (
                    <span key={permission} className="rounded-full border border-calm/30 bg-calm/10 px-3 py-1 text-xs font-semibold text-calm">
                      {permissionLabel(permission)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">Steps, exercise sessions, and active calories will appear here after you connect.</p>
              )}
            </div>

            <div className="rounded-2xl border border-line bg-ink p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Who can see this</p>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Your activity summary can appear on your dashboard and may be visible to your assigned trainer or authorized gym admin when you are on a coached plan.
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Disconnecting stops Ascend sync. To revoke device permission completely, open Android Health Connect settings.
              </p>
            </div>

            {summary ? (
              <div className="rounded-2xl border border-line bg-ink p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Latest synced activity</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-line bg-surface px-3 py-4">
                    <div className="flex items-center gap-2 text-calm"><Footprints size={15} /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Steps</span></div>
                    <p className="mt-2 text-xl font-semibold">{summary.todaySteps.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">7-day avg {summary.averageSteps7d.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface px-3 py-4">
                    <div className="flex items-center gap-2 text-calm"><Flame size={15} /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Active kcal</span></div>
                    <p className="mt-2 text-xl font-semibold">{summary.todayActiveCalories.toLocaleString()}</p>
                    <p className="text-xs text-zinc-500">Today</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface px-3 py-4">
                    <div className="flex items-center gap-2 text-calm"><Activity size={15} /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Workouts</span></div>
                    <p className="mt-2 text-xl font-semibold">{summary.workoutsThisWeek}</p>
                    <p className="text-xs text-zinc-500">This week</p>
                  </div>
                  <div className="rounded-2xl border border-line bg-surface px-3 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-calm">Detected today</p>
                    <p className="mt-2 text-xl font-semibold">{summary.workoutCompletedToday ? "Yes" : "No workout yet"}</p>
                    <p className="text-xs text-zinc-500">Automatic activity sync</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3">
            {onAndroid ? (
              <>
                <button
                  type="button"
                  onClick={backendStatus?.connected ? syncNow : connect}
                  disabled={working}
                  className="flex h-12 items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink disabled:opacity-60"
                >
                  <RefreshCw size={18} className={working ? "animate-spin" : ""} />
                  {working ? "Working..." : backendStatus?.connected ? "Sync Now" : "Connect Health Connect"}
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  disabled={working || !backendStatus?.connected}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-amber/35 bg-amber/10 font-semibold text-amber disabled:opacity-60"
                >
                  <Unplug size={18} />
                  Disconnect
                </button>
              </>
            ) : (
              <a
                href="https://www.getascend.fit/launch"
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-ink"
              >
                <ExternalLink size={18} />
                Open the Android app
              </a>
            )}
          </div>

          {status ? <p className="mt-4 rounded-xl border border-line bg-ink px-4 py-3 text-sm text-zinc-300">{status}</p> : null}
        </section>
      </div>
    </main>
  );
}
