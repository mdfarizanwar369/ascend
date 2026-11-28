import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { TrainerClientDetailClient } from "@/components/trainer/TrainerClientDetailClient";

export default async function TrainerClientDetailPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>;
  searchParams?: Promise<{ ptDraft?: string }>;
}) {
  const [{ clientId }, query] = await Promise.all([params, searchParams]);

  return (
    <AppShell active="trainer">
      <RoleGate
        allowedRoles={["trainer", "admin", "owner"]}
        fallbackTitle="Trainer access only"
        fallbackMessage="This account cannot view client trainer records. Use a trainer, owner, or admin login."
        requiredPlan="trainer_pro"
        planFeature="Trainer client profile"
      >
        <TrainerClientDetailClient clientId={clientId} draftJustSaved={query?.ptDraft === "saved"} />
      </RoleGate>
    </AppShell>
  );
}
