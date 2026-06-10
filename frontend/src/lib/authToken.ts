import { getFirebaseClientAuth } from "./firebase";

export async function getFirebaseToken() {
  const user = getFirebaseClientAuth().currentUser;
  if (!user) return undefined;
  return user.getIdToken();
}
