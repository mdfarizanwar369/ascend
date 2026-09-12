import { AppShell } from "@/components/AppShell";
import { RoleGate } from "@/components/RoleGate";
import { MessageModerationClient } from "@/components/messages/MessageModerationClient";

export default function MessageReportsPage() {
  return <AppShell active="founder"><RoleGate allowedRoles={["owner"]} requirePlatformOwner
    fallbackTitle="Founder access only" fallbackMessage="Message reports are private to Ascend moderation.">
    <MessageModerationClient />
  </RoleGate></AppShell>;
}
