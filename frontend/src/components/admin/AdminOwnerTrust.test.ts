import { describe, expect, it } from "vitest";
import { summarizeCurrentPlanValue, uniquePriorities } from "./AdminDashboardClient";
import { trainersForUser } from "./AdminUsersClient";

describe("owner experience trust safeguards", () => {
  it("labels current plan value without presenting it as revenue", () => {
    const summary = summarizeCurrentPlanValue([
      {
        id: "gym-1",
        gym_name: "Central",
        active_plan_value_cents: 5997,
        active_subscriptions: 3,
        currency: "MYR",
        currency_count: 1
      }
    ]);

    expect(summary.value).toContain("60");
    expect(summary.detail).toContain("not recognized revenue");
  });

  it("does not combine amounts that use different currencies", () => {
    const summary = summarizeCurrentPlanValue([
      { id: "gym-1", gym_name: "Central", active_plan_value_cents: 1999, active_subscriptions: 1, currency: "MYR", currency_count: 1 },
      { id: "gym-2", gym_name: "North", active_plan_value_cents: 999, active_subscriptions: 1, currency: "USD", currency_count: 1 }
    ]);

    expect(summary.value).toBe("2 active");
    expect(summary.detail).toContain("multiple currencies");
  });

  it("puts urgent priorities first and removes duplicate destinations", () => {
    const priorities = uniquePriorities([
      { id: "one", type: "assignment", severity: "important", title: "First", body: "One", href: "/admin/users", count: 2 },
      { id: "two", type: "assignment", severity: "critical", title: "Duplicate", body: "Two", href: "/admin/users", count: 5 },
      { id: "three", type: "billing", severity: "critical", title: "Billing", body: "Three", href: "/admin/subscriptions", count: 1 }
    ]);

    expect(priorities).toHaveLength(2);
    expect(priorities[0].severity).toBe("critical");
    expect(priorities.map((item) => item.href)).toEqual(["/admin/users", "/admin/subscriptions"]);
  });

  it("offers only active trainers from the member's own gym", () => {
    const user = { gym_id: "gym-1" } as Parameters<typeof trainersForUser>[0];
    const trainers = [
      { id: "eligible", gym_id: "gym-1", user_status: "active", status: "active" },
      { id: "other-gym", gym_id: "gym-2", user_status: "active", status: "active" },
      { id: "pending", gym_id: "gym-1", user_status: "active", status: "pending" }
    ] as Parameters<typeof trainersForUser>[1];

    expect(trainersForUser(user, trainers).map((trainer) => trainer.id)).toEqual(["eligible"]);
  });
});
