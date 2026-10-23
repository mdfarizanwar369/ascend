import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const { auth, authChanged, push, native, sync, router, path } = vi.hoisted(() => {
  const push = vi.fn();
  return { auth: { currentUser: null as null | { uid: string } }, authChanged: vi.fn(), push,
    native: { getPurchaseIntent: vi.fn(), addListener: vi.fn(), purchase: vi.fn() }, sync: vi.fn(), router: { push }, path: { current: "/dashboard" } };
});
vi.mock("firebase/auth", () => ({ onAuthStateChanged: authChanged }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current, useRouter: () => router }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => auth }));
vi.mock("@/lib/appleBilling", () => ({ supportsAppleBilling: () => true, AppleBilling: native, syncAppleTransactions: sync }));
import { AppleSubscriptionCoordinator } from "./AppleSubscriptionCoordinator";
afterEach(() => { cleanup(); vi.clearAllMocks(); auth.currentUser = null; path.current = "/dashboard"; });
it("waits for sign-in before taking an App Store purchase request to the paywall", async () => {
  let signedIn = () => {};
  authChanged.mockImplementation((_auth, callback) => { signedIn = callback; callback(); return () => {}; });
  native.getPurchaseIntent.mockResolvedValue({ productId: "fit.getascend.app.premium.monthly" });
  native.addListener.mockResolvedValue({ remove: async () => {} }); sync.mockResolvedValue(0);
  render(<AppleSubscriptionCoordinator />);
  expect(push).not.toHaveBeenCalled(); expect(native.getPurchaseIntent).not.toHaveBeenCalled();
  await act(async () => { auth.currentUser = { uid: "signed-in-user" }; signedIn(); });
  await waitFor(() => expect(push).toHaveBeenCalledWith("/subscription"));
  expect(native.purchase).not.toHaveBeenCalled();
});
it("keeps one subscription listener across navigation and uses the latest path for purchase intent", async () => {
  auth.currentUser = { uid: "signed-in-user" };
  authChanged.mockImplementation((_auth, callback) => { callback(); return () => {}; });
  native.getPurchaseIntent.mockResolvedValue({ productId: "fit.getascend.app.premium.monthly" });
  native.addListener.mockResolvedValue({ remove: async () => {} });
  sync.mockResolvedValue(0);
  const view = render(<AppleSubscriptionCoordinator />);
  await waitFor(() => expect(sync).toHaveBeenCalledOnce());
  expect(authChanged).toHaveBeenCalledOnce();
  expect(native.addListener).toHaveBeenCalledTimes(2);
  push.mockClear();
  path.current = "/subscription";
  view.rerender(<AppleSubscriptionCoordinator />);
  expect(authChanged).toHaveBeenCalledOnce();
  expect(sync).toHaveBeenCalledOnce();
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(push).not.toHaveBeenCalled();
});
