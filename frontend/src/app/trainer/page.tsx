import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerDashboardClient } from "@/components/trainer/TrainerDashboardClient";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function TrainerPage() {
  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account is a client account. Use a trainer, owner, or admin login to view assigned clients."
        requiredPlan="trainer_pro"
        planFeature="Trainer dashboard"
      >
        <Link href="/trainer/clients" className="ascend-pressable mt-4 flex min-h-16 items-center gap-3 rounded-2xl border border-lime/35 bg-lime/10 p-4 shadow-soft">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink"><Sparkles size={19} /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold text-white">Open Ascend Coach</span><span className="mt-1 block text-sm text-zinc-400">Client 360 and evidence-backed coaching insight</span></span>
          <ArrowRight className="shrink-0 text-lime" size={20} />
        </Link>
        <TrainerDashboardClient />
      </RoleGate>
    </AppShell>
  );
}
