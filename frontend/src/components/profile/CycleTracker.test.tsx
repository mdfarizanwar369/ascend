import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CycleCalendar, CycleTracker } from "./CycleTracker";
import { getMe } from "@/lib/ascendApi";
import { cycleStorageKey, readCycleEntries } from "@/lib/cycleLog";

const auth = vi.hoisted(() => {
  const currentUser = { uid: "account-a" };
  return {
    currentUser,
    onChange: vi.fn((listener: (user: { uid: string } | null) => void) => {
      listener(currentUser);
      return vi.fn();
    })
  };
});
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: Parameters<typeof auth.onChange>[0]) => auth.onChange(listener)
}));
vi.mock("@/lib/firebase", () => ({
  getFirebaseClientAuth: () => auth,
  waitForFirebasePersistence: async () => {}
}));
vi.mock("@/lib/useCycleTrackingPilot", () => ({ useCycleTrackingPilot: () => true }));
vi.mock("@/lib/appEdition", () => ({ useIosFreeEdition: () => false }));
vi.mock("@/lib/ascendApi", () => ({ getMe: vi.fn() }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });

function profile(primary_role: "client" | "trainer" | "owner", gender: string | null, firebase_uid = "account-a") {
  return { user: { id: "user-id", email: "test@example.invalid", full_name: "Test", primary_role, gender, firebase_uid }, roles: [primary_role] };
}

it("opens the direct link for a female client without a trainer", async () => {
  vi.mocked(getMe).mockResolvedValue(profile("client", "female"));
  render(<CycleTracker />);
  expect(await screen.findByRole("heading", { name: "Cycle tracker" })).toBeVisible();
  expect(getMe).toHaveBeenCalledWith({ fresh: true });
});

it.each([
  profile("client", "male"),
  profile("client", "prefer_not_to_say"),
  profile("client", null),
  profile("trainer", "female"),
  profile("owner", "female"),
  profile("client", "female", "different-account")
])("blocks ineligible profiles on the direct link even if a device has a saved log", async (me) => {
  localStorage.setItem(cycleStorageKey("account-a"), "{}");
  vi.mocked(getMe).mockResolvedValue(me);
  render(<CycleTracker />);
  expect(await screen.findByRole("heading", { name: "This page is unavailable" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "Period day" })).toBeNull();
});

it("rechecks eligibility when the browser restores a saved tracker page", async () => {
  vi.mocked(getMe).mockResolvedValue(profile("client", "female"));
  render(<CycleTracker />);
  expect(await screen.findByRole("heading", { name: "Cycle tracker" })).toBeVisible();
  vi.mocked(getMe).mockResolvedValue(profile("client", "male"));
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  expect(await screen.findByRole("heading", { name: "This page is unavailable" })).toBeVisible();
});

it("saves and restores a day on this device, isolates accounts, and lets the client delete it", async () => {
  const first = render(<CycleCalendar accountId="account-a" />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Period day" }));
  fireEvent.click(screen.getByRole("button", { name: "medium" }));
  fireEvent.click(screen.getByRole("button", { name: "cramps" }));
  fireEvent.click(screen.getByRole("button", { name: "low" }));
  fireEvent.click(screen.getByRole("button", { name: "Save entry" }));
  expect(await screen.findByText("Saved on this device.")).toBeVisible();
  expect(Object.values(readCycleEntries(localStorage, "account-a"))).toEqual([
    { period: true, flow: "medium", symptoms: ["cramps"], energy: "low" }
  ]);
  first.unmount();
  const other = render(<CycleCalendar accountId="account-b" />);
  expect(screen.getByRole("checkbox", { name: "Period day" })).not.toBeChecked();
  expect(screen.queryByRole("button", { name: "Delete entry" })).toBeNull();
  other.unmount();
  render(<CycleCalendar accountId="account-a" />);
  expect(screen.getByRole("checkbox", { name: "Period day" })).toBeChecked();
  expect(screen.getByRole("button", { name: "cramps" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(localStorage.getItem(cycleStorageKey("account-a"))).toBeNull());
});
