"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  addMonthlyGoal,
  buildGoalProgressTrend,
  deleteMonthlyGoal,
  listenToMonthlyGoals,
  updateMonthlyGoal
} from "../services/monthlyGoals";

export function useMonthlyGoals(selectedMonth, selectedYear) {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setGoals([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return listenToMonthlyGoals(
      user.uid,
      (nextGoals) => {
        setGoals(nextGoals);
        setError("");
        setLoading(false);
      },
      (goalError) => {
        setError(goalError.message || "Unable to load monthly goals.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const selectedGoals = useMemo(
    () =>
      goals.filter(
        (goal) => Number(goal.month) === Number(selectedMonth) && Number(goal.year) === Number(selectedYear)
      ),
    [goals, selectedMonth, selectedYear]
  );

  const monthStats = useMemo(() => {
    const stats = new Map();

    goals.forEach((goal) => {
      const key = `${goal.year}-${goal.month}`;
      const current = stats.get(key) || {
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        progressTotal: 0
      };

      current.total += 1;
      current.progressTotal += Number(goal.progress) || 0;

      if (goal.completed || goal.status === "Completed") current.completed += 1;
      if (!goal.completed && goal.status === "In Progress") current.inProgress += 1;
      if (!goal.completed && goal.status === "Not Started") current.notStarted += 1;

      stats.set(key, current);
    });

    stats.forEach((value) => {
      value.averageProgress = value.total ? Math.round(value.progressTotal / value.total) : 0;
    });

    return stats;
  }, [goals]);

  const selectedTrend = useMemo(
    () => buildGoalProgressTrend(selectedGoals, Number(selectedMonth), Number(selectedYear)),
    [selectedGoals, selectedMonth, selectedYear]
  );

  const createGoal = useCallback(
    async (payload) => {
      await addMonthlyGoal(user.uid, payload);
    },
    [user?.uid]
  );

  const editGoal = useCallback(
    async (goal, payload) => {
      await updateMonthlyGoal(user.uid, goal.id, payload);
    },
    [user?.uid]
  );

  const removeGoal = useCallback(
    async (goal) => {
      await deleteMonthlyGoal(user.uid, goal.id);
    },
    [user?.uid]
  );

  return {
    goals,
    selectedGoals,
    selectedTrend,
    monthStats,
    loading,
    error,
    setError,
    createGoal,
    editGoal,
    removeGoal
  };
}
