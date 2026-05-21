"use client";

import { useEffect, useRef, useState } from "react";
import {
  emptyFocusSummary,
  listenToFocusSessions,
  recordExtensionFocusPayload
} from "../services/focusSessions";

export function useSynapseFocus(user) {
  const [summary, setSummary] = useState(emptyFocusSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState("waiting");
  const lastPayloadSignatureRef = useRef("");

  useEffect(() => {
    if (!user?.uid) {
      setSummary(emptyFocusSummary);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return listenToFocusSessions(
      user.uid,
      (nextSummary) => {
        setSummary(nextSummary);
        setError("");
        setLoading(false);
      },
      (focusError) => {
        setError(focusError.message || "Unable to load Focus Lock analytics.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || typeof window === "undefined") return undefined;

    let cancelled = false;

    const announceDashboard = () => {
      window.postMessage(
        {
          source: "SYNAPSE_DASHBOARD",
          type: "DASHBOARD_READY",
          uid: user.uid,
          origin: window.location.origin
        },
        window.location.origin
      );
    };

    const handleMessage = async (event) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== "SYNAPSE_FOCUS_EXTENSION" || data.type !== "SYNAPSE_FOCUS_SYNC") return;

      try {
        const stats = data.payload?.stats || {};
        const payloadSignature = JSON.stringify({
          activeSessionId: data.payload?.activeSession?.sessionId || "",
          activeViolations: data.payload?.activeSession?.violations || 0,
          activeFocusScore: data.payload?.activeSession?.focusScore || 100,
          activeStopWarnings: data.payload?.activeSession?.stopWarningCount || 0,
          activeIntervals: Object.values(data.payload?.activeSession?.distractionIntervals || {}).map((interval) => [
            interval.intervalKey,
            interval.count
          ]),
          totalFocusSeconds: stats.totalFocusSeconds || 0,
          sessionsCompleted: stats.sessionsCompleted || 0,
          sessionsStarted: stats.sessionsStarted || 0,
          blockedDistractions: stats.blockedDistractions || 0,
          daily: stats.daily || {},
          history: (stats.sessionHistory || []).map((item) => [
            item.id,
            item.focusSeconds,
            item.violations,
            item.completed,
            item.endedAt,
            item.focusScore,
            item.stopWarningCount,
            item.distractionAttempts?.length || 0,
            item.distractionIntervals?.map((interval) => [interval.intervalKey, interval.count]) || []
          ])
        });

        if (payloadSignature === lastPayloadSignatureRef.current) {
          const syncedAt = Date.now();
          setBridgeStatus("connected");
          window.postMessage(
            {
              source: "SYNAPSE_DASHBOARD",
              type: "SYNAPSE_FOCUS_ACK",
              uid: user.uid,
              syncedAt
            },
            window.location.origin
          );
          return;
        }

        lastPayloadSignatureRef.current = payloadSignature;
        setBridgeStatus("syncing");
        await recordExtensionFocusPayload(user.uid, data.payload);
        if (cancelled) return;

        const syncedAt = Date.now();
        setBridgeStatus("connected");
        window.postMessage(
          {
            source: "SYNAPSE_DASHBOARD",
            type: "SYNAPSE_FOCUS_ACK",
            uid: user.uid,
            syncedAt
          },
          window.location.origin
        );
      } catch (syncError) {
        if (!cancelled) {
          setBridgeStatus("error");
          setError(syncError.message || "Focus Lock sync failed.");
        }
      }
    };

    window.addEventListener("message", handleMessage);
    announceDashboard();
    const announceTimer = window.setInterval(announceDashboard, 5000);

    return () => {
      cancelled = true;
      window.removeEventListener("message", handleMessage);
      window.clearInterval(announceTimer);
    };
  }, [user?.uid]);

  return {
    summary,
    loading,
    error,
    bridgeStatus
  };
}
