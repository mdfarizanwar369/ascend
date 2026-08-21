import { AppShell } from "@/components/AppShell";
import { BodyScanPreviewClient } from "@/components/body-scan/BodyScanPreviewClient";

export default function BodyScanPreviewPage() {
  return (
    <AppShell active="client">
      <BodyScanPreviewClient />
    </AppShell>
  );
}
