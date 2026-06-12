import { onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseClientAuth, waitForFirebasePersistence } from "./firebase";

export async function getFirebaseToken() {
  await waitForFirebasePersistence();
  const auth = getFirebaseClientAuth();
  const user = auth.currentUser ?? (await waitForFirebaseUser());
  if (!user) throw new Error("Authentication is still loading. Please wait a moment and try again.");
  return user.getIdToken();
}

function waitForFirebaseUser() {
  const auth = getFirebaseClientAuth();

  return new Promise<User | null>((resolve) => {
    let unsubscribe = () => {};

    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 30000);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}
