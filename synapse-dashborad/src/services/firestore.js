import {
  collection,
  doc,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";
import { db } from "../lib/firebase";

export const COLLECTIONS = {
  users: "users",
  todos: "todos",
  goals: "goals",
  focusSessions: "focusSessions",
  analytics: "analytics"
};

export const collectionRefs = {
  users: collection(db, COLLECTIONS.users),
  todos: collection(db, COLLECTIONS.todos),
  goals: collection(db, COLLECTIONS.goals),
  focusSessions: collection(db, COLLECTIONS.focusSessions),
  analytics: collection(db, COLLECTIONS.analytics)
};

export async function createUserProfile(user) {
  if (!user?.uid) {
    throw new Error("Cannot create a user profile without an authenticated user.");
  }

  const userRef = doc(db, COLLECTIONS.users, user.uid);
  const snapshot = await getDoc(userRef);

  const baseProfile = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "Student",
    photoURL: user.photoURL ?? "",
    provider: "google",
    updatedAt: serverTimestamp()
  };

  await setDoc(
    userRef,
    snapshot.exists()
      ? baseProfile
      : {
          ...baseProfile,
          createdAt: serverTimestamp()
        },
    { merge: true }
  );

  return userRef;
}

export function userScopedQuery(collectionName, uid) {
  if (!COLLECTIONS[collectionName]) {
    throw new Error(`Unknown Firestore collection: ${collectionName}`);
  }

  if (!uid) {
    throw new Error("A user id is required for user-scoped Firestore queries.");
  }

  return query(collection(db, COLLECTIONS[collectionName]), where("userId", "==", uid));
}

export function userDoc(collectionName, uid, documentId) {
  if (!COLLECTIONS[collectionName]) {
    throw new Error(`Unknown Firestore collection: ${collectionName}`);
  }

  if (!uid || !documentId) {
    throw new Error("A user id and document id are required.");
  }

  return doc(db, COLLECTIONS[collectionName], `${uid}_${documentId}`);
}
