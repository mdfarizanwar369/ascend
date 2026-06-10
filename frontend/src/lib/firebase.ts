import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export function getFirebaseClientAuth() {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is only available in the browser.");
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
  };

  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId || !firebaseConfig.appId) {
    throw new Error("Firebase web app environment variables are not configured.");
  }

  const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(firebaseApp);
}
