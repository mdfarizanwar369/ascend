import { onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "./firebase";
import { englishMessage } from "./i18n/static";

let tokenRequest: Promise<string> | null = null;
let forcedTokenRequest: Promise<string> | null = null;
let cachedToken: { token: string; expiresAt: number; uid: string } | null = null;

function localE2EAuthToken() {
  if (process.env.NODE_ENV === "production") return null;
  const token = process.env.NEXT_PUBLIC_ASCEND_E2E_AUTH_TOKEN;
  if (!token || typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" ? token : null;
}

function parseTokenExpiry(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    if (!decoded.exp) return null;
    return decoded.exp * 1000;
  } catch {
    return null;
  }
}

async function resolveFirebaseToken(forceRefresh: boolean) {
  await waitForFirebasePersistence();
  const auth = getFirebaseClientAuth();
  const user = auth.currentUser ?? (await waitForFirebaseUser());
  if (!user) throw new Error(englishMessage("auth.stillLoading"));
  if (!forceRefresh && cachedToken && cachedToken.uid === user.uid && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const token = await user.getIdToken(forceRefresh);
  const expiresAt = parseTokenExpiry(token) ?? (Date.now() + 55 * 60 * 1000);
  cachedToken = { token, expiresAt, uid: user.uid };
  return token;
}

export function getFirebaseToken(forceRefresh = false) {
  const e2eToken = localE2EAuthToken();
  if (e2eToken) return Promise.resolve(e2eToken);

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
