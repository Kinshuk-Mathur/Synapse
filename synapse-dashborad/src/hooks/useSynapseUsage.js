"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "../services/firestore";
import {
  fetchCurrentUsage,
  getCurrentWindowId,
  getMinutesUntilNextUsageReset,
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

function getOverallPercent(usage) {
  const aiPercent = (usage.aiInteractions / SYNAPSE_FREE_PLAN_LIMITS.aiInteractions) * 100;
  const pdfPercent = (usage.pdfUploads / SYNAPSE_FREE_PLAN_LIMITS.pdfUploads) * 100;
  const voicePercent = (usage.voiceSessions / SYNAPSE_FREE_PLAN_LIMITS.voiceSessions) * 100;

  return Math.min(100, Math.max(0, Math.round((aiPercent + pdfPercent + voicePercent) / 3)));
}

export function useSynapseUsage(uid) {
  const [usage, setUsage] = useState(emptyUsage);
  const [windowId, setWindowId] = useState(() => (uid ? getCurrentWindowId(uid) : ""));
  const [minutesUntilReset, setMinutesUntilReset] = useState(() => getMinutesUntilNextUsageReset());
  const [loading, setLoading] = useState(Boolean(uid));

  useEffect(() => {
    setWindowId(uid ? getCurrentWindowId(uid) : "");
    setMinutesUntilReset(getMinutesUntilNextUsageReset());
    setLoading(Boolean(uid));

    if (!uid) {
      setUsage(emptyUsage);
    }
  }, [uid]);

  useEffect(() => {
    const tick = () => {
      setMinutesUntilReset(getMinutesUntilNextUsageReset());

      if (uid) {
        setWindowId((currentWindowId) => {
          const nextWindowId = getCurrentWindowId(uid);
          return nextWindowId === currentWindowId ? currentWindowId : nextWindowId;
        });
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 60000);
    return () => window.clearInterval(intervalId);
  }, [uid]);

  useEffect(() => {
    if (!uid || !windowId) {
      setUsage(emptyUsage);
      setLoading(false);
      return undefined;
    }

    let active = true;
    const usageRef = doc(getFirebaseDb(), COLLECTIONS.users, uid, "usage", windowId);

    setLoading(true);

    fetchCurrentUsage(uid)
      .then((currentUsage) => {
        if (!active) return;
        setUsage(normalizeUsage(currentUsage));
        setMinutesUntilReset(currentUsage.minutesUntilReset);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });

    const unsubscribe = onSnapshot(
      usageRef,
      (snapshot) => {
        if (!active) return;
        setUsage(snapshot.exists() ? normalizeUsage(snapshot.data()) : emptyUsage);
        setMinutesUntilReset(getMinutesUntilNextUsageReset());
        setLoading(false);
      },
      () => {
        if (!active) return;
        setLoading(false);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [uid, windowId]);

  const overallPercent = useMemo(() => getOverallPercent(usage), [usage]);

  return {
    usage,
    limits: SYNAPSE_FREE_PLAN_LIMITS,
    minutesUntilReset,
    overallPercent,
    loading
  };
}
