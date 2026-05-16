"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3, Edit3, LockKeyhole, Trash2 } from "lucide-react";
import { useState } from "react";
import { TODO_PRIORITIES } from "../../services/todos";

function formatDisplayTime(todo) {
  if (todo.time) {
    const [hours, minutes] = todo.time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  if (todo.createdLocal) {
    return new Date(todo.createdLocal).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  return "Now";
}

function TaskEditForm({ todo, onCancel, onSave }) {
  const [task, setTask] = useState(todo.task || "");
  const [note, setNote] = useState(todo.note || "");
  const [time, setTime] = useState(todo.time || "09:00");
  const [priority, setPriority] = useState(todo.priority || "Medium");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!task.trim()) return;

    try {
      setBusy(true);
      await onSave(todo, { task, note, time, priority });
      onCancel();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="todo-edit-form" onSubmit={handleSubmit}>
      <input value={task} onChange={(event) => setTask(event.target.value)} aria-label="Edit task" />
      <input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Edit note" />
      <div>
        <input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Edit time"
        />
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          aria-label="Edit priority"
        >
          {TODO_PRIORITIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export default function TodoTaskList({
  dateLabel,
  locked,
  loading,
  tasks,
  onToggle,
  onEdit,
  onDelete
}) {
  const [editingId, setEditingId] = useState(null);

  return (
    <motion.section
      className="todo-glass-panel task-board-panel"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
    >
      <div className="task-board-heading">
        <div>
          <h1>{dateLabel}</h1>
          <p>{loading ? "Syncing tasks..." : `${tasks.length} Tasks`}</p>
        </div>
        {locked ? (
          <span className="lock-status">
            <LockKeyhole size={16} />
            Day locked
          </span>
        ) : null}
      </div>

      <div className="task-card-list">
        <AnimatePresence mode="popLayout">
          {!loading && tasks.length === 0 ? (
            <motion.div
              className="empty-task-state"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <span>+</span>
              <h2>No tasks on this date</h2>
              <p>Use Quick Add to build a focused plan for this day.</p>
            </motion.div>
          ) : null}

          {tasks.map((todo) => {
            const taskLocked = locked || todo.locked;
            const isEditing = editingId === todo.id;

            return (
              <motion.article
                key={todo.id}
                className={[
                  "task-card",
                  todo.completed ? "is-complete" : "",
                  taskLocked ? "is-locked" : ""
                ].join(" ")}
                layout
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                whileHover={{ y: taskLocked ? 0 : -3 }}
              >
                {isEditing ? (
                  <TaskEditForm
                    todo={todo}
                    onCancel={() => setEditingId(null)}
                    onSave={onEdit}
                  />
                ) : (
                  <>
                    <button
                      className={`task-check ${todo.completed ? "is-done" : ""}`}
                      type="button"
                      aria-label={todo.completed ? "Mark task incomplete" : "Complete task"}
                      onClick={() => onToggle(todo)}
                      disabled={taskLocked}
                    >
                      {todo.completed ? <Check size={18} /> : null}
                    </button>

                    <div className="task-copy">
                      <div>
                        <h2>{todo.task}</h2>
                        <span className={`priority priority-${String(todo.priority).toLowerCase()}`}>
                          {todo.priority || "Medium"}
                        </span>
                      </div>
                      <p>{todo.note || "No note added yet"}</p>
                      <small>
                        <Clock3 size={15} />
                        {formatDisplayTime(todo)}
                      </small>
                    </div>

                    <div className="task-actions">
                      <button
                        type="button"
                        aria-label="Edit task"
                        onClick={() => setEditingId(todo.id)}
                        disabled={taskLocked}
                      >
                        <Edit3 size={18} />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete task"
                        onClick={() => onDelete(todo)}
                        disabled={taskLocked}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </>
                )}
              </motion.article>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
