"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  LogOut,
  Menu,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useMonthlyGoals } from "../../hooks/useMonthlyGoals";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";
import {
  GOAL_FILTERS,
  getCurrentGoalMonth,
  getMonthName
} from "../../services/monthlyGoals";
import NotificationCenter from "../NotificationCenter";
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
  const [navigationOpen, setNavigationOpen] = useState(false);
  useSynapseTheme();
  const { logout } = useAuth();
  const {
    selectedGoals,
    selectedTrend,
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

  useEffect(() => {
    if (!navigationOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.classList.add("synapse-scroll-locked");
    document.body.style.overflow = "hidden";

    return () => {
      document.body.classList.remove("synapse-scroll-locked");
      document.body.style.overflow = previousOverflow;
    };
  }, [navigationOpen]);

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
        <button
          className={`sidebar-scrim ${navigationOpen ? "is-visible" : ""}`}
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />

        <GoalsSidebar open={navigationOpen} onNavigate={() => setNavigationOpen(false)} />

        <section className="workspace goals-workspace">
          <header className="goals-topbar">
            <div className="goals-heading-block">
              <button
                className="icon-button app-sidebar-toggle"
                aria-label="Open navigation"
                aria-expanded={navigationOpen}
                type="button"
                onClick={() => setNavigationOpen(true)}
              >
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
              <button
                type="button"
                onClick={() => {
                  setSelectedYear(current.year);
                  setSelectedMonth(current.month);
                }}
              >
                Today
              </button>
              <span className="goals-current-month">{monthTitle}</span>
              <NotificationCenter />
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

            <GoalsOverviewPanel stats={selectedStats} trend={selectedTrend} />
          </div>
        </section>
      </div>
    </main>
  );
}
