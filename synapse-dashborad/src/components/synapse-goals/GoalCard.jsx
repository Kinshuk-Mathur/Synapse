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
import { useState } from "react";
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
  const Icon = categoryIcons[goal.category] || Sparkles;
  const progress = Number(goal.progressPercentage) || 0;
  const remaining = Math.max(0, 100 - progress);
  const completed = progress >= 100 || goal.status === "Completed";

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
            <span>{goal.deadline ? `Deadline ${goal.deadline}` : "No deadline"}</span>
          </div>

          <div className="goal-progress-row">
            <div>
              <strong>
                {goal.currentProgress}/{goal.target}
              </strong>
              <span>{progress}% complete</span>
            </div>
            <small>{remaining}% remaining</small>
          </div>

          <div className="goal-progress-track">
            <motion.i
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.65, ease: "easeOut" }}
            />
          </div>

          {goal.notes ? <p className="goal-note">{goal.notes}</p> : null}
        </>
      )}
    </motion.article>
  );
}
