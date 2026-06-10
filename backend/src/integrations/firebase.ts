import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../config/env";

export function getFirebaseAuth() {
  if (!getApps().length) {
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && privateKey) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey
        })
      });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  }

  return getAuth();
}
