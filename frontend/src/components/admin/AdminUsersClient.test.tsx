import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  assignAdminClient: vi.fn(),
  assignOwnerGym: vi.fn(),
  createAdminReferral: vi.fn(),
  deleteAdminUser: vi.fn(),
  getAdminTrainers: vi.fn(),
  getAdminUsers: vi.fn(),
  getGyms: vi.fn(),
  grantAdminSubscription: vi.fn(),
  removeOwnerGym: vi.fn(),
  setAdminAthleteMode: vi.fn(),
  updateAdminUserDetails: vi.fn(),
  updateAdminUserStatus: vi.fn(),
  updateAdminUserRole: vi.fn()
}));

vi.mock("@/lib/ascendApi", () => api);
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));

import { AdminUsersClient } from "./AdminUsersClient";

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

describe("Business user editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminUsers.mockResolvedValue({ canManageOwnerGyms: true, users: [client] });
    api.getAdminTrainers.mockResolvedValue({ trainers: [] });
    api.getGyms.mockResolvedValue({
      gyms: [{ id: "gym-central", name: "Central", slug: "central", location: "City", country: "Malaysia", timezone: "Asia/Kuala_Lumpur" }]
    });
    api.updateAdminUserDetails.mockResolvedValue({ user: { ...client, gym_id: "gym-central" } });
  });

  it("lets the owner edit a member name and assign the missing gym", async () => {
    render(<AdminUsersClient />);

    expect((await screen.findAllByText("No Gym Member")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /manage/i }));

    const fullName = screen.getByLabelText("Full name");
    const gym = screen.getByLabelText("Gym");
    expect(gym).toHaveValue("");
    expect(within(gym).getByRole("option", { name: "Central" })).toBeInTheDocument();

    fireEvent.change(fullName, { target: { value: "Updated Member" } });
    fireEvent.change(gym, { target: { value: "gym-central" } });
    fireEvent.click(screen.getByRole("button", { name: "Save account details" }));

    await waitFor(() => expect(api.updateAdminUserDetails).toHaveBeenCalledWith({
      userId: "client-1",
      fullName: "Updated Member",
      gymId: "gym-central"
    }));
  });
});
