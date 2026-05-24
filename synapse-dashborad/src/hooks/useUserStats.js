"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { emptyUserStats, getMomentumWeekDates, listenToUserStats, listenToWeeklyMomentum } from "../services/userStats";
import { formatDateKey } from "../services/todos";

function buildEmptyWeeklyProgress() {
  const todayKey = formatDateKey();

  return getMomentumWeekDates().map((day) => ({
    ...day,
    completed: false,
    isCurrent: day.dateKey === todayKey,
    isFuture: day.dateKey > todayKey,
    isMissed: day.dateKey < todayKey,
    state: day.dateKey === todayKey ? "current" : day.dateKey < todayKey ? "missed" : "future"
  }));
}

export function useUserStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState(emptyUserStats);
  const [weeklyProgress, setWeeklyProgress] = useState(buildEmptyWeeklyProgress);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setStats(emptyUserStats);
      setWeeklyProgress(buildEmptyWeeklyProgress());
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return listenToUserStats(
      user.uid,
      (nextStats) => {
        setStats(nextStats);
        setError("");
        setLoading(false);
      },
      (statsError) => {
        setError(statsError.message || "Unable to load SYNAPSE Momentum.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return listenToWeeklyMomentum(
      user.uid,
      (nextProgress) => {
        setWeeklyProgress(nextProgress);
      },
      (momentumError) => {
        setError(momentumError.message || "Unable to load weekly Momentum.");
      }
    );
  }, [user?.uid]);

  return {
    stats,
    weeklyProgress,
    loading,
    error
  };
}
