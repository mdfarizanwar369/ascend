import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileClient } from "./ProfileClient";

const mocks = vi.hoisted(() => ({
  clearCachedAccountProfile: vi.fn(),
  firebaseUser: { displayName: "Original Name" },
  getMe: vi.fn(),
  getMySubscription: vi.fn(),
  updateFirebaseProfile: vi.fn(),
  updateMyProfile: vi.fn()
}));

vi.mock("firebase/auth", () => ({ updateProfile: mocks.updateFirebaseProfile }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => ({ currentUser: mocks.firebaseUser }) }));
vi.mock("@/lib/accountSession", () => ({ clearCachedAccountProfile: mocks.clearCachedAccountProfile }));
vi.mock("@/lib/ascendApi", () => ({
  cancelSubscription: vi.fn(),
  getBillingPortal: vi.fn(),
  getMe: mocks.getMe,
  getMySubscription: mocks.getMySubscription,
  removeProfilePhoto: vi.fn(),
  saveProfilePhoto: vi.fn(),
  updateMyProfile: mocks.updateMyProfile
}));
vi.mock("@/components/BackButton", () => ({ BackButton: () => <button type="button">Back</button> }));
vi.mock("@/components/InstallAscendButton", () => ({ InstallAscendButton: () => null }));
vi.mock("@/components/EnableCoachNotificationsButton", () => ({ EnableCoachNotificationsButton: () => null }));
vi.mock("@/lib/billingPlatform", () => ({
  getNativeBillingMessage: () => null,
  shouldHideHostedBilling: () => false,
  shouldUseAndroidPlayBilling: () => false
}));

describe("ProfileClient name editing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firebaseUser.displayName = "Original Name";
    mocks.getMe.mockResolvedValue({
      user: {
        id: "user-1",
        email: "member@example.com",
        full_name: "Original Name",
        profile_photo_url: null,
        athlete_mode_enabled: false,
        body_scan_introductory_enabled: false
      },
      roles: ["client"]
    });
    mocks.getMySubscription.mockResolvedValue({
      subscription: {
        plan: "free",
        provider: null,
        status: "active",
        current_period_end: null
      }
    });
    mocks.updateMyProfile.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com", full_name: "Updated Name" }
    });
    mocks.updateFirebaseProfile.mockResolvedValue(undefined);
  });

  it("lets the signed-in member edit their own name and refreshes identity caches", async () => {
    render(<ProfileClient />);

    expect(await screen.findByRole("heading", { name: "Original Name" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "  Updated Name  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(mocks.updateMyProfile).toHaveBeenCalledWith({ fullName: "Updated Name" }));
    expect(await screen.findByRole("heading", { name: "Updated Name" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Name updated.");
    expect(mocks.clearCachedAccountProfile).toHaveBeenCalledOnce();
    expect(mocks.updateFirebaseProfile).toHaveBeenCalledWith(mocks.firebaseUser, { displayName: "Updated Name" });
  });
});
