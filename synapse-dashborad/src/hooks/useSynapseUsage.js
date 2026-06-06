"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "../services/firestore";
import {
  fetchCurrentUsage,
  getMinutesUntilWindowReset,
  SYNAPSE_FREE_PLAN_LIMITS
} from "../services/usageLimits";

const emptyUsage = {
  aiInteractions: 0,
  pdfUploads: 0,
  voiceSessions: 0
};

function normalizeUsage(data = {}) {
  return {
    aiInteractions: Math.max(0, Math.floor(Number(data.aiInteractions) || 0)),
    pdfUploads: Math.max(0, Math.floor(Number(data.pdfUploads) || 0)),
    voiceSessions: Math.max(0, Math.floor(Number(data.voiceSessions) || 0))
  };
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function getOverallPercent(usage) {
  const aiPercent = (usage.aiInteractions / SYNAPSE_FREE_PLAN_LIMITS.aiInteractions) * 100;
  const pdfPercent = (usage.pdfUploads / SYNAPSE_FREE_PLAN_LIMITS.pdfUploads) * 100;
  const voicePercent = (usage.voiceSessions / SYNAPSE_FREE_PLAN_LIMITS.voiceSessions) * 100;

  return Math.min(100, Math.max(0, Math.round((aiPercent + pdfPercent + voicePercent) / 3)));
}

export function useSynapseUsage(uid) {
  const [usage, setUsage] = useState(emptyUsage);
  const [windowId, setWindowId] = useState("");
  const [windowExpiry, setWindowExpiry] = useState(null);
  const [minutesUntilReset, setMinutesUntilReset] = useState(0);
  const [hasActiveWindow, setHasActiveWindow] = useState(false);
  const [loading, setLoading] = useState(Boolean(uid));

  const applyUsageState = useCallback((currentUsage) => {
    const expiry = toDate(currentUsage?.windowExpiry);
    const active = Boolean(currentUsage?.hasActiveWindow && expiry && expiry > new Date());

    setUsage(active ? normalizeUsage(currentUsage) : emptyUsage);
    setWindowId(active ? currentUsage.windowId || "" : "");
    setWindowExpiry(active ? expiry : null);
    setMinutesUntilReset(active ? getMinutesUntilWindowReset(expiry) : 0);
    setHasActiveWindow(active);
  }, []);

  const refreshUsage = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!uid) {
        setUsage(emptyUsage);
        setWindowId("");
        setWindowExpiry(null);
        setMinutesUntilReset(0);
        setHasActiveWindow(false);
        setLoading(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      try {
        const currentUsage = await fetchCurrentUsage(uid);
        applyUsageState(currentUsage);
      } finally {
        setLoading(false);
      }
    },
    [applyUsageState, uid]
  );

  useEffect(() => {
    let cancelled = false;

    const refreshIfActive = async (options) => {
      if (cancelled) return;
      await refreshUsage(options);
    };

    refreshIfActive({ showLoading: true });
    const intervalId = window.setInterval(() => {
      refreshIfActive();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [refreshUsage]);

  useEffect(() => {
    if (!uid || !windowId || !hasActiveWindow) {
      return undefined;
    }

    const usageRef = doc(getFirebaseDb(), COLLECTIONS.users, uid, "usage", windowId);

    return onSnapshot(usageRef, (snapshot) => {
      if (!snapshot.exists()) {
        applyUsageState({ hasActiveWindow: false });
        return;
      }

      applyUsageState({
        windowId: snapshot.id,
        hasActiveWindow: true,
        ...snapshot.data()
      });
    });
  }, [applyUsageState, hasActiveWindow, uid, windowId]);

  useEffect(() => {
    if (!windowExpiry) return undefined;

    const tick = () => {
      const nextMinutes = getMinutesUntilWindowReset(windowExpiry);

      setMinutesUntilReset(nextMinutes);

      if (nextMinutes <= 0) {
        refreshUsage();
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 30000);
    return () => window.clearInterval(intervalId);
  }, [refreshUsage, windowExpiry]);

  const overallPercent = useMemo(() => getOverallPercent(usage), [usage]);

  return {
    usage,
    limits: SYNAPSE_FREE_PLAN_LIMITS,
    minutesUntilReset,
    hasActiveWindow,
    overallPercent,
    loading
  };
}
