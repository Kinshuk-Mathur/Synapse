"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  CheckCircle2,
  Dumbbell,
  Edit3,
  Film,
  Heart,
  Laptop,
  Sparkles,
  Trash2
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatDeadlineStatus } from "../../services/monthlyGoals";
import GoalForm from "./GoalForm";

const categoryIcons = {
  Study: BookOpen,
  Coding: Laptop,
  Fitness: Dumbbell,
  Content: Film,
  Personal: Heart
};

export default function GoalCard({ goal, month, year, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [quickProgress, setQuickProgress] = useState(Number(goal.progress) || 0);
  const [savingProgress, setSavingProgress] = useState(false);
  const Icon = categoryIcons[goal.category] || Sparkles;
  const progress = Number(goal.progress) || 0;
  const sliderProgress = Math.min(100, Math.max(0, Math.round(Number(quickProgress) || 0)));
  const remaining = Math.max(0, 100 - progress);
  const completed = Boolean(goal.completed) || progress >= 100 || goal.status === "Completed";
  const deadlineText = formatDeadlineStatus(goal.deadlineDate || goal.deadline);

  useEffect(() => {
    setQuickProgress(progress);
  }, [progress]);

  const saveQuickProgress = async () => {
    if (savingProgress || sliderProgress === progress) return;

    try {
      setSavingProgress(true);
      await onEdit(goal, {
        ...goal,
        target: 100,
        currentProgress: sliderProgress,
        progressPercentage: sliderProgress
      });
    } finally {
      setSavingProgress(false);
    }
  };

  return (
    <motion.article
      className={`goal-card ${completed ? "is-complete" : ""}`}
      layout
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 22, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      whileHover={{ y: -4 }}
    >
      <AnimatePresence>
        {completed ? (
          <motion.span
            className="goal-complete-burst"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
          >
            <Sparkles size={18} />
          </motion.span>
        ) : null}
      </AnimatePresence>

      {editing ? (
        <GoalForm
          mode="edit"
          goal={goal}
          month={month}
          year={year}
          onCancel={() => setEditing(false)}
          onSave={async (payload) => {
            await onEdit(goal, payload);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="goal-card-top">
            <span className={`goal-category-icon category-${String(goal.category).toLowerCase()}`}>
              <Icon size={20} />
            </span>
            <div>
              <h2>{goal.title}</h2>
              <p>{goal.description || "No description added yet"}</p>
            </div>
            <div className="goal-card-actions">
              <button type="button" aria-label="Edit goal" onClick={() => setEditing(true)}>
                <Edit3 size={17} />
              </button>
              <button type="button" aria-label="Delete goal" onClick={() => onDelete(goal)}>
                <Trash2 size={17} />
              </button>
            </div>
          </div>

          <div className="goal-card-meta">
            <span className={`goal-status status-${String(goal.status).toLowerCase().replaceAll(" ", "-")}`}>
              {completed ? <CheckCircle2 size={14} /> : null}
              {goal.status}
            </span>
            <span>{goal.category}</span>
            <span>{deadlineText}</span>
          </div>

          <div className="goal-progress-row">
            <div>
              <strong>{progress}%</strong>
              <span>complete</span>
            </div>
            <small>{savingProgress ? "Saving..." : `${remaining}% remaining`}</small>
          </div>

          <div className="goal-progress-track">
            <motion.i
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            />
          </div>

          <label className="goal-card-slider">
            <span>Update progress</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={sliderProgress}
              disabled={savingProgress}
              onChange={(event) => setQuickProgress(event.target.value)}
              onPointerUp={saveQuickProgress}
              onBlur={saveQuickProgress}
              onKeyUp={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) {
                  saveQuickProgress();
                }
              }}
              aria-label={`Update ${goal.title} progress percentage`}
            />
            <strong>{sliderProgress}%</strong>
          </label>

          {goal.notes ? <p className="goal-note">{goal.notes}</p> : null}
        </>
      )}
    </motion.article>
  );
}
