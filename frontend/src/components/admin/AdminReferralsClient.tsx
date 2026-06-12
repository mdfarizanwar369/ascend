"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, QrCode, TrendingUp } from "lucide-react";
import { createAdminReferral, getAdminReferrals, getAdminTrainers } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass } from "@/components/Field";

type Referral = Awaited<ReturnType<typeof getAdminReferrals>>["referrals"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];

const selectClass = `${inputClass} appearance-none`;

function money(cents: string | number) {
  return `RM ${(Number(cents) / 100).toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function trainerCode(name: string) {
  return `TRAINER-${name.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "NEW"}`;
}

function ReferralCard({ item, onCopy }: { item: Referral; onCopy: (code: string) => void }) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-lime">{item.code}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {item.type === "trainer" ? item.trainer_name ?? "Unknown trainer" : item.gym_name ?? "Unknown gym"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(item.code)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-ink"
          aria-label={`Copy ${item.code}`}
        >
          <Copy size={17} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-ink p-3">
          <QrCode className="text-calm" size={18} />
          <p className="mt-2 text-lg font-semibold">{item.referred_users}</p>
          <p className="text-xs text-zinc-400">Referred users</p>
        </div>
        <div className="rounded-lg bg-ink p-3">
          <TrendingUp className="text-amber" size={18} />
          <p className="mt-2 text-lg font-semibold">{money(item.active_revenue_cents)}</p>
          <p className="text-xs text-zinc-400">Active revenue</p>
        </div>
      </div>
    </article>
  );
}

export function AdminReferralsClient() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [trainers, setTrainers] = useState<AdminTrainer[]>([]);
  const [status, setStatus] = useState("Loading referral codes...");
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const [referralResponse, trainerResponse] = await Promise.all([getAdminReferrals(), getAdminTrainers()]);
    setReferrals(Array.isArray(referralResponse.referrals) ? referralResponse.referrals : []);
    setTrainers(Array.isArray(trainerResponse.trainers) ? trainerResponse.trainers : []);
    setStatus("");
  }

  useEffect(() => {
    let isMounted = true;

    load().catch(() => {
      if (isMounted) setStatus("Could not load referrals. Make sure this login has owner/admin access.");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function copyCode(code: string) {
    await navigator.clipboard?.writeText(code);
    setStatus(`${code} copied.`);
  }

  const gymReferrals = useMemo(() => referrals.filter((referral) => referral.type === "gym"), [referrals]);
  const trainerReferrals = useMemo(() => referrals.filter((referral) => referral.type === "trainer"), [referrals]);
  const activeTrainers = useMemo(() => trainers.filter((trainer) => trainer.status === "active"), [trainers]);
  const gymRevenue = gymReferrals.reduce((total, item) => total + Number(item.active_revenue_cents), 0);
  const trainerRevenue = trainerReferrals.reduce((total, item) => total + Number(item.active_revenue_cents), 0);
  const selectedTrainer = activeTrainers.find((trainer) => trainer.id === selectedTrainerId);

  function chooseTrainer(trainerId: string) {
    const trainer = activeTrainers.find((item) => item.id === trainerId);
    setSelectedTrainerId(trainerId);
    setNewCode(trainer ? trainerCode(trainer.full_name) : "");
  }

  async function createTrainerCode() {
    if (!selectedTrainer || !newCode.trim()) {
      setStatus("Choose a trainer and enter a code first.");
      return;
    }

    setIsSaving(true);
    setStatus("");

    try {
      await createAdminReferral({
        code: newCode.trim().toUpperCase(),
        type: "trainer",
        trainerId: selectedTrainer.id
      });
      await load();
      setStatus(`${newCode.trim().toUpperCase()} is ready for ${selectedTrainer.full_name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create trainer referral code.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="mt-3 flex items-start gap-3">
        <BackButton fallbackHref="/admin" />
        <div>
          <p className="text-sm text-zinc-400">Referral attribution</p>
          <h1 className="mt-1 text-2xl font-semibold">Gym and trainer codes</h1>
        </div>
      </section>

      {status ? <p className="mt-4 rounded-lg border border-line bg-surface p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Gym revenue</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{money(gymRevenue)}</p>
          <p className="mt-1 text-xs text-zinc-400">{gymReferrals.length} codes</p>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-xs uppercase text-zinc-400">Trainer revenue</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{money(trainerRevenue)}</p>
          <p className="mt-1 text-xs text-zinc-400">{trainerReferrals.length} codes</p>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-lime text-ink">
            <Plus size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-lime">Create trainer code</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-300">Pick an active trainer, adjust the code if needed, then share it with clients.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Trainer">
            <select className={selectClass} value={selectedTrainerId} onChange={(event) => chooseTrainer(event.target.value)}>
              <option value="">Choose trainer</option>
              {activeTrainers.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.full_name} / {trainer.gym_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Referral code">
            <input
              className={inputClass}
              value={newCode}
              placeholder="TRAINER-NAME"
              onChange={(event) => setNewCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
            />
          </Field>
          <button
            type="button"
            disabled={isSaving || !selectedTrainerId || !newCode.trim()}
            onClick={createTrainerCode}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
          >
            <Plus className="mr-2" size={18} />
            {isSaving ? "Creating..." : "Create trainer code"}
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold">Gym referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when the gym itself brings in a member. Revenue is credited to the gym.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {gymReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!gymReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No gym referral codes found.</p> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div>
          <h2 className="text-base font-semibold">Trainer referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when a trainer brings in a member. Revenue is credited to that trainer.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {trainerReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!trainerReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm text-zinc-400">No trainer referral codes found.</p> : null}
        </div>
      </section>
    </>
  );
}
