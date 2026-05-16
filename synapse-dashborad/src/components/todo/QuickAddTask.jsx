"use client";

import { motion } from "framer-motion";
import { Clock3, Flag, Plus } from "lucide-react";
import { useState } from "react";
import { TODO_PRIORITIES } from "../../services/todos";

export default function QuickAddTask({ locked, onAdd }) {
  const [task, setTask] = useState("");
  const [note, setNote] = useState("");
  const [time, setTime] = useState("09:00");
  const [priority, setPriority] = useState("Medium");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedTask = task.trim();

    if (!trimmedTask || locked) {
      return;
    }

    try {
      setBusy(true);
      await onAdd({
        task: trimmedTask,
        note,
        time,
        priority
      });
      setTask("");
      setNote("");
      setPriority("Medium");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form
      className={`todo-glass-panel quick-add-panel ${locked ? "is-locked" : ""}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 }}
      onSubmit={handleSubmit}
    >
      <div className="todo-panel-heading">
        <h2>Quick Add</h2>
        <span className="quick-add-orb">
          <Plus size={18} />
        </span>
      </div>

      <label className="todo-input-shell">
        <input
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder={locked ? "This day is locked" : "Add a new task..."}
          disabled={locked || busy}
          aria-label="Task title"
        />
      </label>

      <label className="todo-input-shell">
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note..."
          disabled={locked || busy}
          aria-label="Task note"
        />
      </label>

      <div className="quick-add-controls">
        <label>
          <Clock3 size={16} />
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            disabled={locked || busy}
            aria-label="Task time"
          />
        </label>

        <label>
          <Flag size={16} />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={locked || busy}
            aria-label="Task priority"
          >
            {TODO_PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <motion.button
        className="todo-primary-button"
        type="submit"
        disabled={locked || busy || !task.trim()}
        whileHover={{ y: locked ? 0 : -2 }}
        whileTap={{ scale: locked ? 1 : 0.98 }}
      >
        {busy ? "Adding..." : "Add Task"}
      </motion.button>
    </motion.form>
  );
}
