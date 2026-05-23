"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { emptyUserStats, listenToUserStats } from "../services/userStats";

export function useUserStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState(emptyUserStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.uid) {
      setStats(emptyUserStats);
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
        setError(statsError.message || "Unable to load your streak.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  return {
    stats,
    loading,
    error
  };
}
