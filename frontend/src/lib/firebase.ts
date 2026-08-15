import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, indexedDBLocalPersistence, setPersistence } from "firebase/auth";

let persistenceReady: Promise<void> | null = null;
let authEmulatorConnected = false;

function getFirebaseAuthDomain() {
  const configuredDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === "getascend.fit" || hostname === "www.getascend.fit") {
      return "www.getascend.fit";
    }
  }
  return configuredDomain;
}

export function getFirebaseClientApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only available in the browser.");
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: getFirebaseAuthDomain(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  };

  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Firebase web app environment variables are not configured.");
  }

  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

export function getFirebaseClientAuth() {
  const firebaseApp = getFirebaseClientApp();
  const auth = getAuth(firebaseApp);
  const authEmulatorUrl = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL?.trim();

  if (authEmulatorUrl && !authEmulatorConnected) {
    connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
    authEmulatorConnected = true;
  }

  persistenceReady ??= setPersistence(auth, browserLocalPersistence)
    .catch(() => setPersistence(auth, indexedDBLocalPersistence))
    .catch(() => {});
  return auth;
}

export async function waitForFirebasePersistence() {
  const auth = getFirebaseClientAuth();
  await persistenceReady;
  if ("authStateReady" in auth && typeof auth.authStateReady === "function") {
    await Promise.race([
      auth.authStateReady(),
      new Promise((resolve) => window.setTimeout(resolve, 3500))
    ]);
  }
}
