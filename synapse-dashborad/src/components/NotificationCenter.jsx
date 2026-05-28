"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BrainCircuit,
  Check,
  CheckCheck,
  CheckSquare,
  Flame,
  Lightbulb,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  X
} from "lucide-react";
import { useNotifications } from "../context/NotificationsContext";
import { formatNotificationTime, getNotificationHref } from "../services/notifications";

const TYPE_META = {
  momentum: { icon: Flame, label: "Momentum" },
  goal: { icon: Target, label: "Goals" },
  focuslock: { icon: LockKeyhole, label: "FocusLock" },
  ai_coaching: { icon: BrainCircuit, label: "AI Coach" },
  weekly_report: { icon: BarChart3, label: "Weekly Report" },
  recovery: { icon: RotateCcw, label: "Recovery" },
  achievement: { icon: Trophy, label: "Achievement" },
  study_suggestion: { icon: Lightbulb, label: "Study Suggestion" },
  task: { icon: CheckSquare, label: "Tasks" }
};

function groupNotifications(notifications = []) {
  const priority = notifications.filter((notification) => !notification.read && notification.priority === "high");
  const unread = notifications.filter((notification) => !notification.read && notification.priority !== "high");
  const earlier = notifications.filter((notification) => notification.read);

  return [
    { label: "Priority Signals", items: priority },
    { label: "Live Guidance", items: unread },
    { label: "Earlier", items: earlier }
  ].filter((group) => group.items.length);
}

export default function NotificationCenter() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    clearAll,
    removeNotification
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const groupedNotifications = useMemo(() => groupNotifications(notifications), [notifications]);

  useEffect(() => {
    if (!open) return undefined;

    const closePanel = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", closePanel);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closePanel);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const openNotification = async (notification) => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    setOpen(false);
    router.push(getNotificationHref(notification.action));
  };

  return (
    <div className="notification-center-shell" ref={panelRef}>
      <motion.button
        className={`icon-button notification notification-trigger ${unreadCount ? "is-unread" : ""}`}
        type="button"
        aria-label="Open SYNAPSE notifications"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.96 }}
      >
        <Bell size={20} />
        {unreadCount ? <span className="notification-badge">{Math.min(unreadCount, 99)}</span> : null}
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="notification-panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            <div className="notification-panel-header">
              <div>
                <span>SYNAPSE Intelligence</span>
                <strong>{unreadCount ? `${unreadCount} unread signal${unreadCount === 1 ? "" : "s"}` : "All caught up"}</strong>
              </div>
              <div className="notification-panel-actions">
                <button
                  type="button"
                  title="Mark all as read"
                  aria-label="Mark all notifications as read"
                  disabled={!unreadCount}
                  onClick={markAllAsRead}
                >
                  <CheckCheck size={17} />
                </button>
                <button
                  type="button"
                  title="Clear all"
                  aria-label="Clear all notifications"
                  disabled={!notifications.length}
                  onClick={clearAll}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  title="Close"
                  aria-label="Close notifications"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="notification-panel-body">
              {error ? (
                <div className="notification-empty is-error">
                  <Sparkles size={18} />
                  <span>{error}</span>
                </div>
              ) : null}

              {!error && loading ? (
                <div className="notification-empty">
                  <span className="auth-loader" />
                  <span>Syncing intelligence...</span>
                </div>
              ) : null}

              {!error && !loading && !notifications.length ? (
                <div className="notification-empty">
                  <Sparkles size={18} />
                  <span>No signals yet. SYNAPSE will notify only when it has something useful.</span>
                </div>
              ) : null}

              {!loading && groupedNotifications.map((group) => (
                <section className="notification-group" key={group.label}>
                  <div className="notification-group-title">
                    <span>{group.label}</span>
                    <small>{group.items.length}</small>
                  </div>

                  <div className="notification-list">
                    {group.items.map((notification) => {
                      const meta = TYPE_META[notification.type] || TYPE_META.ai_coaching;
                      const Icon = meta.icon;

                      return (
                        <motion.article
                          className={`notification-card ${notification.read ? "is-read" : "is-unread"} priority-${notification.priority}`}
                          key={notification.id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          whileHover={{ y: -2 }}
                          onClick={() => openNotification(notification)}
                        >
                          <div className="notification-card-icon">
                            <Icon size={18} />
                          </div>
                          <div className="notification-card-copy">
                            <div className="notification-card-topline">
                              <span>{meta.label}</span>
                              <time>{formatNotificationTime(notification.createdAtDate || notification.createdAt)}</time>
                            </div>
                            <strong>{notification.title}</strong>
                            <p>{notification.message}</p>
                            <div className="notification-card-footer">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openNotification(notification);
                                }}
                              >
                                <span>{notification.cta || "Open"}</span>
                                <ArrowUpRight size={14} />
                              </button>
                              {!notification.read ? (
                                <button
                                  type="button"
                                  aria-label="Mark notification as read"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    markAsRead(notification.id);
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                aria-label="Delete notification"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  removeNotification(notification.id);
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
