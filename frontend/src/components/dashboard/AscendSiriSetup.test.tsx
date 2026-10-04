import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: vi.fn(), connect: vi.fn(), disconnect: vi.fn(),
  user: { uid: "owner-uid", getIdToken: vi.fn() }
}));
vi.mock("@/lib/nativePlatform", () => ({ getNativeCapacitorPlatform: () => "ios" }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => ({ currentUser: mocks.user }) }));
vi.mock("@/lib/ascendSiri", () => ({ ascendSiri: { status: mocks.status, connect: mocks.connect, disconnect: mocks.disconnect } }));
vi.mock("@/lib/api", () => ({ API_URL: "https://api.example.com/api/v1" }));

import { AscendSiriSetup } from "./AscendSiriSetup";

beforeEach(() => {
  mocks.status.mockReset().mockResolvedValue({ supported: true, connected: false });
  mocks.connect.mockReset().mockResolvedValue({ connected: true, expiresAt: "2026-11-01T00:00:00Z" });
  mocks.disconnect.mockReset().mockResolvedValue(undefined);
  mocks.user.getIdToken.mockReset().mockResolvedValue("firebase-id-token");
});
afterEach(cleanup);

it("connects the signed-in owner and offers example Siri questions", async () => {
  render(<AscendSiriSetup />);
  fireEvent.click(await screen.findByRole("button", { name: "Enable Siri" }));
  await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({
    apiBaseUrl: "https://api.example.com/api/v1",
    firebaseToken: "firebase-id-token",
    firebaseUid: "owner-uid"
  }));
  expect(await screen.findByText("Connected on this iPhone.")).toBeInTheDocument();
  expect(screen.getByText(/ask Ascend a question/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Disconnect Siri" }));
  await waitFor(() => expect(mocks.disconnect).toHaveBeenCalledOnce());
  expect(await screen.findByRole("button", { name: "Enable Siri" })).toBeInTheDocument();
});
