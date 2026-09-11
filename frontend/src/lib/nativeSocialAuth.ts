import { GoogleAuthProvider, OAuthProvider, signInWithCredential, updateProfile } from "firebase/auth";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "@/lib/firebase";
import { supportsNativeIosAuth, supportsNativeSocialAuth } from "@/lib/nativePlatform";

export async function signInWithNativeSocialProvider(provider: "google" | "apple") {
  if (!supportsNativeSocialAuth() || (provider === "apple" && !supportsNativeIosAuth())) {
    throw new Error("Please update Ascend in TestFlight to use this sign-in option.");
  }
  const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
  await waitForFirebasePersistence();
  // Keep the operation pending while the user interacts with the native sheet.
  const nativeResult = provider === "apple"
    ? await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true })
    : await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true, useCredentialManager: false });
  const idToken = nativeResult.credential?.idToken;
  if (!idToken) throw new Error("Sign-in did not return an identity token. Please try again.");
  const nonce = nativeResult.credential?.nonce;
  if (provider === "apple" && !nonce) throw new Error("Apple sign-in could not be verified. Please try again.");
  const credential = provider === "apple"
    ? new OAuthProvider("apple.com").credential({ idToken, rawNonce: nonce })
    : GoogleAuthProvider.credential(idToken, nativeResult.credential?.accessToken ?? undefined);
  const userCredential = await signInWithCredential(getFirebaseClientAuth(), credential);
  // Apple supplies a name only on the first authorization. Preserve existing names.
  const displayName = nativeResult.user?.displayName;
  if (provider === "apple" && displayName && !userCredential.user.displayName) {
    await updateProfile(userCredential.user, { displayName });
  }
  return { nativeResult, userCredential };
}
