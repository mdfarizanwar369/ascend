import { onAuthStateChanged, User } from "firebase/auth";
import { getFirebaseClientAuth } from "./firebase";

export async function getFirebaseToken() {
  const auth = getFirebaseClientAuth();
  const user = auth.currentUser ?? (await waitForFirebaseUser());
  if (!user) return undefined;
  return user.getIdToken(true);
}

function waitForFirebaseUser() {
  const auth = getFirebaseClientAuth();

  return new Promise<User | null>((resolve) => {
    let unsubscribe = () => {};

    const timeout = window.setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 3000);

    unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}
