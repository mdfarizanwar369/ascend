import { getTrainerClients, getTrainerRiskAlerts, type TrainerWorkQueueDisposition } from "@/lib/ascendApi";
import { trainerPriorityCards } from "@/lib/trainerDashboardModel";

export type TrainerQueueClient = Awaited<ReturnType<typeof getTrainerClients>>["clients"][number];
export type TrainerQueueAlert = Awaited<ReturnType<typeof getTrainerRiskAlerts>>["alerts"][number];
export type TrainerActionKind = "followup" | "message" | "win";

export type TrainerAction = {
  client: TrainerQueueClient;
  kind: TrainerActionKind;
  reason: string;
  action: string;
  signalKey: string;
  alertId?: string;
  unreadCount: number;
};

function signalKey(client: TrainerQueueClient, kind: "followup" | "win", reason: string, alertId?: string) {
  if (alertId) return `alert:${alertId}`;
  if (kind === "win") return `win:${reason}|${client.goal_achieved_at ?? ""}|${client.consistency_streak ?? ""}`.slice(0, 240);
  const source = reason.includes("No food logs") ? client.last_food_logged_at
    : reason.includes("Weight update") ? client.last_weight_logged_at
      : reason.includes("Water tracking") ? client.last_water_logged_at
        : reason.includes("Momentum") ? `${client.risk_severity ?? ""}:${Math.floor(Number(client.compliance_score ?? 100) / 10)}`
          : `${client.body_composition_summary?.latestScan?.scanDate ?? ""}:${client.goal_updated_at ?? ""}`;
  return `followup:${reason}|${source ?? ""}`.slice(0, 240);
}

function suppressed(dispositions: TrainerWorkQueueDisposition[], task: TrainerAction, now: number) {
  return dispositions.some((item) => item.client_user_id === task.client.id
    && item.kind === task.kind
    && item.signal_key === task.signalKey
    && new Date(item.suppress_until).getTime() > now);
}

export function buildTrainerActionQueue(
  clients: TrainerQueueClient[],
  alerts: TrainerQueueAlert[],
  dispositions: TrainerWorkQueueDisposition[],
  now = Date.now()
) {
  const priorities = trainerPriorityCards(clients, alerts);
  const followups = priorities.needsAttention.map((item): TrainerAction => ({
    client: item.client,
    kind: "followup",
    reason: item.reason,
    action: item.action,
    signalKey: signalKey(item.client, "followup", item.reason, item.alertId),
    alertId: item.alertId,
    unreadCount: Number(item.client.unread_messages ?? 0)
  })).filter((task) => !suppressed(dispositions, task, now));

  const occupied = new Set(followups.map((task) => task.client.id));
  const messages = clients.filter((client) => Number(client.unread_messages ?? 0) > 0 && !occupied.has(client.id))
    .sort((a, b) => new Date(b.last_client_message_at ?? 0).getTime() - new Date(a.last_client_message_at ?? 0).getTime())
    .map((client): TrainerAction => ({
      client,
      kind: "message",
      reason: `${Number(client.unread_messages)} unread message${Number(client.unread_messages) === 1 ? "" : "s"}`,
      action: "Open conversation",
      signalKey: `message:${client.last_client_message_at ?? ""}`,
      unreadCount: Number(client.unread_messages)
    }));
  messages.forEach((task) => occupied.add(task.client.id));

  const wins = priorities.greatProgress.filter((item) => !occupied.has(item.client.id))
    .map((item): TrainerAction => ({
      client: item.client,
      kind: "win",
      reason: item.reason,
      action: item.action,
      signalKey: signalKey(item.client, "win", item.reason),
      unreadCount: 0
    }))
    .filter((task) => !suppressed(dispositions, task, now));

  return { followups, messages, wins };
}
