import { describe, expect, it } from "vitest";
import { AscendDNAService, NotificationEngine } from "@ascend/shared";

const dna = AscendDNAService.buildProfile({
  now: "2026-06-24T19:00:00+08:00",
  events: [
    { type: "food", occurredAt: "2026-06-23T20:00:00+08:00" },
    { type: "water", occurredAt: "2026-06-23T20:10:00+08:00" },
    { type: "screen_open", occurredAt: "2026-06-23T20:15:00+08:00" }
  ],
  currentStreak: 3,
  bestStreak: 5
});

describe("NotificationEngine", () => {
  it("prioritizes human trainer communication immediately", () => {
    const selected = NotificationEngine.select({
      now: "2026-06-24T23:30:00+08:00",
      dna,
      openedToday: true,
      prioritiesComplete: true,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      trainerEvent: { type: "message", senderName: "Jason" },
      celebrationSignals: [{ type: "best_week" }]
    });

    expect(selected?.type).toBe("trainer_message");
    expect(selected?.bypassQuietHours).toBe(true);
  });

  it("blocks coaching nudges during quiet hours", () => {
    const selected = NotificationEngine.select({
      now: "2026-06-24T23:30:00+08:00",
      dna,
      openedToday: false,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      nextBestMove: { title: "Add a protein-rich meal.", detail: "Protein", href: "/food-log" }
    });

    expect(selected).toBeNull();
  });

  it("does not coach if the user already opened today", () => {
    const selected = NotificationEngine.select({
      now: "2026-06-24T19:00:00+08:00",
      dna,
      openedToday: true,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      nextBestMove: { title: "Add a protein-rich meal.", detail: "Protein", href: "/food-log" }
    });

    expect(selected).toBeNull();
  });

  it("sends at most one celebration per day", () => {
    const selected = NotificationEngine.select({
      now: "2026-06-24T19:00:00+08:00",
      dna,
      openedToday: false,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: true, trainerMessage: false },
      celebrationSignals: [{ type: "best_week" }]
    });

    expect(selected).toBeNull();
  });

  it("keeps wording supportive and non-guilt based", () => {
    const selected = NotificationEngine.select({
      now: "2026-06-24T19:00:00+08:00",
      dna,
      openedToday: false,
      prioritiesComplete: false,
      sentToday: { coaching: false, celebration: false, trainerMessage: false },
      nextBestMove: { title: "Add a protein-rich meal.", detail: "Protein", href: "/food-log" }
    });

    expect(selected?.body.toLowerCase()).not.toMatch(/forgot|failed|missed|behind|breakfast|lunch|dinner/);
    expect(selected?.type).toBe("next_best_move");
  });
});
