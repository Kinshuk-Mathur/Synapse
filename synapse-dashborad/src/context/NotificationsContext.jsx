"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  clearNotifications,
  deleteNotification,
  listenToNotificationSources,
  listenToUserNotifications,
  markNotificationRead,
  markNotificationsRead,
  runNotificationIntelligenceCheck
} from "../services/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sourcesReady, setSourcesReady] = useState(false);
  const [error, setError] = useState("");
  const [checkPulse, setCheckPulse] = useState(0);
  const notificationsRef = useRef([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return listenToUserNotifications(
      user.uid,
      (nextNotifications) => {
        setNotifications(nextNotifications);
        setError("");
        setLoading(false);
      },
      (notificationError) => {
        setError(notificationError.message || "Unable to load SYNAPSE notifications.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setSources(null);
      setSourcesReady(false);
      return undefined;
    }

    setSourcesReady(false);

    return listenToNotificationSources(
      user.uid,
      (nextSources) => {
        setSources(nextSources);
        setSourcesReady(true);
        setError("");
      },
      (sourceError) => {
        setError(sourceError.message || "Unable to sync notification intelligence.");
        setSourcesReady(true);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const intervalId = window.setInterval(() => {
      setCheckPulse((value) => value + 1);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [user?.uid]);

  const notificationSignature = useMemo(
    () => notifications.map((notification) => `${notification.id}:${notification.signature}`).join("|"),
    [notifications]
  );
  const studentName = profile?.name || profile?.displayName || user?.displayName?.split(" ")[0] || "Student";

  useEffect(() => {
    if (!user?.uid || !sourcesReady || !sources) return undefined;

    let cancelled = false;

    runNotificationIntelligenceCheck(user.uid, sources, {
      existingNotifications: notificationsRef.current,
      studentName
    }).catch((engineError) => {
      if (!cancelled) {
        setError(engineError.message || "Notification intelligence check failed.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [checkPulse, notificationSignature, sources, sourcesReady, studentName, user?.uid]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (notificationId) => {
      if (!user?.uid || !notificationId) return;
      await markNotificationRead(user.uid, notificationId);
    },
    [user?.uid]
  );

  const markAllAsRead = useCallback(async () => {
    if (!user?.uid) return;
    const unreadIds = notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);
    await markNotificationsRead(user.uid, unreadIds);
  }, [notifications, user?.uid]);

  const clearAll = useCallback(async () => {
    if (!user?.uid) return;
    await clearNotifications(user.uid, notifications.map((notification) => notification.id));
  }, [notifications, user?.uid]);

  const removeNotification = useCallback(
    async (notificationId) => {
      if (!user?.uid || !notificationId) return;
      await deleteNotification(user.uid, notificationId);
    },
    [user?.uid]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      markAsRead,
      markAllAsRead,
      clearAll,
      removeNotification
    }),
    [clearAll, error, loading, markAllAsRead, markAsRead, notifications, removeNotification, unreadCount]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationsProvider.");
  }

  return context;
}
