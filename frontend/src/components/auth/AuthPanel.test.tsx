import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  popup: vi.fn(), redirect: vi.fn(), redirectResult: vi.fn(), fetch: vi.fn(), getMe: vi.fn(), router: { replace: vi.fn() },
  auth: { currentUser: null, useDeviceLanguage: vi.fn() }
}));

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/appEdition", () => ({ isIosFreeEdition: () => false, useIosFreeEdition: () => false }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => mocks.auth, waitForFirebasePersistence: async () => undefined }));
vi.mock("@/lib/ascendApi", () => ({ getMe: mocks.getMe }));
vi.mock("@/lib/onboardingVersion", () => ({ isProgressiveOnboardingEnabled: () => true, hasCompletedClientOnboardingProfile: () => true }));
vi.mock("@/lib/nativePlatform", () => ({ supportsNativeIosAuth: () => false, supportsNativeSocialAuth: () => false, getNativeCapacitorPlatform: () => null }));
vi.mock("@/lib/nativeSocialAuth", () => ({ signInWithNativeSocialProvider: vi.fn() }));
vi.mock("@/lib/installAscend", () => ({ markInstallEligible: vi.fn() }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: () => <span>Ascend</span> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/legal/PublicFooter", () => ({ PublicFooter: () => null }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class { setCustomParameters() {} },
  signInWithPopup: mocks.popup, signInWithRedirect: mocks.redirect,
  getRedirectResult: mocks.redirectResult,
  onAuthStateChanged: (_auth: unknown, callback: (user: null) => void) => { queueMicrotask(() => callback(null)); return () => undefined; },
  createUserWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn(), signInWithEmailAndPassword: vi.fn(), updateProfile: vi.fn()
}));

import { AuthPanel } from "./AuthPanel";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const credential = { user: {
  uid: "google-auth-fixture", email: "auth-fixture@example.invalid", displayName: "Auth fixture",
  providerData: [{ providerId: "google.com" }], getIdToken: async () => "fixture-token"
} };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem("ascend.authDraft.v1", JSON.stringify({ mode: "login" }));
  for (const [name, value] of Object.entries({
    NEXT_PUBLIC_GOOGLE_SIGN_IN_ENABLED: "true", NEXT_PUBLIC_FIREBASE_API_KEY: "fixture-public-key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "fixture.firebaseapp.com", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "fixture",
    NEXT_PUBLIC_FIREBASE_APP_ID: "fixture-app"
  })) vi.stubEnv(name, value);
  mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  mocks.redirectResult.mockResolvedValue(null);
  mocks.getMe.mockResolvedValue({ user: {}, roles: ["client"] });
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function openSignIn() {
  render(<AuthPanel />);
  // Settle the existing redirect/auth-state recovery probe before opening a popup.
  await act(async () => { await Promise.resolve(); });
  const googleButton = screen.getByRole("button", { name: "Continue with Google" });
  fireEvent.click(googleButton);
  return googleButton;
}

describe("Google popup sign-in lifecycle", () => {
  it("allows slow account selection and provisions a successful sign-in exactly once", async () => {
    const recoveryProbe = deferred<null>();
    mocks.redirectResult.mockReturnValue(recoveryProbe.promise);
    const selection = deferred<typeof credential>();
    mocks.popup.mockReturnValue(selection.promise);
    const googleButton = await openSignIn();
    await act(async () => { recoveryProbe.resolve(null); });

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(googleButton).toBeDisabled();
    expect(screen.queryByText(/taking too long|check your connection/i)).not.toBeInTheDocument();
    expect(mocks.fetch).not.toHaveBeenCalled();
    fireEvent.click(googleButton);
    expect(mocks.popup).toHaveBeenCalledOnce();

    await act(async () => { selection.resolve(credential); });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/provision"), expect.objectContaining({ method: "POST" }));
    expect(mocks.getMe).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });

  it("clears the busy state when the user closes a delayed popup and permits a clean retry", async () => {
    const selection = deferred<typeof credential>();
    mocks.popup.mockReturnValueOnce(selection.promise).mockResolvedValueOnce(credential);
    await openSignIn();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    await act(async () => { selection.reject(Object.assign(new Error("Popup closed"), { code: "auth/popup-closed-by-user" })); });

    expect(screen.getByText("Google sign-in was closed before it finished. Please try again when you are ready.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })); });
    expect(mocks.popup).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
    expect(screen.queryByText(/sign-in was closed/)).not.toBeInTheDocument();
  });

  it("keeps the backend provisioning deadline after Google authentication succeeds", async () => {
    mocks.popup.mockResolvedValue(credential);
    mocks.fetch.mockReturnValue(new Promise(() => undefined));
    await openSignIn();
    await act(async () => { await vi.advanceTimersByTimeAsync(25_001); });

    expect(screen.getByText("The connection is taking too long. Please check your internet connection and try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    expect(mocks.getMe).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("ignores a stale redirect-probe error while interactive Google sign-in is open", async () => {
    const recoveryProbe = deferred<null>();
    mocks.redirectResult.mockReturnValue(recoveryProbe.promise);
    const selection = deferred<typeof credential>();
    mocks.popup.mockReturnValue(selection.promise);
    const googleButton = await openSignIn();
    await act(async () => { recoveryProbe.reject(new Error("An old redirect probe failed")); });

    expect(googleButton).toBeDisabled();
    expect(screen.getByText("Opening secure Google sign-in popup...")).toBeInTheDocument();
    expect(screen.queryByText("An old redirect probe failed")).not.toBeInTheDocument();
    await act(async () => { selection.resolve(credential); });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith("/dashboard");
  });
});
