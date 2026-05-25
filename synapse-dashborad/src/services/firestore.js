import {
  collection,
  doc,
  getDoc,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";

export const COLLECTIONS = {
  users: "users",
  aiMemory: "aiMemory",
  todos: "todos",
  monthlyGoals: "monthlyGoals",
  goals: "goals",
  focusSessions: "focusSessions",
  aiUsage: "aiUsage",
  analytics: "analytics",
  dailyProgress: "dailyProgress",
  notifications: "notifications"
};

export function getCollectionRefs() {
  const db = getFirebaseDb();

  return {
    users: collection(db, COLLECTIONS.users),
    aiMemory: collection(db, COLLECTIONS.aiMemory),
    todos: collection(db, COLLECTIONS.todos),
    monthlyGoals: collection(db, COLLECTIONS.monthlyGoals),
    goals: collection(db, COLLECTIONS.goals),
    focusSessions: collection(db, COLLECTIONS.focusSessions),
    aiUsage: collection(db, COLLECTIONS.aiUsage),
    analytics: collection(db, COLLECTIONS.analytics)
  };
}

export async function createUserProfile(user) {
  if (!user?.uid) {
    throw new Error("Cannot create a user profile without an authenticated user.");
  }

  const db = getFirebaseDb();
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
          onboardingCompleted: false,
          createdAt: serverTimestamp()
        },
    { merge: true }
  );

  const nextSnapshot = await getDoc(userRef);
  return nextSnapshot.exists() ? nextSnapshot.data() : null;
}

export async function getUserProfile(uid) {
  if (!uid) {
    return null;
  }

  const db = getFirebaseDb();
  const userRef = doc(db, COLLECTIONS.users, uid);
  const snapshot = await getDoc(userRef);

  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserOnboarding(uid, data) {
  if (!uid) {
    throw new Error("A user id is required to save onboarding.");
  }

  const db = getFirebaseDb();
  const userRef = doc(db, COLLECTIONS.users, uid);
  const payload = {
    uid,
    ...data,
    onboardingCompleted: true,
    onboardingCompletedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(userRef, payload, { merge: true });
  return getUserProfile(uid);
}

export async function updateUserPersonalization(uid, data) {
  if (!uid) {
    throw new Error("A user id is required to update personalization.");
  }

  const db = getFirebaseDb();
  const userRef = doc(db, COLLECTIONS.users, uid);

  await updateDoc(userRef, {
    ...data,
    updatedAt: serverTimestamp()
  });

  return getUserProfile(uid);
}

export async function saveUserAiMemory(uid, data = {}) {
  if (!uid) {
    return null;
  }

  const db = getFirebaseDb();
  const memoryRef = doc(db, COLLECTIONS.aiMemory, uid);
  const snapshot = await getDoc(memoryRef);
  const previous = snapshot.exists() ? snapshot.data() : {};
  const latestPrompt = String(data.latestPrompt || "").trim();
  const uploadedDocumentNames = Array.isArray(data.uploadedDocumentNames)
    ? data.uploadedDocumentNames.filter(Boolean).slice(0, 12)
    : [];
  const recentChats = Array.isArray(previous.recentChats) ? previous.recentChats : [];
  const recentUploads = Array.isArray(previous.uploadedDocumentNames)
    ? previous.uploadedDocumentNames
    : [];

  const nextUploads = Array.from(new Set([...uploadedDocumentNames, ...recentUploads])).slice(0, 20);
  const nextChats = latestPrompt
    ? [
        {
          prompt: latestPrompt.slice(0, 180),
          createdAt: new Date().toISOString()
        },
        ...recentChats
      ].slice(0, 12)
    : recentChats.slice(0, 12);

  await setDoc(
    memoryRef,
    {
      uid,
      recentChats: nextChats,
      uploadedDocumentNames: nextUploads,
      aiPreferences: data.aiPreferences || previous.aiPreferences || {},
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return {
    recentChats: nextChats,
    uploadedDocumentNames: nextUploads
  };
}

export function userScopedQuery(collectionName, uid) {
  if (!COLLECTIONS[collectionName]) {
    throw new Error(`Unknown Firestore collection: ${collectionName}`);
  }

  if (!uid) {
    throw new Error("A user id is required for user-scoped Firestore queries.");
  }

  const db = getFirebaseDb();
  return query(collection(db, COLLECTIONS[collectionName]), where("uid", "==", uid));
}

export function userDoc(collectionName, uid, documentId) {
  if (!COLLECTIONS[collectionName]) {
    throw new Error(`Unknown Firestore collection: ${collectionName}`);
  }

  if (!uid || !documentId) {
    throw new Error("A user id and document id are required.");
  }

  const db = getFirebaseDb();
  return doc(db, COLLECTIONS[collectionName], `${uid}_${documentId}`);
}
