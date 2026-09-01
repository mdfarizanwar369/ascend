import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  assignAdminClient: vi.fn(),
  createAdminReferral: vi.fn(),
  getAdminTrainers: vi.fn(),
  getAdminUsers: vi.fn(),
  getGyms: vi.fn(),
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

const trainer = {
  id: "trainer-1",
  user_id: "trainer-user-1",
  gym_id: "gym-central",
  full_name: "Coach Fariz",
  email: "coach@example.com",
  user_status: "active" as const,
  gym_name: "Central",
  specialties: [],
  status: "active"
};

describe("Business workspace information architecture", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    api.getAdminUsers.mockResolvedValue({ canManageOwnerGyms: true, users: [client] });
    api.getAdminTrainers.mockResolvedValue({ trainers: [trainer] });
    api.getGyms.mockResolvedValue({
      gyms: [{ id: "gym-central", name: "Central", slug: "central", location: "City", country: "Malaysia", timezone: "Asia/Kuala_Lumpur" }]
    });
  });

  it("defaults to a compact people list and links to focused account management", async () => {
    render(<AdminUsersClient />);

    expect(await screen.findByRole("heading", { name: "People" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Clients needing a trainer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Active trainers" })).not.toBeInTheDocument();

    const manageLink = screen.getByRole("link", { name: /No Gym Member.*Manage/i });
    expect(manageLink).toHaveAttribute("href", "/admin/users/client-1");
  });

  it("shows assignment work only after the owner chooses Assignments", async () => {
    render(<AdminUsersClient />);
    await screen.findByText("No Gym Member");

    fireEvent.click(screen.getByRole("button", { name: /Assignments/ }));

    expect(screen.getByRole("heading", { name: "Clients needing a trainer" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
    expect(screen.getByText("Open this account and assign a gym first.")).toBeInTheDocument();
  });

  it("combines trainer workload and referral tools in the Trainers view", async () => {
    render(<AdminUsersClient />);
    await screen.findByText("No Gym Member");

    fireEvent.click(screen.getByRole("button", { name: /Trainers/ }));

    const trainerSection = screen.getByRole("heading", { name: "Active trainers" }).closest("section");
    expect(trainerSection).not.toBeNull();
    expect(within(trainerSection!).getByText("Coach Fariz")).toBeInTheDocument();
    expect(within(trainerSection!).getByText("0 clients")).toBeInTheDocument();
    fireEvent.click(within(trainerSection!).getByRole("button", { name: "Create code" }));
    await waitFor(() => expect(api.createAdminReferral).toHaveBeenCalledWith({
      code: "TRAINER-COACH",
      type: "trainer",
      trainerId: "trainer-1"
    }));
  });
});
