"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  LogOut,
  Menu,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useMonthlyGoals } from "../../hooks/useMonthlyGoals";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";
import {
  GOAL_FILTERS,
  getCurrentGoalMonth,
  getMonthName
} from "../../services/monthlyGoals";
import TodoThemeSwitcher from "../todo/TodoThemeSwitcher";
import GoalCard from "./GoalCard";
import GoalForm from "./GoalForm";
import GoalsOverviewPanel from "./GoalsOverviewPanel";
import GoalsSidebar from "./GoalsSidebar";
import MonthCards from "./MonthCards";

function normalizeStats(stats = {}) {
  return {
    total: stats.total || 0,
    completed: stats.completed || 0,
    inProgress: stats.inProgress || 0,
    notStarted: stats.notStarted || 0,
    averageProgress: stats.averageProgress || 0
  };
}

export default function GoalsWorkspace() {
  const current = getCurrentGoalMonth();
  const [selectedMonth, setSelectedMonth] = useState(current.month);
  const [selectedYear, setSelectedYear] = useState(current.year);
  const [filter, setFilter] = useState("All");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [actionError, setActionError] = useState("");
  const { theme, applyTheme } = useSynapseTheme();
  const { user, logout } = useAuth();
  const {
    selectedGoals,
    monthStats,
    loading,
    error,
    setError,
    createGoal,
    editGoal,
    removeGoal
  } = useMonthlyGoals(selectedMonth, selectedYear);

  const selectedStats = normalizeStats(monthStats.get(`${selectedYear}-${selectedMonth}`));
  const filteredGoals = useMemo(() => {
    if (filter === "All") return selectedGoals;
    return selectedGoals.filter((goal) => goal.status === filter);
  }, [filter, selectedGoals]);
  const monthTitle = `${getMonthName(selectedMonth)} ${selectedYear}`;
  const studentName = user?.displayName?.split(" ")[0] || "STUDENT";

  const runGoalAction = async (action) => {
    try {
      setActionError("");
      setError("");
      await action();
    } catch (goalError) {
      setActionError(goalError.message || "Goal action failed.");
    }
  };

  return (
    <main className="site-shell">
      <div className="ambient-grid" aria-hidden="true" />

      <div className="dashboard-frame goals-dashboard-frame">
        <GoalsSidebar />

        <section className="workspace goals-workspace">
          <header className="goals-topbar">
            <div className="goals-heading-block">
              <button className="icon-button menu-button" aria-label="Open navigation" type="button">
                <Menu size={22} />
              </button>
              <div>
                <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  Monthly Goals
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                >
                  Set goals. Track progress. Achieve consistency.
                </motion.p>
              </div>
            </div>

            <div className="goals-header-actions">
              <button type="button" onClick={() => setSelectedMonth(current.month)}>
                <CalendarDays size={16} />
                Today
              </button>
              <label>
                <CalendarDays size={16} />
                <input
                  type="month"
                  value={`${selectedYear}-${String(selectedMonth).padStart(2, "0")}`}
                  onChange={(event) => {
                    const [year, month] = event.target.value.split("-").map(Number);
                    setSelectedYear(year);
                    setSelectedMonth(month);
                  }}
                  aria-label="Select goal month"
                />
                <ChevronDown size={14} />
              </label>
              <TodoThemeSwitcher theme={theme} onChange={applyTheme} />
              <button className="icon-button notification" aria-label="Notifications" type="button">
                <Bell size={20} />
                <span>{selectedStats.inProgress || 1}</span>
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
                  <small>Goal Mode</small>
                </div>
                <ChevronDown size={14} />
              </div>
              <button className="logout-button" type="button" onClick={() => runGoalAction(logout)}>
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

          <div className="goals-layout-grid">
            <div className="goals-main-column">
              <MonthCards
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                monthStats={monthStats}
                onSelectMonth={setSelectedMonth}
              />

              <motion.section
                className="goals-workspace-panel"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.08 }}
              >
                <div className="goals-panel-top">
                  <div>
                    <h2>{monthTitle} Goals</h2>
                    <div className="monthly-progress-line">
                      <motion.i
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedStats.averageProgress}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                      />
                    </div>
                    <p>
                      {selectedStats.completed} of {selectedStats.total} goals completed
                    </p>
                  </div>
                  <strong>{selectedStats.averageProgress}%</strong>
                  <motion.button
                    className="goals-add-button"
                    type="button"
                    onClick={() => setShowAddGoal((value) => !value)}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Plus size={18} />
                    Add Goal
                  </motion.button>
                </div>

                <AnimatePresence>
                  {showAddGoal ? (
                    <GoalForm
                      month={selectedMonth}
                      year={selectedYear}
                      onCancel={() => setShowAddGoal(false)}
                      onSave={(payload) =>
                        runGoalAction(async () => {
                          await createGoal(payload);
                          setShowAddGoal(false);
                        })
                      }
                    />
                  ) : null}
                </AnimatePresence>

                <div className="goals-filter-row">
                  <div>
                    {GOAL_FILTERS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={filter === item ? "is-active" : ""}
                        onClick={() => setFilter(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <button type="button">
                    <SlidersHorizontal size={15} />
                    Sort by: Priority
                  </button>
                </div>

                <div className="goal-list-stack">
                  <AnimatePresence mode="popLayout">
                    {loading ? (
                      <motion.div className="goals-empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        Syncing monthly goals...
                      </motion.div>
                    ) : filteredGoals.length ? (
                      filteredGoals.map((goal) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          month={selectedMonth}
                          year={selectedYear}
                          onEdit={(selectedGoal, payload) => runGoalAction(() => editGoal(selectedGoal, payload))}
                          onDelete={(selectedGoal) => runGoalAction(() => removeGoal(selectedGoal))}
                        />
                      ))
                    ) : (
                      <motion.div
                        className="goals-empty-state"
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                      >
                        <span>+</span>
                        <h3>No goals here yet</h3>
                        <p>Add a monthly goal and SYNAPSE will calculate progress automatically.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.section>
            </div>

            <GoalsOverviewPanel stats={selectedStats} />
          </div>
        </section>
      </div>
    </main>
  );
}
