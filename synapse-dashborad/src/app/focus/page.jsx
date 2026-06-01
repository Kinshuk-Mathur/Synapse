"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Trophy,
  X
} from "lucide-react";
import NotificationCenter from "../../components/NotificationCenter";
import ProtectedRoute from "../../components/ProtectedRoute";
import AIMessageRenderer from "../../components/synapse-ai/AIMessageRenderer";
import { useAuth } from "../../context/AuthContext";
import { useSynapseFocus } from "../../hooks/useSynapseFocus";
import { buildFocusSummary } from "../../services/focusSessions";
import { formatDateKey, parseDateKey } from "../../services/todos";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "SYNAPSE AI", icon: Sparkles, href: "/synapse-ai" },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus", active: true },
  { label: "To-Do List", icon: CheckSquare, href: "/todo" },
  { label: "Goals", icon: Target, href: "/goals" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "Resources", icon: FolderOpen, href: "/resources" },
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

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Date(2026, month, 1).toLocaleDateString(undefined, { month: "short" })
);
const focusLockEmptyMessage = "Get extension from Focus Lock";
const focusLockExtensionUrl = "https://chromewebstore.google.com/detail/jhpjhjineokfnnfladlgboalcdoegobj?utm_source=item-share-cb";

function getCurrentFocusPeriod() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth(),
    weekIndex: Math.floor((today.getDate() - 1) / 7)
  };
}

function getMonthWeeks(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);

  return Array.from({ length: weekCount }, (_, index) => {
    const startDay = index * 7 + 1;
    const endDay = Math.min(daysInMonth, startDay + 6);
    const startDate = new Date(year, month, startDay);
    const endDate = new Date(year, month, endDay);

    return {
      index,
      label: `Week ${index + 1}`,
      startDateKey: formatDateKey(startDate),
      endDateKey: formatDateKey(endDate)
    };
  });
}

function formatDateRange(startDateKey, endDateKey) {
  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);
  const options = { month: "short", day: "numeric" };
  const start = startDate.toLocaleDateString(undefined, options);
  const end = endDate.toLocaleDateString(undefined, {
    ...options,
    year: startDate.getFullYear() === endDate.getFullYear() ? undefined : "numeric"
  });

  return `${start} - ${end}`;
}

function formatDayLabel(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

function getSessionChats(session = {}) {
  return Array.isArray(session.aiChats) ? session.aiChats.filter((chat) => chat.userMessage || chat.aiResponse) : [];
}

function getSessionTopics(session = {}) {
  const summaryTopics = Array.isArray(session.aiSummary?.topicsCovered) ? session.aiSummary.topicsCovered : [];
  const sessionTopics = Array.isArray(session.aiTopics) ? session.aiTopics : [];
  return [...new Set([...summaryTopics, ...sessionTopics].filter(Boolean))];
}

function FocusSessionDetail({ session, onClose }) {
  if (!session) return null;

  const chats = getSessionChats(session);
  const topics = getSessionTopics(session);

  return (
    <motion.aside
      className="focus-session-detail"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.18 }}
    >
      <div className="focus-session-detail-header">
        <div>
          <span>Session detail</span>
          <h3>{session.goal || session.lockedTitle || "Study session"}</h3>
        </div>
        <button type="button" aria-label="Close session detail" onClick={onClose}>
          <X size={17} />
        </button>
      </div>

      <div className="focus-session-topics">
        {topics.length ? topics.map((topic) => <span key={topic}>{topic}</span>) : <span>No topics detected</span>}
      </div>

      <section className="focus-session-chat">
        <div className="focus-session-section-title">
          <strong>AI chat history</strong>
          <span>{chats.length} questions</span>
        </div>
        {chats.length ? (
          chats.map((chat, index) => (
            <article className="focus-session-chat-pair" key={chat.id || `${session.id}-${index}`}>
              <div className="focus-session-question">
                <span>Question {index + 1}</span>
                <p>{chat.userMessage}</p>
              </div>
              <div className="focus-session-answer">
                <span>SYNAPSE answer</span>
                <AIMessageRenderer content={chat.aiResponse} compact />
              </div>
            </article>
          ))
        ) : (
          <p className="focus-session-no-chat">No AI chats were saved in this FocusLock session.</p>
        )}
      </section>
    </motion.aside>
  );
}

function FocusPeriodPicker({
  open,
  pickerRef,
  pickerStep,
  pickerYear,
  draftMonth,
  selectedPeriod,
  onToggle,
  onClose,
  onStepChange,
  onYearChange,
  onDraftMonth,
  onSelectWeek
}) {
  const draftWeeks = draftMonth ? getMonthWeeks(draftMonth.year, draftMonth.month) : [];

  return (
    <div className="focus-period-picker" ref={pickerRef}>
      <button
        className={`focus-calendar-button ${open ? "is-active" : ""}`}
        type="button"
        aria-label="Select Focus Lock period"
        title="Select Focus Lock period"
        aria-expanded={open}
        onClick={onToggle}
      >
        <CalendarDays size={22} />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="focus-period-menu"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {pickerStep === "months" ? (
              <>
                <div className="focus-period-menu-header">
                  <button type="button" aria-label="Previous year" onClick={() => onYearChange(pickerYear - 1)}>
                    <ChevronLeft size={16} />
                  </button>
                  <strong>{pickerYear}</strong>
                  <button type="button" aria-label="Next year" onClick={() => onYearChange(pickerYear + 1)}>
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="focus-month-grid">
                  {monthNames.map((monthName, month) => {
                    const active = selectedPeriod.year === pickerYear && selectedPeriod.month === month;
                    return (
                      <button
                        className={active ? "is-active" : ""}
                        key={monthName}
                        type="button"
                        onClick={() => {
                          onDraftMonth({ year: pickerYear, month });
                          onStepChange("weeks");
                        }}
                      >
                        {monthName}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="focus-period-menu-header">
                  <button type="button" onClick={() => onStepChange("months")}>
                    <ChevronLeft size={16} />
                    Months
                  </button>
                  <strong>{monthNames[draftMonth.month]} {draftMonth.year}</strong>
                  <button type="button" aria-label="Close period picker" onClick={onClose}>
                    <X size={16} />
                  </button>
                </div>
                <div className="focus-week-grid">
                  {draftWeeks.map((week) => {
                    const active =
                      selectedPeriod.year === draftMonth.year &&
                      selectedPeriod.month === draftMonth.month &&
                      selectedPeriod.weekIndex === week.index;
                    return (
                      <button
                        className={active ? "is-active" : ""}
                        key={week.startDateKey}
                        type="button"
                        onClick={() => onSelectWeek({ ...draftMonth, weekIndex: week.index })}
                      >
                        <span>{week.label}</span>
                        <small>{formatDateRange(week.startDateKey, week.endDateKey)}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function FocusPage() {
  const { user } = useAuth();
  const { sessions: focusSessions, loading, error } = useSynapseFocus(user);
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentFocusPeriod);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState("months");
  const [pickerYear, setPickerYear] = useState(() => getCurrentFocusPeriod().year);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [draftMonth, setDraftMonth] = useState(() => {
    const currentPeriod = getCurrentFocusPeriod();
    return { year: currentPeriod.year, month: currentPeriod.month };
  });
  const pickerRef = useRef(null);
  const monthWeeks = useMemo(
    () => getMonthWeeks(selectedPeriod.year, selectedPeriod.month),
    [selectedPeriod.month, selectedPeriod.year]
  );
  const selectedWeek = monthWeeks[Math.min(selectedPeriod.weekIndex, monthWeeks.length - 1)] || monthWeeks[0];
  const weekSummary = useMemo(
    () =>
      buildFocusSummary(focusSessions, {
        startDateKey: selectedWeek.startDateKey,
        endDateKey: selectedWeek.endDateKey,
        weeklyStartDateKey: selectedWeek.startDateKey,
        weeklyEndDateKey: selectedWeek.endDateKey,
        sessionLimit: Infinity
      }),
    [focusSessions, selectedWeek]
  );
  const daySummary = useMemo(
    () =>
      selectedDateKey
        ? buildFocusSummary(focusSessions, {
            startDateKey: selectedDateKey,
            endDateKey: selectedDateKey,
            weeklyStartDateKey: selectedWeek.startDateKey,
            weeklyEndDateKey: selectedWeek.endDateKey,
            sessionLimit: Infinity
          })
        : null,
    [focusSessions, selectedDateKey, selectedWeek]
  );
  const visibleSummary = daySummary || weekSummary;
  const weeklyData = weekSummary.weeklyData || [];
  const maxWeeklyHours = Math.max(...weeklyData.map((item) => item.hours), 1);
  const recentSessions = visibleSummary.recentSessions || [];
  const selectedSession = useMemo(
    () => recentSessions.find((session) => session.id === selectedSessionId) || null,
    [recentSessions, selectedSessionId]
  );
  const selectedRangeLabel = formatDateRange(selectedWeek.startDateKey, selectedWeek.endDateKey);
  const periodLabel = selectedDateKey
    ? formatDayLabel(selectedDateKey)
    : `${monthNames[selectedPeriod.month]} ${selectedPeriod.year} - Week ${selectedPeriod.weekIndex + 1}`;
  const hasAnyFocusSessions = focusSessions.length > 0;
  const emptyPeriodMessage = hasAnyFocusSessions ? "No Focus Lock data in this period." : focusLockEmptyMessage;

  useEffect(() => {
    if (!periodPickerOpen) return undefined;

    const closePicker = (event) => {
      if (pickerRef.current?.contains(event.target)) return;
      setPeriodPickerOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setPeriodPickerOpen(false);
    };

    window.addEventListener("pointerdown", closePicker);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closePicker);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [periodPickerOpen]);

  useEffect(() => {
    if (!selectedSessionId) return undefined;

    const closeDetail = (event) => {
      if (event.target.closest(".focus-session-detail") || event.target.closest(".focus-history-item")) return;
      setSelectedSessionId("");
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setSelectedSessionId("");
    };

    window.addEventListener("pointerdown", closeDetail);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeDetail);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedSessionId]);

  const togglePeriodPicker = () => {
    setPeriodPickerOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setPickerStep("months");
        setPickerYear(selectedPeriod.year);
        setDraftMonth({ year: selectedPeriod.year, month: selectedPeriod.month });
      }
      return nextOpen;
    });
  };

  const selectPeriodWeek = (nextPeriod) => {
    setSelectedPeriod(nextPeriod);
    setSelectedDateKey("");
    setSelectedSessionId("");
    setPeriodPickerOpen(false);
  };

  const selectDay = (dateKey) => {
    setSelectedDateKey((currentDateKey) => (currentDateKey === dateKey ? "" : dateKey));
    setSelectedSessionId("");
  };

  return (
    <ProtectedRoute>
      <main className="site-shell focus-dashboard-shell">
        <div className="ambient-grid" aria-hidden="true" />

        <div className="dashboard-frame">
          <button
            className={`sidebar-scrim ${navigationOpen ? "is-visible" : ""}`}
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          />

          <motion.aside
            className={`sidebar ${navigationOpen ? "is-mobile-open" : ""}`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="brand-lockup">
              <Link
                href="/"
                className="brand-home-link"
                aria-label="Go to SYNAPSE dashboard"
                onClick={() => setNavigationOpen(false)}
              >
                <Image
                  src="/assets/main-logo.jpeg"
                  alt="SYNAPSE logo"
                  width={186}
                  height={74}
                  className="brand-wordmark"
                  priority
                />
              </Link>
            </div>

            <nav className="side-nav" aria-label="Focus sections">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div key={item.label} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
                    <Link
                      href={item.href}
                      className={`nav-item ${item.active ? "is-active" : ""}`}
                      onClick={() => setNavigationOpen(false)}
                    >
                      <Icon size={20} />
                      <span>{item.label}</span>
                    </Link>
                  </motion.div>
                );
              })}
            </nav>

            <div className="side-footer">
              <button className="support-button" type="button">
                <HelpCircle size={18} />
                Help & Support
              </button>
            </div>
          </motion.aside>

          <section className="workspace focus-workspace">
            <header className="focus-page-hero">
              <div className="focus-hero-copy">
                <span className="focus-page-eyebrow">FOCUSLOCK - powered by Synapse</span>
                <div className="focus-hero-title-row">
                  <button
                    className="icon-button app-sidebar-toggle"
                    type="button"
                    aria-label="Open navigation"
                    aria-expanded={navigationOpen}
                    onClick={() => setNavigationOpen(true)}
                  >
                    <Menu size={22} />
                  </button>
                  <h1>Focus Lock</h1>
                  <FocusPeriodPicker
                    open={periodPickerOpen}
                    pickerRef={pickerRef}
                    pickerStep={pickerStep}
                    pickerYear={pickerYear}
                    draftMonth={draftMonth}
                    selectedPeriod={selectedPeriod}
                    onToggle={togglePeriodPicker}
                    onClose={() => setPeriodPickerOpen(false)}
                    onStepChange={setPickerStep}
                    onYearChange={setPickerYear}
                    onDraftMonth={setDraftMonth}
                    onSelectWeek={selectPeriodWeek}
                  />
                </div>
                <p>Session history, blocked distractions, and productivity analytics from the browser extension.</p>
                <div className="focus-period-summary">
                  <strong>{periodLabel}</strong>
                  <span>{selectedDateKey ? "Day view" : selectedRangeLabel}</span>
                  {selectedDateKey ? (
                    <button type="button" onClick={() => setSelectedDateKey("")}>
                      Back to week
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="focus-hero-actions">
                <NotificationCenter />
              <a
                className="focus-extension-button"
                href={focusLockExtensionUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ShieldCheck size={18} />
                <span>Get Focus Lock Extension</span>
              </a>
              </div>
            </header>

            {error ? <p className="topbar-error">{error}</p> : null}

            <section className="focus-kpi-grid">
              <article className="focus-kpi">
                <Timer size={22} />
                <span>Focus Time</span>
                <strong>{loading ? "--" : formatDuration(visibleSummary.totalFocusSeconds)}</strong>
              </article>
              <article className="focus-kpi">
                <Trophy size={22} />
                <span>Completed</span>
                <strong>{loading ? "--" : visibleSummary.sessionsCompleted}</strong>
              </article>
              <article className="focus-kpi">
                <ShieldCheck size={22} />
                <span>Blocked</span>
                <strong>{loading ? "--" : visibleSummary.blockedDistractions}</strong>
              </article>
              <article className="focus-kpi">
                <Sparkles size={22} />
                <span>Focus Days</span>
                <strong>{loading ? "--" : `${visibleSummary.focusDays}d`}</strong>
              </article>
            </section>

            <section className="focus-analytics-grid">
              <article className="panel focus-week-panel">
                <div className="panel-header">
                  <h2>Weekly Focus</h2>
                  <span>{weekSummary.productivityScore || 0}% score</span>
                </div>
                <div className="focus-bars">
                  {weeklyData.map((day) => (
                    <button
                      className={`focus-bar-item ${selectedDateKey === day.dateKey ? "is-active" : ""}`}
                      key={day.dateKey}
                      type="button"
                      aria-label={`View ${formatDayLabel(day.dateKey)} stats`}
                      onClick={() => selectDay(day.dateKey)}
                    >
                      <div>
                        <i style={{ height: `${Math.max(6, (day.hours / maxWeeklyHours) * 100)}%` }} />
                      </div>
                      <span>{day.day}</span>
                    </button>
                  ))}
                </div>
              </article>

              <article className="panel focus-distractions-panel">
                <div className="panel-header">
                  <h2>Most Blocked</h2>
                  <span>{visibleSummary.topDistractions?.length || 0} sources</span>
                </div>
                <div className="focus-distraction-stack">
                  {visibleSummary.topDistractions?.length ? (
                    visibleSummary.topDistractions.map((item) => (
                      <div className="focus-distraction-row" key={item.host}>
                        <span>{item.name}</span>
                        <strong>{item.count}</strong>
                      </div>
                    ))
                  ) : (
                    <div className="focus-empty">{hasAnyFocusSessions ? "No distractions blocked in this period." : focusLockEmptyMessage}</div>
                  )}
                </div>
              </article>
            </section>

            <section className="panel focus-history-panel">
              <div className="panel-header">
                <h2>Session History</h2>
                <span>{recentSessions.length} sessions</span>
              </div>
              <div className="focus-history-list">
                {recentSessions.length ? (
                  recentSessions.map((session) => (
                    <article
                      className={`focus-history-item ${selectedSessionId === session.id ? "is-selected" : ""}`}
                      key={session.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSessionId((currentId) => (currentId === session.id ? "" : session.id))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedSessionId((currentId) => (currentId === session.id ? "" : session.id));
                        }
                      }}
                    >
                      <div>
                        <strong>{session.goal || session.lockedTitle || "Study session"}</strong>
                        <span>{formatTimestamp(session.startedAt)} - {session.platform || "desktop"}</span>
                      </div>
                      <em>{formatDuration(session.focusSeconds)}</em>
                      <small>{session.violations || 0} blocked</small>
                      <small>{getSessionChats(session).length} AI</small>
                    </article>
                  ))
                ) : (
                  <div className="focus-empty">{emptyPeriodMessage}</div>
                )}
              </div>
              <AnimatePresence>
                {selectedSession ? (
                  <FocusSessionDetail session={selectedSession} onClose={() => setSelectedSessionId("")} />
                ) : null}
              </AnimatePresence>
            </section>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
