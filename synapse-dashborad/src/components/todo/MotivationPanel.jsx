"use client";

import { motion } from "framer-motion";
import { Check, LockKeyhole, Sparkles, Target, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function getTimeUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const remaining = Math.max(0, midnight.getTime() - now.getTime());

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return {
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0")
  };
}

export default function MotivationPanel({ locked, pendingCarryovers, selectedTasks }) {
  const [timeLeft, setTimeLeft] = useState(getTimeUntilMidnight);

  useEffect(() => {
    const timer = window.setInterval(() => setTimeLeft(getTimeUntilMidnight()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const total = selectedTasks.length;
    const completed = selectedTasks.filter((todo) => todo.completed).length;
    const pending = total - completed;
    const completion = total ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      completion,
      allDone: total > 0 && pending === 0
    };
  }, [selectedTasks]);

  const headline = stats.allDone
    ? "Clean finish. Your focus loop is complete."
    : locked
      ? "Day locked. Use this record to plan smarter."
      : "Stay organized. Stay productive.";

  const body = stats.allDone
    ? "You completed every task for this date. SYNAPSE saved the win for your progress system."
    : stats.pending > 0
      ? "Keep the next task small and visible. One clean move is enough to regain momentum."
      : "Choose a date, add a plan, and let the day feel less noisy.";

  return (
    <motion.aside
      className="todo-glass-panel motivation-panel"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.15 }}
    >
      <div className="motivation-art" aria-hidden="true">
        <span className="star star-one" />
        <span className="star star-two" />
        <span className="star star-three" />
        <div className="calendar-orbit">
          <div className="calendar-rings">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="calendar-face">
            {Array.from({ length: 9 }).map((_, index) => (
              <b key={index}>{index % 2 === 0 ? <Check size={18} /> : null}</b>
            ))}
          </div>
          <div className="calendar-check">
            <Check size={48} />
          </div>
        </div>
      </div>

      <div className="motivation-copy">
        <h2>{headline}</h2>
        <p>{body}</p>
      </div>

      <div className="productivity-cards">
        <div>
          <Sparkles size={18} />
          <span>Completion</span>
          <strong>{stats.completion}%</strong>
        </div>
        <div>
          <Target size={18} />
          <span>Pending</span>
          <strong>{stats.pending}</strong>
        </div>
      </div>

      <div className="pending-reminders">
        <h3>Pending Carryovers</h3>
        {pendingCarryovers.length ? (
          pendingCarryovers.map((todo) => (
            <article key={todo.id}>
              <span className={`priority priority-${String(todo.priority).toLowerCase()}`}>
                {todo.priority || "Medium"}
              </span>
              <p>{todo.task}</p>
              <small>{todo.selectedDate}</small>
            </article>
          ))
        ) : (
          <p className="no-pending-copy">No older incomplete tasks. Nice and clean.</p>
        )}
      </div>

      <div className="lock-countdown-card">
        <LockKeyhole size={20} />
        <div>
          <span>{locked ? "This day is locked" : "Day will lock in"}</span>
          <strong>
            {timeLeft.hours} <i>:</i> {timeLeft.minutes} <i>:</i> {timeLeft.seconds}
          </strong>
          <small>After lock, tasks cannot be modified.</small>
        </div>
        <TimerReset size={20} />
      </div>
    </motion.aside>
  );
}
