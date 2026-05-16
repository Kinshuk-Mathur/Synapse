"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateKey, isDateLocked } from "../../services/todos";

const weekDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function getCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      dateKey: formatDateKey(date),
      inMonth: date.getMonth() === month
    };
  });
}

function getStatusDots(stats, dateKey) {
  if (!stats?.total) return ["empty"];
  if (stats.pending > 0 && isDateLocked(dateKey)) return ["overdue"];
  if (stats.pending > 0 && stats.completed > 0) return ["completed", "pending"];
  if (stats.pending > 0) return ["pending"];
  return ["completed"];
}

export default function TodoCalendar({
  calendarStats,
  currentMonth,
  onMonthChange,
  selectedDate,
  onDateSelect
}) {
  const days = getCalendarDays(currentMonth);
  const monthTitle = currentMonth.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric"
  });

  return (
    <motion.section
      className="todo-glass-panel todo-calendar-panel"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <div className="todo-panel-heading">
        <h2>{monthTitle}</h2>
        <div className="todo-calendar-controls">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => onMonthChange(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="todo-weekdays">
        {weekDays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="todo-calendar-grid">
        {days.map((day) => {
          const stats = calendarStats.get(day.dateKey);
          const statusDots = getStatusDots(stats, day.dateKey);
          const isSelected = selectedDate === day.dateKey;
          const isToday = formatDateKey() === day.dateKey;

          return (
            <motion.button
              key={day.dateKey}
              type="button"
              className={[
                "todo-date-cell",
                day.inMonth ? "" : "is-muted",
                isSelected ? "is-selected" : "",
                isToday ? "is-today" : ""
              ].join(" ")}
              whileHover={{ y: -2, scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onDateSelect(day.dateKey)}
            >
              <span>{day.date.getDate()}</span>
              <i aria-hidden="true">
                {statusDots.map((status) => (
                  <b key={`${day.dateKey}-${status}`} className={`dot-${status}`} />
                ))}
              </i>
            </motion.button>
          );
        })}
      </div>

      <div className="todo-calendar-legend">
        <span>
          <b className="dot-completed" /> Completed
        </span>
        <span>
          <b className="dot-pending" /> Pending
        </span>
        <span>
          <b className="dot-overdue" /> Overdue
        </span>
        <span>
          <b className="dot-empty" /> No Tasks
        </span>
      </div>
    </motion.section>
  );
}
