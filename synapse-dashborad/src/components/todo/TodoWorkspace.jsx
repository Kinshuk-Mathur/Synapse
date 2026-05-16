"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";
import { useTodos } from "../../hooks/useTodos";
import { formatDateKey, isDateLocked, parseDateKey } from "../../services/todos";
import MotivationPanel from "./MotivationPanel";
import QuickAddTask from "./QuickAddTask";
import TodoCalendar from "./TodoCalendar";
import TodoSidebar from "./TodoSidebar";
import TodoTaskList from "./TodoTaskList";
import TodoThemeSwitcher from "./TodoThemeSwitcher";

function moveDate(dateKey, days) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export default function TodoWorkspace() {
  const [selectedDate, setSelectedDate] = useState(formatDateKey());
  const [currentMonth, setCurrentMonth] = useState(() => parseDateKey(formatDateKey()));
  const [actionError, setActionError] = useState("");
  const { theme, applyTheme } = useSynapseTheme();
  const { user, logout } = useAuth();
  const {
    tasksForSelectedDate,
    pendingCarryovers,
    calendarStats,
    loading,
    error,
    setError,
    createTodo,
    toggleTodo,
    editTodo,
    removeTodo
  } = useTodos(selectedDate);

  const selectedDateObject = parseDateKey(selectedDate);
  const selectedDateLabel = selectedDateObject.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
  const locked = isDateLocked(selectedDate);
  const studentName = user?.displayName?.split(" ")[0] || "STUDENT";

  const completionSummary = useMemo(() => {
    const total = tasksForSelectedDate.length;
    const completed = tasksForSelectedDate.filter((todo) => todo.completed).length;
    return `${completed}/${total || 0} complete`;
  }, [tasksForSelectedDate]);

  const setDateAndMonth = (dateKey) => {
    setSelectedDate(dateKey);
    setCurrentMonth(parseDateKey(dateKey));
  };

  const changeMonth = (offset) => {
    setCurrentMonth((value) => new Date(value.getFullYear(), value.getMonth() + offset, 1));
  };

  const runTodoAction = async (action) => {
    try {
      setActionError("");
      setError("");
      await action();
    } catch (todoError) {
      setActionError(todoError.message || "Task action failed.");
    }
  };

  const handleLogout = async () => {
    await runTodoAction(logout);
  };

  return (
    <main className="site-shell">
      <div className="ambient-grid" aria-hidden="true" />

      <div className="dashboard-frame todo-dashboard-frame">
        <TodoSidebar />

        <section className="workspace todo-workspace">
          <header className="todo-topbar">
            <div className="todo-title-block">
              <button className="icon-button menu-button" aria-label="Open navigation" type="button">
                <Menu size={22} />
              </button>
              <div>
                <h1>To Do List</h1>
                <p>Plan your day. Stay focused. Achieve more.</p>
              </div>
            </div>

            <div className="todo-date-toolbar">
              <button type="button" onClick={() => setDateAndMonth(formatDateKey())}>
                Today
              </button>
              <div className="date-stepper">
                <button type="button" aria-label="Previous day" onClick={() => setDateAndMonth(moveDate(selectedDate, -1))}>
                  <ChevronLeft size={18} />
                </button>
                <button type="button" aria-label="Next day" onClick={() => setDateAndMonth(moveDate(selectedDate, 1))}>
                  <ChevronRight size={18} />
                </button>
              </div>
              <label className="date-picker-shell">
                <CalendarDays size={18} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setDateAndMonth(event.target.value)}
                  aria-label="Select todo date"
                />
                <ChevronDown size={14} />
              </label>
            </div>

            <div className="todo-top-actions">
              <TodoThemeSwitcher theme={theme} onChange={applyTheme} />
              <button className="icon-button notification" aria-label="Notifications" type="button">
                <Bell size={20} />
                <span>{pendingCarryovers.length || 1}</span>
              </button>
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

          {actionError || error ? (
            <motion.p
              className="topbar-error"
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {actionError || error}
            </motion.p>
          ) : null}

          <div className="todo-page-grid">
            <div className="todo-left-column">
              <TodoCalendar
                calendarStats={calendarStats}
                currentMonth={currentMonth}
                onMonthChange={changeMonth}
                selectedDate={selectedDate}
                onDateSelect={setDateAndMonth}
              />
              <QuickAddTask
                locked={locked}
                onAdd={(payload) =>
                  runTodoAction(() =>
                    createTodo({
                      ...payload,
                      selectedDate
                    })
                  )
                }
              />
            </div>

            <TodoTaskList
              dateLabel={selectedDateLabel}
              locked={locked}
              loading={loading}
              tasks={tasksForSelectedDate}
              onToggle={(todo) => runTodoAction(() => toggleTodo(todo))}
              onEdit={(todo, payload) => runTodoAction(() => editTodo(todo, payload))}
              onDelete={(todo) => runTodoAction(() => removeTodo(todo))}
            />

            <div className="todo-right-column">
              <motion.div
                className="todo-glass-panel today-summary-card"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.12 }}
              >
                <span>{locked ? "Locked Record" : "Live Focus"}</span>
                <strong>{completionSummary}</strong>
                <p>{locked ? "Previous day tracking is read-only." : "Task progress saves instantly."}</p>
              </motion.div>
              <MotivationPanel
                locked={locked}
                pendingCarryovers={pendingCarryovers}
                selectedTasks={tasksForSelectedDate}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
