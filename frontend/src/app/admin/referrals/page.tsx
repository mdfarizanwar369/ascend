import { Copy, QrCode, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";

const codes = [
  { code: "AF-AUSTIN", owner: "Anytime Fitness Austin Green", users: 92, revenue: "RM 1,900" },
  { code: "AF-KULAI", owner: "Anytime Fitness Kulai Indahpura", users: 74, revenue: "RM 1,520" },
  { code: "TRAINER-JASON", owner: "Jason Tan", users: 41, revenue: "RM 820" },
  { code: "TRAINER-SITI", owner: "Siti Aminah", users: 34, revenue: "RM 690" }
];

export default function AdminReferralsPage() {
  return (
    <AppShell active="admin">
      <section className="mt-3">
        <p className="text-sm text-zinc-400">Referral attribution</p>
        <h1 className="mt-1 text-2xl font-semibold">Gym and trainer codes</h1>
      </section>

      <section className="mt-4 space-y-3">
        {codes.map((item) => (
          <article key={item.code} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-lime">{item.code}</p>
                <p className="mt-1 text-sm text-zinc-400">{item.owner}</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-ink" aria-label={`Copy ${item.code}`}>
                <Copy size={17} />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-ink p-3">
                <QrCode className="text-calm" size={18} />
                <p className="mt-2 text-lg font-semibold">{item.users}</p>
                <p className="text-xs text-zinc-400">Referred users</p>
              </div>
              <div className="rounded-lg bg-ink p-3">
                <TrendingUp className="text-amber" size={18} />
                <p className="mt-2 text-lg font-semibold">{item.revenue}</p>
                <p className="text-xs text-zinc-400">Active revenue</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}

