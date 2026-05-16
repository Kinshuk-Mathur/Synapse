"use client";

import { motion } from "framer-motion";
import { CalendarDays, Flag, Gauge, NotebookText, Target } from "lucide-react";
import { useState } from "react";
import { GOAL_CATEGORIES } from "../../services/monthlyGoals";

const emptyGoal = {
  title: "",
  description: "",
  category: "Study",
  target: 100,
  currentProgress: 0,
  deadline: "",
  notes: ""
};

export default function GoalForm({ mode = "create", goal, month, year, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyGoal,
    ...goal,
    target: goal?.target ?? 100,
    currentProgress: goal?.currentProgress ?? 0
  }));
  const [busy, setBusy] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;

    try {
      setBusy(true);
      await onSave({
        ...form,
        month,
        year
      });

      if (mode === "create") {
        setForm(emptyGoal);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      className={`goal-form ${mode === "edit" ? "is-editing" : ""}`}
      onSubmit={handleSubmit}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
    >
      <label>
        <Target size={16} />
        <input
          value={form.title}
          onChange={(event) => updateField("title", event.target.value)}
          placeholder="Goal title"
          aria-label="Goal title"
        />
      </label>

      <label>
        <NotebookText size={16} />
        <input
          value={form.description}
          onChange={(event) => updateField("description", event.target.value)}
          placeholder="Description"
          aria-label="Goal description"
        />
      </label>

      <div className="goal-form-grid">
        <label>
          <Flag size={16} />
          <select
            value={form.category}
            onChange={(event) => updateField("category", event.target.value)}
            aria-label="Goal category"
          >
            {GOAL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          <Gauge size={16} />
          <input
            type="number"
            min="1"
            value={form.target}
            onChange={(event) => updateField("target", event.target.value)}
            aria-label="Goal target"
          />
        </label>

        <label>
          <Gauge size={16} />
          <input
            type="number"
            min="0"
            value={form.currentProgress}
            onChange={(event) => updateField("currentProgress", event.target.value)}
            aria-label="Goal current progress"
          />
        </label>

        <label>
          <CalendarDays size={16} />
          <input
            type="date"
            value={form.deadline}
            onChange={(event) => updateField("deadline", event.target.value)}
            aria-label="Goal deadline"
          />
        </label>
      </div>

      <label>
        <NotebookText size={16} />
        <input
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          placeholder="Notes"
          aria-label="Goal notes"
        />
      </label>

      <div className="goal-form-actions">
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <motion.button
          className="todo-primary-button"
          type="submit"
          disabled={busy || !form.title.trim()}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
        >
          {busy ? "Saving..." : mode === "edit" ? "Save Goal" : "Add Goal"}
        </motion.button>
      </div>
    </motion.form>
  );
}
