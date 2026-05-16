import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";

export const GOAL_CATEGORIES = ["Study", "Coding", "Fitness", "Content", "Personal"];
export const GOAL_FILTERS = ["All", "In Progress", "Completed", "Not Started"];

export const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

export function getCurrentGoalMonth() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
}

export function getMonthName(month) {
  return monthNames[Math.max(0, Math.min(11, Number(month) - 1))] || "Month";
}

export function calculateGoalProgress(currentProgress, target) {
  const safeTarget = Math.max(0, Number(target) || 0);
  const safeCurrent = Math.max(0, Number(currentProgress) || 0);

  if (!safeTarget) {
    return 0;
  }

  return Math.min(100, Math.round((safeCurrent / safeTarget) * 100));
}

export function getGoalStatus(currentProgress, target) {
  const progressPercentage = calculateGoalProgress(currentProgress, target);

  if (progressPercentage >= 100) return "Completed";
  if (progressPercentage > 0) return "In Progress";
  return "Not Started";
}

function normalizeGoalPayload(payload) {
  const target = Math.max(1, Number(payload.target) || 1);
  const currentProgress = Math.max(0, Number(payload.currentProgress) || 0);
  const progressPercentage = calculateGoalProgress(currentProgress, target);
  const status = getGoalStatus(currentProgress, target);
  const month = Number(payload.month) || getCurrentGoalMonth().month;
  const year = Number(payload.year) || getCurrentGoalMonth().year;

  return {
    month,
    monthName: getMonthName(month),
    year,
    title: payload.title.trim(),
    description: payload.description?.trim() || "",
    category: GOAL_CATEGORIES.includes(payload.category) ? payload.category : "Study",
    target,
    currentProgress,
    progressPercentage,
    completed: progressPercentage >= 100,
    status,
    deadline: payload.deadline || "",
    notes: payload.notes?.trim() || ""
  };
}

export function listenToMonthlyGoals(uid, onNext, onError) {
  if (!uid) {
    return () => {};
  }

  const db = getFirebaseDb();
  const goalsQuery = query(collection(db, COLLECTIONS.monthlyGoals), where("uid", "==", uid));

  return onSnapshot(
    goalsQuery,
    (snapshot) => {
      const goals = snapshot.docs.map((goalDoc) => ({
        id: goalDoc.id,
        ...goalDoc.data()
      }));

      goals.sort((a, b) => {
        const yearCompare = Number(a.year || 0) - Number(b.year || 0);
        if (yearCompare !== 0) return yearCompare;
        const monthCompare = Number(a.month || 0) - Number(b.month || 0);
        if (monthCompare !== 0) return monthCompare;
        return String(a.createdLocal || "").localeCompare(String(b.createdLocal || ""));
      });

      onNext(goals);
    },
    onError
  );
}

export async function addMonthlyGoal(uid, payload) {
  if (!uid) {
    throw new Error("You must be signed in to add a goal.");
  }

  const db = getFirebaseDb();

  return addDoc(collection(db, COLLECTIONS.monthlyGoals), {
    uid,
    ...normalizeGoalPayload(payload),
    createdLocal: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateMonthlyGoal(goalId, payload) {
  const db = getFirebaseDb();

  return updateDoc(doc(db, COLLECTIONS.monthlyGoals, goalId), {
    ...normalizeGoalPayload(payload),
    updatedAt: serverTimestamp()
  });
}

export async function deleteMonthlyGoal(goalId) {
  const db = getFirebaseDb();
  return deleteDoc(doc(db, COLLECTIONS.monthlyGoals, goalId));
}
