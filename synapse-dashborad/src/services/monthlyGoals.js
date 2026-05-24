import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";
import { updateMomentumProgress } from "./userStats";

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

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function calculateGoalProgress(current, target) {
  const safeTarget = Math.max(0, Number(target) || 0);
  const safeCurrent = Math.max(0, Number(current) || 0);

  if (!safeTarget) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round((safeCurrent / safeTarget) * 100)));
}

export function getGoalStatus(current, target) {
  const progress = calculateGoalProgress(current, target);

  if (progress >= 100) return "Completed";
  if (progress > 0) return "In Progress";
  return "Not Started";
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function endOfDay(date) {
  const nextDate = new Date(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function endOfMonthDate(month, year) {
  return endOfDay(new Date(Number(year), Number(month), 0));
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const dateKeyDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : null;
    const parsedDate = dateKeyDate || new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  return null;
}

function deadlineTimestampFromPayload(deadline, month, year) {
  const parsedDeadline = coerceDate(deadline) || endOfMonthDate(month, year);
  return Timestamp.fromDate(endOfDay(parsedDeadline));
}

function monthInfoFromGoal(data, fallbackDate) {
  const storedMonth = Number(data.month);
  const storedYear = Number(data.year);

  if (storedMonth && storedYear) {
    return {
      month: storedMonth,
      year: storedYear
    };
  }

  const sourceDate = coerceDate(data.deadline) || fallbackDate || new Date();

  return {
    month: sourceDate.getMonth() + 1,
    year: sourceDate.getFullYear()
  };
}

function createProgressEntry(goal, recordedAt = new Date()) {
  return {
    progress: goal.progress,
    current: goal.current,
    target: goal.target,
    completed: goal.completed,
    dateKey: formatDateKey(recordedAt),
    recordedAt: recordedAt.toISOString()
  };
}

function normalizeProgressEntry(entry) {
  const recordedAtDate = coerceDate(entry?.recordedAt) || coerceDate(entry?.updatedAt);

  return {
    progress: Math.min(100, Math.max(0, Number(entry?.progress) || 0)),
    current: Math.max(0, Number(entry?.current) || 0),
    target: Math.max(1, Number(entry?.target) || 1),
    completed: Boolean(entry?.completed),
    dateKey: entry?.dateKey || (recordedAtDate ? formatDateKey(recordedAtDate) : ""),
    recordedAt: entry?.recordedAt || "",
    recordedAtDate
  };
}

function normalizeGoalPayload(payload) {
  const selectedMonth = Number(payload.month) || getCurrentGoalMonth().month;
  const selectedYear = Number(payload.year) || getCurrentGoalMonth().year;
  const target = Math.max(1, Number(payload.target) || 1);
  const current = Math.max(0, Number(payload.current ?? payload.currentProgress) || 0);
  const progress = calculateGoalProgress(current, target);

  return {
    title: String(payload.title || "").trim(),
    description: payload.description?.trim() || "",
    target,
    current,
    progress,
    deadline: deadlineTimestampFromPayload(payload.deadline, selectedMonth, selectedYear),
    completed: progress >= 100,
    category: GOAL_CATEGORIES.includes(payload.category) ? payload.category : "Study",
    notes: payload.notes?.trim() || "",
    month: selectedMonth,
    monthName: getMonthName(selectedMonth),
    year: selectedYear
  };
}

function normalizeGoalDoc(goalDoc) {
  const data = goalDoc.data();
  const createdDate = coerceDate(data.createdAt) || coerceDate(data.createdLocal);
  const updatedDate = coerceDate(data.updatedAt) || coerceDate(data.updatedLocal);
  const monthInfo = monthInfoFromGoal(data, createdDate);
  const target = Math.max(1, Number(data.target) || 1);
  const current = Math.max(0, Number(data.current ?? data.currentProgress) || 0);
  const progress = calculateGoalProgress(current, target);
  const deadlineDate = coerceDate(data.deadline);
  const progressHistory = Array.isArray(data.progressHistory)
    ? data.progressHistory.map(normalizeProgressEntry).filter((entry) => entry.recordedAtDate)
    : [];

  if (!progressHistory.length && (createdDate || updatedDate)) {
    progressHistory.push(
      normalizeProgressEntry({
        progress,
        current,
        target,
        completed: progress >= 100,
        recordedAt: (updatedDate || createdDate).toISOString()
      })
    );
  }

  progressHistory.sort((a, b) => a.recordedAtDate - b.recordedAtDate);

  return {
    id: goalDoc.id,
    ...data,
    ...monthInfo,
    monthName: getMonthName(monthInfo.month),
    target,
    current,
    currentProgress: current,
    progress,
    progressPercentage: progress,
    completed: Boolean(data.completed) || progress >= 100,
    status: getGoalStatus(current, target),
    deadlineDate,
    deadlineDateKey: deadlineDate ? formatDateKey(deadlineDate) : "",
    deadlineText: formatDeadlineStatus(deadlineDate),
    createdDate,
    updatedDate,
    progressHistory
  };
}

function goalCollection(uid) {
  const db = getFirebaseDb();
  return collection(db, COLLECTIONS.users, uid, COLLECTIONS.goals);
}

function goalDocument(uid, goalId) {
  const db = getFirebaseDb();
  return doc(db, COLLECTIONS.users, uid, COLLECTIONS.goals, goalId);
}

export function formatDeadlineStatus(deadline, now = new Date()) {
  const deadlineDate = coerceDate(deadline);

  if (!deadlineDate) {
    return "No deadline";
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineStart = new Date(
    deadlineDate.getFullYear(),
    deadlineDate.getMonth(),
    deadlineDate.getDate()
  );
  const daysLeft = Math.ceil((deadlineStart - todayStart) / DAY_MS);

  if (daysLeft < 0) return "Deadline passed";
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

export function buildGoalProgressTrend(goals = [], month, year) {
  const ranges = [
    { label: "Week 1", start: new Date(year, month - 1, 1), end: endOfDay(new Date(year, month - 1, 7)) },
    { label: "Week 2", start: new Date(year, month - 1, 8), end: endOfDay(new Date(year, month - 1, 14)) },
    { label: "Week 3", start: new Date(year, month - 1, 15), end: endOfDay(new Date(year, month - 1, 21)) },
    { label: "Week 4", start: new Date(year, month - 1, 22), end: endOfMonthDate(month, year) }
  ];

  return ranges.map((range) => {
    const values = goals
      .map((goal) => {
        const createdDate = goal.createdDate || goal.updatedDate;
        const history = (goal.progressHistory || []).filter(
          (entry) => entry.recordedAtDate && entry.recordedAtDate <= range.end
        );

        if (history.length) {
          return history[history.length - 1].progress;
        }

        if (createdDate && createdDate <= range.end) {
          return 0;
        }

        return null;
      })
      .filter((value) => value !== null);

    const value = values.length
      ? Math.round(values.reduce((total, item) => total + item, 0) / values.length)
      : 0;

    return {
      ...range,
      value
    };
  });
}

export function listenToMonthlyGoals(uid, onNext, onError) {
  if (!uid) {
    return () => {};
  }

  return onSnapshot(
    goalCollection(uid),
    (snapshot) => {
      const goals = snapshot.docs.map(normalizeGoalDoc);

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

  const createdLocal = new Date().toISOString();
  const normalizedGoal = normalizeGoalPayload(payload);
  const createdAtDate = new Date(createdLocal);
  const goalRef = await addDoc(goalCollection(uid), {
    ...normalizedGoal,
    progressHistory: [createProgressEntry(normalizedGoal, createdAtDate)],
    createdLocal,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  if (normalizedGoal.current > 0 || normalizedGoal.completed) {
    await updateMomentumProgress(uid, { pillar: "goal" });
  }
  return goalRef;
}

export async function updateMonthlyGoal(uid, goalId, payload) {
  if (!uid || !goalId) {
    throw new Error("A user id and goal id are required to update a goal.");
  }

  const goalRef = goalDocument(uid, goalId);
  const snapshot = await getDoc(goalRef);
  const previous = snapshot.exists() ? normalizeGoalDoc(snapshot) : null;
  const normalizedGoal = normalizeGoalPayload(payload);
  const updatePayload = {
    ...normalizedGoal,
    updatedAt: serverTimestamp(),
    updatedLocal: new Date().toISOString()
  };

  if (
    !previous ||
    previous.current !== normalizedGoal.current ||
    previous.target !== normalizedGoal.target ||
    previous.progress !== normalizedGoal.progress ||
    previous.completed !== normalizedGoal.completed
  ) {
    updatePayload.progressHistory = arrayUnion(createProgressEntry(normalizedGoal));
  }

  const progressChanged = Boolean(updatePayload.progressHistory);

  await updateDoc(goalRef, updatePayload);

  if (progressChanged) {
    await updateMomentumProgress(uid, { pillar: "goal" });
  }
}

export async function deleteMonthlyGoal(uid, goalId) {
  if (!uid || !goalId) {
    throw new Error("A user id and goal id are required to delete a goal.");
  }

  await deleteDoc(goalDocument(uid, goalId));
}
