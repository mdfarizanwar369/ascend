import { onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "./firebase";

let tokenRequest: Promise<string> | null = null;
let forcedTokenRequest: Promise<string> | null = null;

async function resolveFirebaseToken(forceRefresh: boolean) {
  await waitForFirebasePersistence();
  const auth = getFirebaseClientAuth();
  const user = auth.currentUser ?? (await waitForFirebaseUser());
  if (!user) throw new Error("Authentication is still loading. Please wait a moment and try again.");
  return user.getIdToken(forceRefresh);
}

export function getFirebaseToken(forceRefresh = false) {
  if (forceRefresh) {
    if (!forcedTokenRequest) {
      const request = resolveFirebaseToken(true).finally(() => {
        if (forcedTokenRequest === request) forcedTokenRequest = null;
      });
      forcedTokenRequest = request;
    }
    return forcedTokenRequest;
  }

  if (forcedTokenRequest) return forcedTokenRequest;
  if (!tokenRequest) {
    const request = resolveFirebaseToken(false).finally(() => {
      if (tokenRequest === request) tokenRequest = null;
    });
    tokenRequest = request;
  }
  return tokenRequest;
}

function waitForFirebaseUser() {
  const auth = getFirebaseClientAuth();

  return new Promise<User | null>((resolve) => {
    let unsubscribe = () => {};

    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 8000);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}
