"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  addTodo,
  deleteTodo,
  formatDateKey,
  isDateLocked,
  listenToUserTodos,
  lockPastTodos,
  updateTodo,
  upsertTodoDaySummary
} from "../services/todos";

export function useTodos(selectedDate) {
  const { user } = useAuth();
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setTodos([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return listenToUserTodos(
      user.uid,
      async (nextTodos) => {
        setTodos(nextTodos);
        setError("");
        setLoading(false);

        try {
          await lockPastTodos(nextTodos);
        } catch (lockError) {
          setError(lockError.message || "Unable to lock previous day tasks.");
        }
      },
      (snapshotError) => {
        setError(snapshotError.message || "Unable to load your tasks.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const tasksForSelectedDate = useMemo(
    () => todos.filter((todo) => todo.selectedDate === selectedDate),
    [todos, selectedDate]
  );

  const pendingCarryovers = useMemo(
    () =>
      todos
        .filter((todo) => todo.selectedDate < formatDateKey() && !todo.completed)
        .sort((a, b) => String(b.selectedDate).localeCompare(String(a.selectedDate)))
        .slice(0, 5),
    [todos]
  );

  const calendarStats = useMemo(() => {
    const stats = new Map();

    todos.forEach((todo) => {
      if (!todo.selectedDate) return;

      const current = stats.get(todo.selectedDate) || {
        total: 0,
        completed: 0,
        pending: 0
      };

      current.total += 1;
      if (todo.completed) current.completed += 1;
      if (!todo.completed) current.pending += 1;
      stats.set(todo.selectedDate, current);
    });

    return stats;
  }, [todos]);

  useEffect(() => {
    if (!user?.uid || loading) return;

    upsertTodoDaySummary(user.uid, selectedDate, tasksForSelectedDate).catch((summaryError) => {
      setError(summaryError.message || "Unable to sync day summary.");
    });
  }, [user?.uid, loading, selectedDate, tasksForSelectedDate]);

  const createTodo = useCallback(
    async (payload) => {
      if (isDateLocked(payload.selectedDate)) {
        throw new Error("This day is locked. Choose today or a future date.");
      }

      await addTodo(user.uid, payload);
    },
    [user?.uid]
  );

  const toggleTodo = useCallback(async (todo) => {
    if (todo.locked || isDateLocked(todo.selectedDate)) {
      throw new Error("Locked tasks cannot be changed.");
    }

    await updateTodo(todo.id, {
      completed: !todo.completed,
      status: !todo.completed ? "completed" : "active"
    });
  }, []);

  const editTodo = useCallback(async (todo, payload) => {
    if (todo.locked || isDateLocked(todo.selectedDate)) {
      throw new Error("Locked tasks cannot be edited.");
    }

    await updateTodo(todo.id, {
      task: payload.task.trim(),
      note: payload.note?.trim() || "",
      time: payload.time || todo.time || "09:00",
      priority: payload.priority || todo.priority || "Medium"
    });
  }, []);

  const removeTodo = useCallback(async (todo) => {
    if (todo.locked || isDateLocked(todo.selectedDate)) {
      throw new Error("Locked tasks cannot be deleted.");
    }

    await deleteTodo(todo.id);
  }, []);

  return {
    todos,
    tasksForSelectedDate,
    pendingCarryovers,
    calendarStats,
    loading,
    error,
    setError,
    createTodo,
    toggleTodo,
    editTodo,
    removeTodo
  };
}
