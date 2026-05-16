"use client";

import { motion } from "framer-motion";
import { monthNames } from "../../services/monthlyGoals";

function CircularProgress({ value }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <svg className="goal-ring" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r={radius} />
      <motion.circle
        cx="26"
        cy="26"
        r={radius}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.65, ease: "easeOut" }}
        style={{
          strokeDasharray: circumference
        }}
      />
    </svg>
  );
}

export default function MonthCards({ selectedMonth, selectedYear, onSelectMonth, monthStats }) {
  return (
    <motion.section
      className="goals-month-strip"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      {monthNames.map((monthName, index) => {
        const month = index + 1;
        const stats = monthStats.get(`${selectedYear}-${month}`) || {
          total: 0,
          completed: 0,
          averageProgress: 0
        };
        const active = Number(selectedMonth) === month;

        return (
          <motion.button
            key={monthName}
            className={`goal-month-card ${active ? "is-active" : ""}`}
            type="button"
            onClick={() => onSelectMonth(month)}
            whileHover={{ y: -5 }}
            whileTap={{ scale: 0.97 }}
          >
            <div>
              <strong>{monthName}</strong>
              <span>{selectedYear}</span>
            </div>
            <CircularProgress value={stats.averageProgress} />
            <footer>
              <b>{stats.averageProgress}%</b>
              <span>
                {stats.completed}/{stats.total} goals
              </span>
            </footer>
          </motion.button>
        );
      })}
    </motion.section>
  );
}
