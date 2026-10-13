import { describe, expect, it } from "vitest";
import { buildTrainerActionQueue, type TrainerQueueClient, type TrainerQueueAlert } from "./trainerActionQueue";

function client(id: string, overrides: Partial<TrainerQueueClient> = {}): TrainerQueueClient {
  return {
    id,
    full_name: `Client ${id}`,
    email: `${id}@example.com`,
    current_plan: "premium",
    compliance_score: 75,
    unread_messages: 0,
    ...overrides
  } as TrainerQueueClient;
}

describe("trainer action queue", () => {
  it("does not treat never-recorded food as a missed log", () => {
    const queue = buildTrainerActionQueue([client("new")], [], []);
    expect(queue.followups).toHaveLength(0);
  });

  it("shows one task per client and puts an alert ahead of their unread message", () => {
    const clients = [client("a", { risk_severity: "high", open_alerts: 1, unread_messages: 2 }), client("b", { unread_messages: 1 })];
    const alerts = [{ id: "alert-1", user_id: "a", severity: "high", message: "Review this signal" }] as TrainerQueueAlert[];
    const queue = buildTrainerActionQueue(clients, alerts, []);

    expect(queue.followups).toHaveLength(1);
    expect(queue.followups[0]).toMatchObject({ reason: "Review this signal", unreadCount: 2, signalKey: "alert:alert-1" });
    expect(queue.messages.map((task) => task.client.id)).toEqual(["b"]);
  });

  it("keeps a snoozed signal out until expiry and restores changed signals", () => {
    const clients = [client("a", { last_food_logged_at: "2026-10-01T00:00:00Z" })];
    const first = buildTrainerActionQueue(clients, [], [], Date.parse("2026-10-13T00:00:00Z")).followups[0];
    expect(first).toBeDefined();
    const disposition = { client_user_id: "a", kind: "followup" as const, signal_key: first.signalKey, disposition: "snoozed" as const, suppress_until: "2026-10-14T00:00:00Z" };

    expect(buildTrainerActionQueue(clients, [], [disposition], Date.parse("2026-10-13T12:00:00Z")).followups).toHaveLength(0);
    expect(buildTrainerActionQueue(clients, [], [disposition], Date.parse("2026-10-14T00:00:00Z")).followups).toHaveLength(1);
    expect(buildTrainerActionQueue([client("a", { last_food_logged_at: "2026-10-02T00:00:00Z" })], [], [disposition], Date.parse("2026-10-13T12:00:00Z")).followups).toHaveLength(1);
  });
});
