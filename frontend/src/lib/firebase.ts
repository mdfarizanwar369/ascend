import { getApps, initializeApp } from "firebase/app";
import type { FirebaseApp } from "firebase/app";
import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, setPersistence } from "firebase/auth";

let persistenceReady: Promise<void> | null = null;

export function getFirebaseClientApp(): FirebaseApp {
  if (typeof window === "undefined") {
    throw new Error("Firebase is only available in the browser.");
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
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
