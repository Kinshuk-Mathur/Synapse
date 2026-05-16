import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { COLLECTIONS } from "./firestore";
import { getFirebaseDb } from "../lib/firebase";

export const TODO_PRIORITIES = ["High", "Medium", "Low"];

export function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isDateLocked(dateKey) {
  return dateKey < formatDateKey();
}

export function listenToUserTodos(uid, onNext, onError) {
  if (!uid) {
    return () => {};
  }

  const db = getFirebaseDb();
  const todosQuery = query(collection(db, COLLECTIONS.todos), where("uid", "==", uid));

  return onSnapshot(
    todosQuery,
    (snapshot) => {
      const todos = snapshot.docs.map((todoDoc) => ({
        id: todoDoc.id,
        ...todoDoc.data()
      }));

      todos.sort((a, b) => {
        const dateCompare = String(a.selectedDate || "").localeCompare(String(b.selectedDate || ""));
        if (dateCompare !== 0) return dateCompare;
        return String(a.createdLocal || "").localeCompare(String(b.createdLocal || ""));
      });

      onNext(todos);
    },
    onError
  );
}

export async function addTodo(uid, payload) {
  if (!uid) {
    throw new Error("You must be signed in to add a task.");
  }

  const selectedDate = payload.selectedDate || formatDateKey();
  const db = getFirebaseDb();

  return addDoc(collection(db, COLLECTIONS.todos), {
    uid,
    task: payload.task.trim(),
    note: payload.note?.trim() || "",
    time: payload.time || "09:00",
    priority: TODO_PRIORITIES.includes(payload.priority) ? payload.priority : "Medium",
    selectedDate,
    completed: false,
    locked: isDateLocked(selectedDate),
    status: "active",
    createdLocal: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateTodo(todoId, payload) {
  const db = getFirebaseDb();
  const todoRef = doc(db, COLLECTIONS.todos, todoId);

  return updateDoc(todoRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTodo(todoId) {
  const db = getFirebaseDb();
  return deleteDoc(doc(db, COLLECTIONS.todos, todoId));
}

export async function lockPastTodos(todos) {
  const unlockedPastTodos = todos.filter(
    (todo) => todo.id && !todo.locked && todo.selectedDate && isDateLocked(todo.selectedDate)
  );

  if (!unlockedPastTodos.length) {
    return;
  }

  const db = getFirebaseDb();
  const batch = writeBatch(db);

  unlockedPastTodos.forEach((todo) => {
    batch.update(doc(db, COLLECTIONS.todos, todo.id), {
      locked: true,
      status: todo.completed ? "completed" : "pending",
      lockedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

export async function upsertTodoDaySummary(uid, selectedDate, todosForDate) {
  if (!uid || !selectedDate) {
    return;
  }

  const total = todosForDate.length;
  const completedCount = todosForDate.filter((todo) => todo.completed).length;
  const pendingCount = total - completedCount;
  const db = getFirebaseDb();

  await setDoc(
    doc(db, COLLECTIONS.analytics, `${uid}_${selectedDate}`),
    {
      uid,
      type: "todoDay",
      selectedDate,
      total,
      completedCount,
      pendingCount,
      allCompleted: total > 0 && pendingCount === 0,
      status: total === 0 ? "empty" : pendingCount === 0 ? "completed" : "pending",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
