import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  assignAdminClient: vi.fn(),
  assignOwnerGym: vi.fn(),
  deleteAdminUser: vi.fn(),
  getAdminTrainers: vi.fn(),
  getAdminUsers: vi.fn(),
  getGyms: vi.fn(),
  grantAdminSubscription: vi.fn(),
  removeOwnerGym: vi.fn(),
  setAdminAthleteMode: vi.fn(),
  updateAdminUserDetails: vi.fn(),
  updateAdminUserRole: vi.fn(),
  updateAdminUserStatus: vi.fn()
}));

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AdminUserDetailClient } from "./AdminUserDetailClient";

const client = {
  id: "client-1",
  full_name: "No Gym Member",
  email: "member@example.com",
  primary_role: "client" as const,
  roles: ["client"],
  trainer_profile_id: null,
  trainer_profile_status: null,
  is_platform_owner_account: false,
  gym_id: null,
  gym_name: null,
  assigned_trainer_id: null,
  assigned_trainer_name: null,
  referred_by_gym_id: null,
  referred_gym_name: null,
  referred_by_trainer_id: null,
  referred_trainer_name: null,
  referral_source: "none" as const,
  coaching_mode: "self_coached",
  athlete_mode_enabled: false,
  owner_gym_ids: [],
  current_plan: "premium" as const,
  subscription_status: "active",
  subscription_provider: "manual",
  subscription_current_period_end: null,
  trainer_assignment_eligible: true,
  status: "active" as const,
  created_at: "2026-09-01T00:00:00.000Z"
};

const platformOwner = {
  ...client,
  id: "owner-1",
  full_name: "Fariz Anwar",
  email: "owner@example.com",
  primary_role: "owner" as const,
  roles: ["owner", "admin", "trainer"],
  trainer_profile_id: "trainer-owner",
  trainer_profile_status: "active",
  is_platform_owner_account: true,
  gym_id: "gym-central",
  gym_name: "Central",
  current_plan: "trainer_pro" as const,
  owner_gym_ids: ["gym-central"]
};

describe("Focused business account management", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminUsers.mockResolvedValue({ canManageOwnerGyms: true, users: [client, platformOwner] });
    api.getAdminTrainers.mockResolvedValue({ trainers: [] });
    api.getGyms.mockResolvedValue({
      gyms: [{ id: "gym-central", name: "Central", slug: "central", location: "City", country: "Malaysia", timezone: "Asia/Kuala_Lumpur" }]
    });
    api.updateAdminUserDetails.mockResolvedValue({ user: { ...client, gym_id: "gym-central" } });
  });

  it("lets the owner edit a member name and assign the missing gym on the dedicated screen", async () => {
    render(<AdminUserDetailClient userId="client-1" />);

    expect(await screen.findByRole("heading", { name: "No Gym Member" })).toBeInTheDocument();
    const accountSection = screen.getByRole("heading", { name: "Account details" }).closest("section");
    expect(accountSection).not.toBeNull();
    const fullName = within(accountSection!).getByLabelText("Full name");
    const gym = within(accountSection!).getByLabelText("Gym");
    expect(gym).toHaveValue("");
    expect(within(gym).getByRole("option", { name: "Central" })).toBeInTheDocument();

    fireEvent.change(fullName, { target: { value: "Updated Member" } });
    fireEvent.change(gym, { target: { value: "gym-central" } });
    fireEvent.click(within(accountSection!).getByRole("button", { name: "Save account details" }));

    await waitFor(() => expect(api.updateAdminUserDetails).toHaveBeenCalledWith({
      userId: "client-1",
      fullName: "Updated Member",
      gymId: "gym-central"
    }));
  });

  it("shows the Platform Owner as coach-enabled while protecting the primary role", async () => {
    render(<AdminUserDetailClient userId="owner-1" />);

    expect(await screen.findByText("Coach enabled")).toBeInTheDocument();
    const roleSection = screen.getByRole("heading", { name: "Role and coaching" }).closest("section");
    expect(roleSection).not.toBeNull();
    expect(within(roleSection!).getAllByRole("combobox")[0]).toBeDisabled();
    expect(screen.getByText(/Owner remains the protected primary role/)).toBeInTheDocument();
  });
});
