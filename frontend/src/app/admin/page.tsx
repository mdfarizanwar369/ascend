import { BadgeDollarSign, Building2, QrCode, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";

const revenue = [
  { label: "Austin Green", amount: "RM 1,900", detail: "92 active clients" },
  { label: "Kulai Indahpura", amount: "RM 1,520", detail: "74 active clients" }
];

const trainers = [
  { label: "Jason Tan", amount: "RM 820", detail: "TRAINER-JASON" },
  { label: "Siti Aminah", amount: "RM 690", detail: "TRAINER-SITI" }
];

export default function AdminPage() {
  return (
    <AppShell active="admin">
      <section className="mt-3">
        <h1 className="text-2xl font-semibold">Owner dashboard</h1>
        <p className="mt-2 text-sm text-zinc-400">Multi-gym revenue, trainer attribution, and client accountability.</p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard label="Revenue" value="RM 3,420" detail="This month" tone="success" />
        <MetricCard label="Premium" value="166" detail="Active members" />
        <MetricCard label="Trainers" value="12" detail="Across gyms" />
        <MetricCard label="Avg score" value="72" detail="Compliance" />
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <Building2 size={19} className="text-lime" />
          <h2 className="text-base font-semibold">Revenue by gym</h2>
        </div>
        <div className="mt-3 space-y-3">
          {revenue.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-lg bg-ink p-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{item.detail}</p>
              </div>
              <p className="font-semibold text-lime">{item.amount}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-surface p-4">
        <div className="flex items-center gap-2">
          <BadgeDollarSign size={19} className="text-amber" />
          <h2 className="text-base font-semibold">Revenue by trainer</h2>
        </div>
        <div className="mt-3 space-y-3">
          {trainers.map((item) => (
            <div key={item.label} className="flex items-center justify-between rounded-lg bg-ink p-3">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{item.detail}</p>
              </div>
              <p className="font-semibold text-amber">{item.amount}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/admin/subscriptions" className="rounded-lg border border-line bg-surface p-4 text-left">
          <Users className="text-calm" size={20} />
          <span className="mt-3 block text-sm font-medium">Subscriptions</span>
        </Link>
        <Link href="/admin/referrals" className="rounded-lg border border-line bg-surface p-4 text-left">
          <QrCode className="text-lime" size={20} />
          <span className="mt-3 block text-sm font-medium">Referral codes</span>
        </Link>
      </section>
    </AppShell>
  );
}
