import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMe: vi.fn(),
  getMySubscription: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => api);

import { AscendCoachGate } from "./AscendCoachGate";

function identity(input: { roles: string[]; primaryRole: string; isPlatformOwner?: boolean }) {
  return {
    user: {
      id: "user-id",
      email: "person@example.com",
      full_name: "Controlled Person",
      primary_role: input.primaryRole,
      is_platform_owner: input.isPlatformOwner === true
    },
    roles: input.roles
  };
}

describe("Ascend Coach production route gate", () => {
  const original = process.env.NEXT_PUBLIC_ASCEND_COACH_V1;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "true";
    api.getMySubscription.mockResolvedValue({
      subscription: { plan: "trainer_pro", status: "active", current_period_end: null }
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    if (original === undefined) delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    else process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = original;
  });

  it.each([
    ["trainer", identity({ roles: ["trainer"], primaryRole: "trainer" })],
    ["Platform Owner", identity({ roles: [], primaryRole: "client", isPlatformOwner: true })]
  ])("renders Coach content for an authenticated %s", async (_label, me) => {
    api.getMe.mockResolvedValue(me);
    render(<AscendCoachGate><div>Sensitive Coach content</div></AscendCoachGate>);
    expect(await screen.findByText("Sensitive Coach content")).toBeInTheDocument();
  });

  it.each([
    ["normal member", identity({ roles: ["client"], primaryRole: "client" })],
    ["ordinary admin", identity({ roles: ["admin"], primaryRole: "admin" })],
    ["non-platform owner role", identity({ roles: ["owner", "admin"], primaryRole: "owner" })]
  ])("does not render Coach content for an authenticated %s", async (_label, me) => {
    api.getMe.mockResolvedValue(me);
    render(<AscendCoachGate><div>Sensitive Coach content</div></AscendCoachGate>);
    expect(await screen.findByRole("heading", { name: "Trainer or Platform Owner access only" })).toBeInTheDocument();
    expect(screen.queryByText("Sensitive Coach content")).not.toBeInTheDocument();
  });

  it("renders no Coach content and performs no identity lookup when the flag is off", () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "false";
    render(<AscendCoachGate><div>Sensitive Coach content</div></AscendCoachGate>);
    expect(screen.getByRole("heading", { name: "Ascend Coach unavailable" })).toBeInTheDocument();
    expect(screen.queryByText("Sensitive Coach content")).not.toBeInTheDocument();
    expect(api.getMe).not.toHaveBeenCalled();
  });

  it("silently omits the trainer-dashboard entry for an ineligible account", async () => {
    api.getMe.mockResolvedValue(identity({ roles: ["admin"], primaryRole: "admin" }));
    render(<AscendCoachGate hideWhenDenied><div>Sensitive Coach content</div></AscendCoachGate>);
    await waitFor(() => expect(api.getMe).toHaveBeenCalled());
    expect(screen.queryByText("Sensitive Coach content")).not.toBeInTheDocument();
    expect(screen.queryByText("Trainer or Platform Owner access only")).not.toBeInTheDocument();
  });
});
