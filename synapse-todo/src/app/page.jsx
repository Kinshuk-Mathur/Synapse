"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Plus,
  Settings,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Zap
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../components/ProtectedRoute";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { useAuth } from "../context/AuthContext";
import { useSynapseTheme } from "../hooks/useSynapseTheme";
import { addTodo, subscribeToTodos, updateTodoCompletion } from "../services/todos";

const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_APP_URL || "/";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: dashboardUrl },
  { label: "FocusLock", icon: LockKeyhole, href: "#" },
  { label: "To-Do List", icon: CheckSquare, href: "/", active: true },
  { label: "Goals", icon: Target, href: "#" },
  { label: "Focus Sessions", icon: Timer, href: "#" },
  { label: "Analytics", icon: BarChart3, href: "#" },
  { label: "AI Assistant", icon: Sparkles, href: "#" },
  { label: "Calendar", icon: CalendarDays, href: "#" },
  { label: "Resources", icon: FolderOpen, href: "#" },
  { label: "Settings", icon: Settings, href: "#" }
];

const priorities = ["High", "Medium", "Low"];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function isPastDate(dateKey) {
  return dateKey < formatDateKey(new Date());
}

function buildCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      key: formatDateKey(date),
      inMonth: date.getMonth() === month
    };
  });
}

function createdTime(todo) {
  const createdAt = todo.createdAt?.toDate?.();
  if (!createdAt) return "Just now";

  return createdAt.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function TodoPage() {
  const { user, logout } = useAuth();
  const { theme, applyTheme } = useSynapseTheme();
  const todayKey = formatDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [todos, setTodos] = useState([]);
  const [task, setTask] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState("High");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return subscribeToTodos(
      user.uid,
      (nextTodos) => {
        setTodos(nextTodos);
        setError("");
      },
      (todoError) => setError(todoError.message || "Unable to load todos.")
    );
  }, [user?.uid]);

  const selectedTasks = useMemo(
    () => todos.filter((todo) => todo.selectedDate === selectedDate),
    [selectedDate, todos]
  );

  const pendingTasks = useMemo(
    () => todos.filter((todo) => todo.selectedDate < todayKey && !todo.completed),
    [todayKey, todos]
  );

  const taskDates = useMemo(() => {
    const dates = new Map();

    todos.forEach((todo) => {
      const current = dates.get(todo.selectedDate) || { total: 0, complete: 0 };
      current.total += 1;
      if (todo.completed) current.complete += 1;
      dates.set(todo.selectedDate, current);
    });

    return dates;
  }, [todos]);

  const lockedSelectedDate = isPastDate(selectedDate);
  const completedCount = selectedTasks.filter((todo) => todo.completed).length;
  const totalCount = selectedTasks.length;
  const completionRate = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const calendarDays = buildCalendarDays(visibleMonth);
  const studentName = user?.displayName?.split(" ")[0] || "Student";

  const handleMonthShift = (direction) => {
    setVisibleMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + direction);
      return next;
    });
  };

  const handleAddTodo = async (event) => {
    event.preventDefault();

    if (lockedSelectedDate) {
      setError("This day is locked. Add new tasks to today or a future date.");
      return;
    }

    try {
      setIsSaving(true);
      setError("");
      await addTodo({
        uid: user.uid,
        task,
        note,
        selectedDate,
        priority,
        locked: lockedSelectedDate
      });
      setTask("");
      setNote("");
      setPriority("High");
    } catch (todoError) {
      setError(todoError.message || "Unable to add todo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTodo = async (todo) => {
    const locked = todo.locked || isPastDate(todo.selectedDate);
    if (locked) {
      setError("Old tasks are locked to protect honest productivity tracking.");
      return;
    }

    try {
      setError("");
      await updateTodoCompletion(todo.id, !todo.completed);
    } catch (todoError) {
      setError(todoError.message || "Unable to update todo.");
    }
  };

  const handleLogout = async () => {
    try {
      setError("");
      await logout();
    } catch (logoutError) {
      setError(logoutError.message || "Logout failed.");
    }
  };

  return (
    <ProtectedRoute>
      <main className="site-shell">
        <div className="ambient-grid" aria-hidden="true" />

        <div className="dashboard-frame todo-frame">
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

            <nav className="side-nav" aria-label="SYNAPSE navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    href={item.href}
                    key={item.label}
                    className={`nav-item ${item.active ? "is-active" : ""}`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="side-footer">
              <motion.div className="streak-card" whileHover={{ y: -4 }}>
                <span>Current Streak</span>
                <strong>
                  <Flame size={34} />
                  12 <small>days</small>
                </strong>
                <p>Keep it up!</p>
              </motion.div>

              <button className="support-button" type="button">
                <HelpCircle size={18} />
                Help & Support
              </button>
            </div>
          </motion.aside>

          <section className="workspace todo-workspace">
            <header className="todo-topbar">
              <div>
                <span className="login-badge">
                  <Sparkles size={16} />
                  AI Task Console
                </span>
                <h1>To-Do Command Center</h1>
                <p>{formatDisplayDate(selectedDate)} · built for honest daily progress</p>
              </div>

              <div className="top-actions">
                <ThemeSwitcher theme={theme} onChange={applyTheme} />
                <div className="profile-chip">
                  <Image
                    src="/assets/synapse-icon-cropped.png"
                    alt="Student profile"
                    width={36}
                    height={36}
                  />
                  <div>
                    <strong>{studentName}</strong>
                    <small>Focus Mode</small>
                  </div>
                  <ChevronDown size={14} />
                </div>
                <button className="logout-button" type="button" onClick={handleLogout}>
                  <LogOut size={17} />
                  <span>Logout</span>
                </button>
              </div>
            </header>

            {error ? (
              <p className="topbar-error" role="alert">
                {error}
              </p>
            ) : null}

            <section className="todo-layout">
              <motion.aside
                className="todo-panel calendar-panel"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <div className="todo-panel-header">
                  <div>
                    <span>Calendar</span>
                    <h2>
                      {visibleMonth.toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric"
                      })}
                    </h2>
                  </div>
                  <div className="calendar-controls">
                    <button type="button" onClick={() => handleMonthShift(-1)} aria-label="Previous month">
                      <ChevronLeft size={18} />
                    </button>
                    <button type="button" onClick={() => handleMonthShift(1)} aria-label="Next month">
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                <div className="calendar-grid calendar-weekdays">
                  {weekdays.map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="calendar-grid">
                  {calendarDays.map((day) => {
                    const marker = taskDates.get(day.key);
                    const isSelected = day.key === selectedDate;
                    const isToday = day.key === todayKey;
                    return (
                      <motion.button
                        type="button"
                        key={day.key}
                        className={[
                          "calendar-day",
                          !day.inMonth ? "is-muted" : "",
                          isSelected ? "is-selected" : "",
                          isToday ? "is-today" : "",
                          isPastDate(day.key) ? "is-locked" : ""
                        ].join(" ")}
                        onClick={() => setSelectedDate(day.key)}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        <span>{day.date.getDate()}</span>
                        {marker ? (
                          <i
                            className={marker.complete === marker.total ? "all-complete" : ""}
                            title={`${marker.complete}/${marker.total} complete`}
                          />
                        ) : null}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.aside>

              <motion.section
                className="todo-panel task-panel"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.06 }}
              >
                <div className="todo-panel-header">
                  <div>
                    <span>{lockedSelectedDate ? "Locked Day" : "Active Day"}</span>
                    <h2>{formatDisplayDate(selectedDate)}</h2>
                  </div>
                  <strong>{completedCount}/{totalCount} complete</strong>
                </div>

                <form className="todo-form" onSubmit={handleAddTodo}>
                  <input
                    value={task}
                    onChange={(event) => setTask(event.target.value)}
                    placeholder={lockedSelectedDate ? "This day is locked" : "Add a focused study task..."}
                    disabled={lockedSelectedDate || isSaving}
                  />
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional note, chapter, link, or reminder..."
                    disabled={lockedSelectedDate || isSaving}
                  />
                  <div className="todo-form-row">
                    <div className="priority-switcher">
                      {priorities.map((item) => (
                        <button
                          type="button"
                          key={item}
                          className={priority === item ? "is-active" : ""}
                          onClick={() => setPriority(item)}
                          disabled={lockedSelectedDate || isSaving}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <button className="add-todo-button" type="submit" disabled={lockedSelectedDate || isSaving}>
                      <Plus size={18} />
                      {isSaving ? "Saving..." : "Add Task"}
                    </button>
                  </div>
                </form>

                <div className="selected-task-list">
                  <AnimatePresence initial={false}>
                    {selectedTasks.length ? (
                      selectedTasks.map((todo) => {
                        const locked = todo.locked || isPastDate(todo.selectedDate);
                        return (
                          <motion.article
                            className={`task-card ${todo.completed ? "is-complete" : ""}`}
                            key={todo.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            whileHover={{ y: locked ? 0 : -3 }}
                          >
                            <button
                              className={`task-check ${todo.completed ? "is-checked" : ""}`}
                              type="button"
                              disabled={locked}
                              onClick={() => handleToggleTodo(todo)}
                              aria-label={todo.completed ? "Mark incomplete" : "Mark complete"}
                            >
                              {todo.completed ? <Check size={17} /> : null}
                            </button>
                            <div className="task-copy">
                              <div>
                                <h3>{todo.task}</h3>
                                <span className={`priority priority-${todo.priority?.toLowerCase() || "medium"}`}>
                                  {todo.priority || "Medium"}
                                </span>
                              </div>
                              {todo.note ? <p>{todo.note}</p> : <p>No note added.</p>}
                              <small>
                                Created {createdTime(todo)}
                                {locked ? " · locked" : ""}
                              </small>
                            </div>
                          </motion.article>
                        );
                      })
                    ) : (
                      <motion.div
                        className="empty-task-state"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <Zap size={28} />
                        <h3>No tasks for this date yet.</h3>
                        <p>Choose a focus goal and turn it into a clear study action.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>

              <motion.aside
                className="todo-panel insight-panel"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.12 }}
              >
                <div className="todo-panel-header">
                  <div>
                    <span>SYNAPSE AI</span>
                    <h2>Daily Insights</h2>
                  </div>
                  <Sparkles size={22} />
                </div>

                <div className="insight-grid">
                  <div className="insight-card">
                    <span>Completion</span>
                    <strong>{completionRate}%</strong>
                    <div className="meter goal-meter">
                      <i style={{ width: `${completionRate}%`, "--meter": "var(--color-pulse)" }} />
                    </div>
                  </div>
                  <div className="insight-card">
                    <span>Pending Carryover</span>
                    <strong>{pendingTasks.length}</strong>
                    <small>unfinished from previous days</small>
                  </div>
                </div>

                <div className={`motivation-card ${totalCount && completedCount === totalCount ? "success" : ""}`}>
                  <Trophy size={24} />
                  {totalCount && completedCount === totalCount ? (
                    <>
                      <h3>Perfect daily closure.</h3>
                      <p>All selected tasks are complete. Lock in the win and protect your momentum.</p>
                    </>
                  ) : (
                    <>
                      <h3>Keep the loop alive.</h3>
                      <p>Finish the most important task first. Anything left becomes tomorrow’s honest signal.</p>
                    </>
                  )}
                </div>

                <div className="pending-section">
                  <h3>Pending Reminders</h3>
                  <div className="pending-list">
                    {pendingTasks.slice(0, 4).map((todo) => (
                      <div className="pending-card" key={todo.id}>
                        <span className={`priority-dot priority-${todo.priority?.toLowerCase() || "medium"}`} />
                        <div>
                          <strong>{todo.task}</strong>
                          <small>{formatDisplayDate(todo.selectedDate)}</small>
                        </div>
                      </div>
                    ))}
                    {!pendingTasks.length ? (
                      <div className="pending-card">
                        <span className="priority-dot priority-low" />
                        <div>
                          <strong>No old pending tasks.</strong>
                          <small>Your backlog is clear.</small>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.aside>
            </section>
          </section>
        </div>
      </main>
    </ProtectedRoute>
  );
}
