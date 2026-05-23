"use client";

import { motion } from "framer-motion";
import { Sparkles, TrendingUp } from "lucide-react";

function Ring({ value }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  return (
    <svg className="goals-overview-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r={radius} />
      <motion.circle
        cx="60"
        cy="60"
        r={radius}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.75, ease: "easeOut" }}
        style={{ strokeDasharray: circumference }}
      />
    </svg>
  );
}

export default function GoalsOverviewPanel({ stats, trend = [] }) {
  const trendPoints = trend.length
    ? trend
    : ["Week 1", "Week 2", "Week 3", "Week 4"].map((label) => ({ label, value: 0 }));
  const hasTrendData = trendPoints.some((point) => Number(point.value) > 0);

  return (
    <aside className="goals-right-rail">
      <motion.section
        className="goal-side-card monthly-overview-card"
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.42 }}
      >
        <div className="goal-side-title">
          <Sparkles size={16} />
          <h3>Monthly Overview</h3>
        </div>
        <div className="overview-ring-wrap">
          <Ring value={stats.averageProgress} />
          <div>
            <strong>{stats.averageProgress}%</strong>
            <span>Completed</span>
          </div>
        </div>
        <div className="overview-metrics">
          <p>
            <i className="dot-pending" />
            Total Goals <b>{stats.total}</b>
          </p>
          <p>
            <i className="dot-completed" />
            Completed <b>{stats.completed}</b>
          </p>
          <p>
            <i className="dot-pending" />
            In Progress <b>{stats.inProgress}</b>
          </p>
          <p>
            <i className="dot-overdue" />
            Not Started <b>{stats.notStarted}</b>
          </p>
        </div>
        <small>{stats.completed === stats.total && stats.total ? "Perfect month. Keep the system warm." : "Keep going. One goal at a time."}</small>
      </motion.section>

      <motion.section
        className="goal-side-card trend-card"
        initial={{ opacity: 0, x: 18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.42, delay: 0.06 }}
      >
        <div className="goal-side-title">
          <TrendingUp size={16} />
          <h3>Goal Progress Trend</h3>
        </div>
        <div className="mini-trend-chart">
          {trendPoints.map((point, index) => (
            <motion.span
              key={point.label}
              title={`${point.label}: ${point.value}%`}
              initial={{ height: 8 }}
              animate={{ height: `${point.value}%` }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
            />
          ))}
        </div>
        <div className="trend-labels">
          {trendPoints.map((point) => (
            <span key={point.label}>{point.label}</span>
          ))}
        </div>
        <small>{hasTrendData ? "Live progress from goal updates." : "No progress updates recorded yet."}</small>
      </motion.section>
    </aside>
  );
}
