"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  Flame,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Trophy
} from "lucide-react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { useSynapseFocus } from "../../hooks/useSynapseFocus";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus", active: true },
  { label: "To-Do List", icon: CheckSquare, href: "/todo" },
  { label: "Goals", icon: Target, href: "/goals" },
  { label: "Analytics", icon: BarChart3, href: "/focus" },
  { label: "SYNAPSE AI", icon: Sparkles, href: "/synapse-ai" },
  { label: "Resources", icon: FolderOpen, href: "#" },
  { label: "Settings", icon: Settings, href: "/settings" }
];

function formatDuration(totalSeconds = 0) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "Recent";
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function FocusPage() {
  const { user } = useAuth();
  const { summary, loading, error } = useSynapseFocus(user);
  const weeklyData = summary.weeklyData?.length
    ? summary.weeklyData
    : Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index - 6);
        return {
          day: date.toLocaleDateString(undefined, { weekday: "short" }),
          dateKey: date.toISOString(),
          hours: 0
        };
      });
  const maxWeeklyHours = Math.max(...weeklyData.map((item) => item.hours), 1);
  const recentSessions = summary.recentSessions || [];

  return (
    <ProtectedRoute>
      <main className="site-shell focus-dashboard-shell">
        <div className="ambient-grid" aria-hidden="true" />

        <div className="dashboard-frame">
          <motion.aside
            className="sidebar"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="brand-lockup">
              <Image
                src="/assets/main-logo.jpeg"
                alt="SYNAPSE logo"
                width={186}
                height={74}
                className="brand-wordmark"
                priority
              />
            </div>

            <nav className="side-nav" aria-label="Focus sections">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div key={item.label} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                    <Link href={item.href} className={`nav-item ${item.active ? "is-active" : ""}`}>
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </nav>

            <div className="side-footer">
              <motion.div className="streak-card" whileHover={{ y: -4 }}>
                <span>Focus Streak</span>
                <strong>
                  <Flame size={34} />
                  {summary.currentStreak || 0} <small>days</small>
                </strong>
                <p>FOCUSLOCK - powered by Synapse</p>
              </motion.div>

              <button className="support-button" type="button">
                <HelpCircle size={18} />
                Help & Support
              </button>
            </div>
          </motion.aside>

          <section className="workspace focus-workspace">
            <header className="focus-page-hero">
              <div>
                <span>FOCUSLOCK - powered by Synapse</span>
                <h1>Focus Lock</h1>
                <p>Session history, blocked distractions, streaks, and productivity analytics from the browser extension.</p>
              </div>
              <button className="focus-extension-button" type="button">
                <ShieldCheck size={18} />
                <span>Get Focus Lock Extension</span>
              </button>
            </header>

            {error ? <p className="topbar-error">{error}</p> : null}

            <section className="focus-kpi-grid">
              <article className="focus-kpi">
                <Timer size={22} />
                <span>Focus Today</span>
                <strong>{loading ? "--" : formatDuration(summary.focusSecondsToday)}</strong>
              </article>
              <article className="focus-kpi">
                <Trophy size={22} />
                <span>Completed</span>
                <strong>{loading ? "--" : summary.sessionsCompletedToday}</strong>
              </article>
              <article className="focus-kpi">
                <ShieldCheck size={22} />
                <span>Blocked</span>
                <strong>{loading ? "--" : summary.blockedDistractionsToday}</strong>
              </article>
              <article className="focus-kpi">
                <Flame size={22} />
                <span>Streak</span>
                <strong>{loading ? "--" : `${summary.currentStreak}d`}</strong>
              </article>
            </section>

            <section className="focus-analytics-grid">
              <article className="panel focus-week-panel">
                <div className="panel-header">
                  <h2>Weekly Focus</h2>
                  <span>{summary.productivityScore}% score</span>
                </div>
                <div className="focus-bars">
                  {weeklyData.map((day) => (
                    <div className="focus-bar-item" key={day.dateKey}>
                      <div>
                        <i style={{ height: `${Math.max(6, (day.hours / maxWeeklyHours) * 100)}%` }} />
                      </div>
                      <span>{day.day}</span>
                    </div>
                  ))}
                </div>
              </article>

              <article className="panel focus-distractions-panel">
                <div className="panel-header">
                  <h2>Most Blocked</h2>
                  <span>{summary.topDistractions?.length || 0} sources</span>
                </div>
                <div className="focus-distraction-stack">
                  {summary.topDistractions?.length ? (
                    summary.topDistractions.map((item) => (
                      <div className="focus-distraction-row" key={item.host}>
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="focus-empty">No distractions blocked yet today.</div>
                  )}
                </div>
              </article>
            </section>

            <section className="panel focus-history-panel">
              <div className="panel-header">
                <h2>Session History</h2>
                <span>{summary.sessionsCompleted} total completed</span>
              </div>
              <div className="focus-history-list">
                {recentSessions.length ? (
                  recentSessions.map((session) => (
                    <article className="focus-history-item" key={session.id}>
                      <div>
                        <strong>{session.goal || session.lockedTitle || "Study session"}</strong>
                        <span>{formatTimestamp(session.startedAt)} - {session.platform || "desktop"}</span>
                      </div>
                      <em>{formatDuration(session.focusSeconds)}</em>
                      <small>{session.violations || 0} blocked</small>
                    </article>
                  ))
                ) : (
                  <div className="focus-empty">Start a Focus Lock session from the browser extension to populate this timeline.</div>
                )}
              </div>
            </section>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
