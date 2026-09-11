import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  apple: vi.fn(), google: vi.fn(), signIn: vi.fn(), update: vi.fn(), appleCredential: vi.fn(),
  supports: vi.fn(), ios: vi.fn(), persistence: vi.fn()
}));
vi.mock("@capacitor-firebase/authentication", () => ({ FirebaseAuthentication: { signInWithApple: mocks.apple, signInWithGoogle: mocks.google } }));
vi.mock("@/lib/firebase", () => ({ getFirebaseClientAuth: () => ({}), waitForFirebasePersistence: mocks.persistence }));
vi.mock("@/lib/nativePlatform", () => ({ supportsNativeIosAuth: mocks.ios, supportsNativeSocialAuth: mocks.supports }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: { credential: vi.fn(() => "google-credential") },
  OAuthProvider: class { credential = mocks.appleCredential; },
  signInWithCredential: mocks.signIn, updateProfile: mocks.update
}));
import { signInWithNativeSocialProvider } from "./nativeSocialAuth";
describe("native authentication credential exchange", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.supports.mockReturnValue(true); mocks.ios.mockReturnValue(true);
    mocks.apple.mockResolvedValue({ credential: { idToken: "identity", nonce: "raw-nonce" }, user: { displayName: "Test Person" } });
    mocks.google.mockResolvedValue({ credential: { idToken: "identity" } });
    mocks.signIn.mockResolvedValue({ user: { displayName: null } });
  });
  it("exchanges Apple's identity with the original nonce and preserves the first name", async () => {
    await signInWithNativeSocialProvider("apple");
    expect(mocks.appleCredential).toHaveBeenCalledWith({ idToken: "identity", rawNonce: "raw-nonce" });
    expect(mocks.update).toHaveBeenCalledWith({ displayName: null }, { displayName: "Test Person" });
  });
  it("never exchanges an Apple token without its nonce", async () => {
    mocks.apple.mockResolvedValue({ credential: { idToken: "identity" } });
    await expect(signInWithNativeSocialProvider("apple")).rejects.toThrow("could not be verified");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("retains existing profile names and supports returning users with no new Apple name", async () => {
    mocks.signIn.mockResolvedValue({ user: { displayName: "Existing" } });
    await signInWithNativeSocialProvider("apple");
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.apple.mockResolvedValue({ credential: { idToken: "identity", nonce: "raw" } });
    await expect(signInWithNativeSocialProvider("apple")).resolves.toBeDefined();
  });
  it("leaves Firebase unsigned when native authorization is cancelled", async () => {
    mocks.apple.mockRejectedValue(new Error("cancelled"));
    await expect(signInWithNativeSocialProvider("apple")).rejects.toThrow("cancelled");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("rejects unsupported shells before starting native authorization", async () => {
    mocks.supports.mockReturnValue(false);
    await expect(signInWithNativeSocialProvider("google")).rejects.toThrow("update Ascend");
    expect(mocks.google).not.toHaveBeenCalled();
  });
  it("uses the existing Google credential exchange", async () => {
    await signInWithNativeSocialProvider("google");
    expect(mocks.signIn).toHaveBeenCalledWith({}, "google-credential");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
