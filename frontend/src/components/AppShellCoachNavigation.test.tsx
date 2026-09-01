import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const account = vi.hoisted(() => ({
  getCachedAccountProfile: vi.fn(),
  loadAccountPlan: vi.fn(),
  loadAccountProfile: vi.fn()
}));
const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }));

vi.mock("@/lib/accountSession", () => account);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AppShell } from "./AppShell";

function profile(roles: string[], isPlatformOwner = false) {
  return {
    email: "person@example.com",
    fullName: "Controlled Person",
    roles,
    isPlatformOwner,
    profilePhotoUrl: null
  };
}

describe("Ascend Coach production navigation", () => {
  const original = process.env.NEXT_PUBLIC_ASCEND_COACH_V1;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "true";
    account.getCachedAccountProfile.mockReturnValue(null);
    account.loadAccountPlan.mockResolvedValue("trainer_pro");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    if (original === undefined) delete process.env.NEXT_PUBLIC_ASCEND_COACH_V1;
    else process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = original;
  });

  it("omits Coach and Trainer navigation for a normal member", async () => {
    account.loadAccountProfile.mockResolvedValue(profile(["client"]));
    render(<AppShell active="client"><div>Member page</div></AppShell>);
    await waitFor(() => expect(account.loadAccountProfile).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trainer" })).not.toBeInTheDocument();
  });

  it("never exposes privileged navigation from a stale browser-cached trainer role", async () => {
    account.getCachedAccountProfile.mockReturnValue(profile(["trainer"]));
    account.loadAccountProfile.mockResolvedValue(profile(["client"]));
    render(<AppShell active="client"><div>Member page</div></AppShell>);
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trainer" })).not.toBeInTheDocument();
    await waitFor(() => expect(account.loadAccountProfile).toHaveBeenCalledWith({ forceRefresh: true }));
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Trainer" })).not.toBeInTheDocument();
  });

  it.each([
    ["trainer", profile(["trainer"])],
    ["Platform Owner", profile([], true)]
  ])("shows Coach navigation for an authenticated %s", async (_label, value) => {
    account.loadAccountProfile.mockResolvedValue(value);
    render(<AppShell active="client"><div>Eligible page</div></AppShell>);
    expect((await screen.findAllByRole("link", { name: "Coach" })).length).toBeGreaterThan(0);
  });

  it("does not label an ordinary admin workspace as Coach", async () => {
    account.loadAccountProfile.mockResolvedValue(profile(["admin"]));
    render(<AppShell active="client"><div>Admin page</div></AppShell>);
    expect((await screen.findAllByRole("link", { name: "Trainer" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
  });

  it("removes Coach navigation for eligible accounts when the flag is off", async () => {
    process.env.NEXT_PUBLIC_ASCEND_COACH_V1 = "false";
    account.loadAccountProfile.mockResolvedValue(profile(["trainer"]));
    render(<AppShell active="client"><div>Disabled page</div></AppShell>);
    expect((await screen.findAllByRole("link", { name: "Trainer" })).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Coach" })).not.toBeInTheDocument();
  });
});
