"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, QrCode, TrendingUp } from "lucide-react";
import { createAdminReferral, getAdminReferrals, getAdminTrainers } from "@/lib/ascendApi";
import { BackButton } from "@/components/BackButton";
import { Field, inputClass, selectClass } from "@/components/Field";

type Referral = Awaited<ReturnType<typeof getAdminReferrals>>["referrals"][number];
type AdminTrainer = Awaited<ReturnType<typeof getAdminTrainers>>["trainers"][number];

function money(cents: string | number, currency: string) {
  try {
    return new Intl.NumberFormat("en-MY", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(Number(cents) / 100);
  } catch {
    return `${currency} ${(Number(cents) / 100).toLocaleString("en-MY")}`;
  }
}

function trainerCode(name: string) {
  return `TRAINER-${name.split(/\s+/)[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase() || "NEW"}`;
}

function ReferralCard({ item, onCopy }: { item: Referral; onCopy: (code: string) => void }) {
  return (
    <article className="ascend-workspace-stat p-4 md:grid md:grid-cols-[minmax(0,1fr)_9rem_9rem_2.75rem] md:items-center md:gap-4">
      <div className="flex items-start justify-between gap-3 md:contents">
        <div>
          <p className="font-semibold text-lime">{item.code}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {item.type === "trainer" ? item.trainer_name ?? "Unknown trainer" : item.gym_name ?? "Unknown gym"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopy(item.code)}
          className="grid h-11 w-11 place-items-center rounded-lg border border-line bg-ink md:order-last"
          aria-label={`Copy ${item.code}`}
        >
          <Copy size={17} />
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:contents">
        <div className="rounded-lg bg-ink p-3 md:bg-transparent md:p-0">
          <QrCode className="text-calm" size={18} />
          <p className="mt-2 text-lg font-semibold">{item.referred_users}</p>
          <p className="text-xs text-zinc-400">Referred users</p>
        </div>
        <div className="rounded-lg bg-ink p-3 md:bg-transparent md:p-0">
          <TrendingUp className="text-amber" size={18} />
          <p className="mt-2 text-lg font-semibold">{Number(item.currency_count) > 1 ? "Mixed currencies" : money(item.active_plan_value_cents, item.currency)}</p>
          <p className="text-xs text-zinc-400">Current plan value</p>
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
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setStatus(`${code} copied.`);
    } catch {
      setStatus(`Could not copy ${code}. Press and hold the code to copy it manually.`);
    }
  }

  const gymReferrals = useMemo(() => referrals.filter((referral) => referral.type === "gym"), [referrals]);
  const trainerReferrals = useMemo(() => referrals.filter((referral) => referral.type === "trainer"), [referrals]);
  const activeTrainers = useMemo(() => trainers.filter((trainer) => trainer.status === "active"), [trainers]);
  const gymReferredUsers = gymReferrals.reduce((total, item) => total + Number(item.referred_users), 0);
  const trainerReferredUsers = trainerReferrals.reduce((total, item) => total + Number(item.referred_users), 0);
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

      {status ? <p className="ascend-workspace-inset mt-4 p-3 text-sm text-zinc-300">{status}</p> : null}

      <section className="mt-4 grid grid-cols-2 gap-3 lg:max-w-xl">
        <div className="ascend-workspace-stat p-4">
          <p className="text-xs uppercase text-zinc-400">Gym referrals</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{gymReferredUsers}</p>
          <p className="mt-1 text-xs text-zinc-400">members across {gymReferrals.length} codes</p>
        </div>
        <div className="ascend-workspace-stat p-4">
          <p className="text-xs uppercase text-zinc-400">Trainer referrals</p>
          <p className="mt-2 text-2xl font-semibold text-lime">{trainerReferredUsers}</p>
          <p className="mt-1 text-xs text-zinc-400">members across {trainerReferrals.length} codes</p>
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-lime/40 bg-lime/10 p-4 lg:max-w-3xl">
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
            className="ascend-pressable flex h-12 w-full items-center justify-center rounded-lg bg-lime font-semibold text-ink disabled:opacity-60"
          >
            <Plus className="mr-2" size={18} />
            {isSaving ? "Creating..." : "Create trainer code"}
          </button>
        </div>
      </section>

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">Gym referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when the gym itself brings in a member. Current plan value is attributed to the gym; it is not recognized revenue.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {gymReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!gymReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-400">Gym referral codes will appear here once they are created for a launch club.</p> : null}
        </div>
      </section>

      <section className="ascend-workspace-section mt-4 p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">Trainer referral codes</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Use these when a trainer brings in a member. Current plan value is attributed to that trainer; it is not recognized revenue.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {trainerReferrals.map((item) => (
            <ReferralCard key={item.code} item={item} onCopy={copyCode} />
          ))}
          {!trainerReferrals.length && !status ? <p className="rounded-lg bg-ink p-3 text-sm leading-6 text-zinc-400">Trainer referral codes will appear here after you create one for an active trainer.</p> : null}
        </div>
      </section>
    </>
  );
}
