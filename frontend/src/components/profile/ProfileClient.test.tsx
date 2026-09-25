import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileClient } from "./ProfileClient";

vi.mock("@/lib/ascendApi", () => ({
  getMe: async () => ({ user: { full_name: "Test member", email: "demo@example.test" }, roles: ["client"] }),
  getMySubscription: async () => ({ subscription: { plan: "free", status: "active" } }),
  cancelSubscription: vi.fn(), getBillingPortal: vi.fn(), removeProfilePhoto: vi.fn(), saveProfilePhoto: vi.fn()
}));
vi.mock("@/components/BackButton", () => ({ BackButton: () => null }));
vi.mock("@/components/ProfileAvatar", () => ({ ProfileAvatar: () => null }));
vi.mock("@/components/InstallAscendButton", () => ({ InstallAscendButton: () => null }));
vi.mock("@/components/EnableCoachNotificationsButton", () => ({ EnableCoachNotificationsButton: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/profile", useRouter: () => ({ replace: vi.fn() }) }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("does not offer the rejected Health Sync screen on an iOS profile, even before the bridge loads", async () => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla iPad AscendIOS/5 AscendFree/1 Capacitor");
  const { container } = render(<ProfileClient />);
  await screen.findByText("Test member");
  expect(screen.getByText("2 AI meal estimates per day")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Health Sync" })).not.toBeInTheDocument();
  expect(container.textContent).not.toMatch(/android|google play|health connect/i);
});
it.each(["Mozilla AscendAndroid/1 Capacitor", "Mozilla iPhone Safari"])("preserves the existing Health Sync link for %s", async ua => {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);
  render(<ProfileClient />);
  await screen.findByText("Test member");
  expect(screen.getByRole("link", { name: "Health Sync" })).toHaveAttribute("href", "/profile/health-sync");
});
