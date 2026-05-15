import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";
import { COLLECTIONS } from "./firestore";
import { getFirebaseDb } from "../lib/firebase";

export function subscribeToTodos(uid, onNext, onError) {
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
        const first = a.createdAt?.toMillis?.() ?? 0;
        const second = b.createdAt?.toMillis?.() ?? 0;
        return second - first;
      });

      onNext(todos);
    },
    onError
  );
}

export async function addTodo({ uid, task, note, selectedDate, priority, locked }) {
  if (!uid) {
    throw new Error("You must be signed in to add a task.");
  }

  if (!task?.trim()) {
    throw new Error("Task title is required.");
  }

  const db = getFirebaseDb();

  return addDoc(collection(db, COLLECTIONS.todos), {
    uid,
    task: task.trim(),
    note: note?.trim() ?? "",
    completed: false,
    createdAt: serverTimestamp(),
    selectedDate,
    locked: Boolean(locked),
    priority
  });
}

export async function updateTodoCompletion(todoId, completed) {
  if (!todoId) {
    throw new Error("Todo id is required.");
  }

  const db = getFirebaseDb();

  return updateDoc(doc(db, COLLECTIONS.todos, todoId), {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });
}
