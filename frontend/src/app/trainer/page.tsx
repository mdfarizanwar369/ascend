import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerActionDesk } from "@/components/trainer/TrainerActionDesk";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#35f2d0",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover"
};

export default function TrainerPage() {
  return (
    <AppShell active="trainer" lockViewport>
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account is a client account. Use a trainer, owner, or admin login to view assigned clients."
        requiredPlan="trainer_pro"
        planFeature="Trainer dashboard"
      >
        <TrainerActionDesk />
      </RoleGate>
    </AppShell>
  );
}
