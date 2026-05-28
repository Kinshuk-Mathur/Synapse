import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import {
  buildDailyAnalyticsFromSources,
  buildWeeklyReport,
  getStrongestFocusWindow,
  syncWeeklyReport
} from "./analytics";
import { COLLECTIONS } from "./firestore";
import { getFirebaseDb } from "../lib/firebase";
import { formatDateKey, parseDateKey } from "./todos";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_LIMIT = 40;
const MAX_GENERATED_PER_CHECK = 12;

export const NOTIFICATION_ACTIONS = {
  dashboard: "/",
  focus: "/focus",
  goals: "/goals",
  analytics: "/analytics",
  todo: "/todo",
  ai: "/synapse-ai"
};

const PRIORITY_WEIGHT = {
  high: 0,
  medium: 1,
  low: 2
};

const TYPE_WEIGHT = {
  momentum: 0,
  weekly_report: 1,
  goal: 2,
  focuslock: 3,
  ai_coaching: 4,
  recovery: 5,
  achievement: 6,
  study_suggestion: 7,
  task: 8
};

const SUBJECT_KEYWORDS = [
  { subject: "Math", pattern: /\b(math|maths|calculus|algebra|geometry|trigonometry|statistics)\b/i },
  { subject: "Physics", pattern: /\b(physics|mechanics|thermo|electricity|magnetism|optics|waves)\b/i },
  { subject: "Chemistry", pattern: /\b(chemistry|organic|inorganic|physical chem|stoichiometry)\b/i },
  { subject: "Biology", pattern: /\b(biology|bio|anatomy|genetics|ecology|botany|zoology)\b/i },
  { subject: "Coding", pattern: /\b(code|coding|programming|javascript|react|next|python|java|dsa|algorithm)\b/i },
  { subject: "English", pattern: /\b(english|essay|writing|literature|grammar|reading)\b/i },
  { subject: "Economics", pattern: /\b(economics|economy|macro|micro|finance|accounts|accounting)\b/i },
  { subject: "History", pattern: /\b(history|civics|politics|geography|social science)\b/i }
];

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === "function") return value.toDate();

  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function dateKeyFromValue(value, fallback = new Date()) {
  return formatDateKey(coerceDate(value) || fallback);
}

function dateDiffInDays(startKey, endKey) {
  return Math.round((startOfDay(parseDateKey(endKey)) - startOfDay(parseDateKey(startKey))) / DAY_MS);
}

function getDateRange(startDateKey, endDateKey) {
  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);
  const days = Math.max(0, Math.round((startOfDay(endDate) - startOfDay(startDate)) / DAY_MS));

  return Array.from({ length: days + 1 }, (_, index) => formatDateKey(addDays(startDate, index)));
}

function getWeekRange(referenceDate = new Date(), offset = 0) {
  const today = startOfDay(referenceDate);
  const mondayOffset = (today.getDay() + 6) % 7;
  const startDate = addDays(today, -mondayOffset + offset * 7);
  const endDate = addDays(startDate, 6);
  const startDateKey = formatDateKey(startDate);
  const endDateKey = formatDateKey(endDate);

  return {
    startDate,
    endDate,
    startDateKey,
    endDateKey,
    weekKey: `${startDateKey}_${endDateKey}`,
    rangeLabel: formatShortRange(startDateKey, endDateKey)
  };
}

function formatShortRange(startDateKey, endDateKey) {
  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const start = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric"
  });

  return `${start} - ${end}`;
}

function formatMinutes(minutes = 0) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function notificationCollection(uid) {
  const db = getFirebaseDb();
  return collection(db, COLLECTIONS.users, uid, COLLECTIONS.notifications);
}

function notificationDocument(uid, notificationId) {
  const db = getFirebaseDb();
  return doc(db, COLLECTIONS.users, uid, COLLECTIONS.notifications, notificationId);
}

function sourceSignature(payload = {}) {
  return JSON.stringify({
    type: payload.type,
    title: payload.title,
    message: payload.message,
    action: payload.action,
    priority: payload.priority,
    cta: payload.cta || ""
  });
}

function safeDocumentId(value = "") {
  return String(value)
    .trim()
    .replace(/[\/?#\[\]\s]+/g, "-")
    .replace(/[^a-zA-Z0-9_.:-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function createCandidate(payload) {
  const priority = ["high", "medium", "low"].includes(payload.priority) ? payload.priority : "medium";
  const action = NOTIFICATION_ACTIONS[payload.action] ? payload.action : "dashboard";
  const candidate = {
    ...payload,
    id: safeDocumentId(payload.id),
    priority,
    action,
    read: false,
    generatedBy: "synapse-notification-engine"
  };

  return {
    ...candidate,
    signature: sourceSignature(candidate)
  };
}

function normalizeNotification(snapshotDoc) {
  const data = snapshotDoc.data();
  const createdAtDate = coerceDate(data.createdAt) || coerceDate(data.updatedAt) || new Date();

  return {
    id: snapshotDoc.id,
    type: data.type || "ai_coaching",
    title: data.title || "SYNAPSE Signal",
    message: data.message || "",
    action: data.action || "dashboard",
    read: Boolean(data.read),
    priority: data.priority || "medium",
    createdAt: data.createdAt || null,
    createdAtDate,
    cta: data.cta || "",
    signature: data.signature || "",
    generatedBy: data.generatedBy || ""
  };
}

function normalizeGoal(goal = {}) {
  const progress = Math.min(100, Math.max(0, Math.round(Number(goal.progress ?? goal.progressPercentage) || 0)));
  const createdDate = coerceDate(goal.createdAt || goal.createdLocal || goal.createdDate);
  const updatedDate = coerceDate(goal.updatedAt || goal.updatedLocal || goal.updatedDate || goal.createdAt);
  const deadlineDate = coerceDate(goal.deadline || goal.deadlineDate);
  const history = Array.isArray(goal.progressHistory)
    ? goal.progressHistory
        .map((entry) => {
          const recordedDate = coerceDate(entry.recordedAt || entry.updatedAt || entry.date || entry.recordedAtDate);
          return {
            progress: Math.min(100, Math.max(0, Math.round(Number(entry.progress) || 0))),
            recordedDate,
            dateKey: entry.dateKey || (recordedDate ? formatDateKey(recordedDate) : "")
          };
        })
        .filter((entry) => entry.recordedDate || entry.dateKey)
    : [];

  if (!history.length && updatedDate) {
    history.push({
      progress,
      recordedDate: updatedDate,
      dateKey: formatDateKey(updatedDate)
    });
  }

  history.sort((a, b) => (a.recordedDate || new Date(0)) - (b.recordedDate || new Date(0)));

  return {
    ...goal,
    progress,
    completed: Boolean(goal.completed) || progress >= 100,
    title: goal.title || "Untitled goal",
    createdDate,
    updatedDate,
    deadlineDate,
    deadlineDateKey: deadlineDate ? formatDateKey(deadlineDate) : "",
    history
  };
}

function goalProgressAt(goal, dateKey) {
  const dateEnd = parseDateKey(dateKey);
  dateEnd.setHours(23, 59, 59, 999);
  const entries = goal.history.filter((entry) => {
    const recordedDate = entry.recordedDate || (entry.dateKey ? parseDateKey(entry.dateKey) : null);
    return recordedDate && recordedDate <= dateEnd;
  });

  if (entries.length) return entries[entries.length - 1].progress;
  if (goal.createdDate && goal.createdDate <= dateEnd) return 0;
  return null;
}

function focusDateKey(session = {}) {
  return session.dateKey || session.date || dateKeyFromValue(session.startedAt || session.completedAt || session.endedAt);
}

function focusMinutes(session = {}) {
  if (session.focusSeconds !== undefined) return Math.max(0, Math.round(Number(session.focusSeconds || 0) / 60));
  if (session.durationSeconds !== undefined) return Math.max(0, Math.round(Number(session.durationSeconds || 0) / 60));
  const duration = Number(session.duration || 0);
  return duration > 600 ? Math.round(duration / 60) : Math.round(duration);
}

function mapFocusByDate(sessions = []) {
  const byDate = {};

  sessions.forEach((session) => {
    const dateKey = focusDateKey(session);
    if (!dateKey) return;
    byDate[dateKey] = (byDate[dateKey] || 0) + focusMinutes(session);
  });

  return byDate;
}

function sumDateValues(byDate, dateKeys) {
  return dateKeys.reduce((sum, dateKey) => sum + Number(byDate[dateKey] || 0), 0);
}

function getLastActivityDate(days = [], focusByDate = {}, todos = [], goals = []) {
  const activeKeys = new Set();

  days.forEach((day) => {
    if (day.hasActivity || day.focusMinutes || day.tasksCompleted || day.goalsUpdated || day.aiUsageCount) {
      activeKeys.add(day.dateKey);
    }
  });

  Object.entries(focusByDate).forEach(([dateKey, minutes]) => {
    if (minutes > 0) activeKeys.add(dateKey);
  });

  todos.forEach((todo) => {
    if (todo.completed) activeKeys.add(todo.selectedDate || todo.date || dateKeyFromValue(todo.completedAt || todo.updatedAt));
  });

  goals.forEach((goal) => {
    if (goal.updatedDate) activeKeys.add(formatDateKey(goal.updatedDate));
  });

  return Array.from(activeKeys).sort().pop() || "";
}

function getMostProductiveWeekday(days = []) {
  const scores = {};

  days.forEach((day) => {
    if (!day.dateKey || !day.hasActivity) return;
    const weekday = parseDateKey(day.dateKey).toLocaleDateString("en-US", { weekday: "long" });
    scores[weekday] = (scores[weekday] || 0) + Number(day.productivityScore || 0) + Number(day.focusMinutes || 0) / 4;
  });

  const [weekday] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || [];
  return weekday || "";
}

function detectSubject(text = "") {
  const match = SUBJECT_KEYWORDS.find((item) => item.pattern.test(text));
  return match?.subject || "";
}

function buildSubjectSignals({ todos = [], goals = [], focusSessions = [], weekDateKeys = [] }) {
  const focus = {};
  const demand = {};

  focusSessions.forEach((session) => {
    const dateKey = focusDateKey(session);
    if (!weekDateKeys.includes(dateKey)) return;

    const subject = detectSubject(`${session.goal || ""} ${session.lockedTitle || ""}`);
    if (!subject) return;
    focus[subject] = (focus[subject] || 0) + focusMinutes(session);
  });

  todos.forEach((todo) => {
    const subject = detectSubject(`${todo.title || ""} ${todo.task || ""} ${todo.note || ""}`);
    if (!subject || todo.completed) return;
    demand[subject] = (demand[subject] || 0) + (todo.priority === "High" ? 2 : 1);
  });

  goals.forEach((goal) => {
    if (goal.completed) return;
    const subject = detectSubject(`${goal.title || ""} ${goal.description || ""} ${goal.category || ""}`);
    if (!subject) return;
    demand[subject] = (demand[subject] || 0) + Math.max(1, Math.round((100 - goal.progress) / 35));
  });

  return { focus, demand };
}

function buildNotificationAnalyticsDays(sources = {}, now = new Date()) {
  const previousWeek = getWeekRange(now, -1);
  const currentWeek = getWeekRange(now, 0);
  const includeDateKeys = getDateRange(previousWeek.startDateKey, currentWeek.endDateKey);

  return buildDailyAnalyticsFromSources(
    {
      focusSessions: sources.focusSessions || [],
      todos: sources.todos || [],
      goals: sources.goals || [],
      aiUsage: sources.aiUsage || [],
      dailyProgress: sources.dailyProgress || []
    },
    { includeDateKeys }
  );
}

function pushMomentumNotifications(candidates, context) {
  const {
    todayKey,
    hour,
    currentMomentum,
    longestMomentum,
    completedFocusToday,
    completedTaskToday,
    pendingTasksToday,
    focusMinutesToday
  } = context;

  if (completedFocusToday) {
    candidates.push(createCandidate({
      id: `momentum-protected-${todayKey}`,
      type: "momentum",
      title: "Momentum Protected",
      message: `Your ${currentMomentum || 1}-day Momentum is alive because today's real focus signal is complete.`,
      action: "analytics",
      cta: "View Momentum",
      priority: currentMomentum >= longestMomentum && currentMomentum > 1 ? "medium" : "low"
    }));
    return;
  }

  const needs = [];
  if (pendingTasksToday.length && !completedTaskToday) needs.push("1 completed task");
  needs.push(focusMinutesToday > 0 ? `${Math.max(1, 15 - focusMinutesToday)} more focus minutes` : "15 min focus");
  const needText = needs.join(" and ");
  const momentumDays = currentMomentum ? `${currentMomentum}-day ` : "";

  if (hour < 12) {
    candidates.push(createCandidate({
      id: `momentum-morning-${todayKey}`,
      type: "momentum",
      title: "Momentum Is Live",
      message: `Protect your ${momentumDays}Momentum with ${needText} today.`,
      action: "focus",
      cta: "Start FocusLock",
      priority: "low"
    }));
  } else if (hour < 19) {
    candidates.push(createCandidate({
      id: `momentum-afternoon-${todayKey}`,
      type: "momentum",
      title: "Momentum Needs Action",
      message: `You still need ${needText} for a complete productivity day.`,
      action: pendingTasksToday.length && !completedTaskToday ? "todo" : "focus",
      cta: pendingTasksToday.length && !completedTaskToday ? "Open Tasks" : "Start FocusLock",
      priority: currentMomentum >= 3 ? "high" : "medium"
    }));
  } else {
    candidates.push(createCandidate({
      id: `momentum-night-risk-${todayKey}`,
      type: "momentum",
      title: `${currentMomentum || "Today"} Momentum At Risk`,
      message: `One focused 15-minute FocusLock session can still protect today's real productivity signal.`,
      action: "focus",
      cta: "Rescue Momentum",
      priority: "high"
    }));
  }
}

function pushGoalNotifications(candidates, context) {
  const { goals, todayKey, currentWeek } = context;
  const activeGoals = goals.filter((goal) => !goal.completed);

  activeGoals.forEach((goal) => {
    if (goal.deadlineDateKey) {
      const daysLeft = dateDiffInDays(todayKey, goal.deadlineDateKey);
      if (daysLeft < 0) {
        candidates.push(createCandidate({
          id: `goal-overdue-${goal.id || goal.title}-${goal.deadlineDateKey}`,
          type: "goal",
          title: "Goal Deadline Passed",
          message: `${goal.title} is overdue at ${goal.progress}% complete. Re-plan the next concrete move.`,
          action: "goals",
          cta: "Open Goals",
          priority: "high"
        }));
      } else if (daysLeft <= 2) {
        candidates.push(createCandidate({
          id: `goal-deadline-${goal.id || goal.title}-${goal.deadlineDateKey}`,
          type: "goal",
          title: "Goal Deadline Approaching",
          message: `${goal.title} is due ${daysLeft === 0 ? "today" : `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`} with ${goal.progress}% complete.`,
          action: "goals",
          cta: "Update Goal",
          priority: "high"
        }));
      }
    }

    const lastUpdateKey = goal.updatedDate ? formatDateKey(goal.updatedDate) : "";
    const inactiveDays = lastUpdateKey ? dateDiffInDays(lastUpdateKey, todayKey) : 0;
    if (inactiveDays >= 7 && goal.progress < 80) {
      candidates.push(createCandidate({
        id: `goal-inactive-${goal.id || goal.title}-${currentWeek.weekKey}`,
        type: "goal",
        title: "Goal Progress Has Stalled",
        message: `${goal.title} has not moved in ${inactiveDays} days. One focused update keeps it from drifting.`,
        action: "goals",
        cta: "Review Goal",
        priority: "medium"
      }));
    }

    if (goal.createdDate && goal.deadlineDate && goal.progress < 100) {
      const totalDays = Math.max(1, Math.round((startOfDay(goal.deadlineDate) - startOfDay(goal.createdDate)) / DAY_MS));
      const elapsedDays = Math.max(0, Math.round((startOfDay(parseDateKey(todayKey)) - startOfDay(goal.createdDate)) / DAY_MS));
      const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
      if (expectedProgress - goal.progress >= 25) {
        candidates.push(createCandidate({
          id: `goal-delayed-${goal.id || goal.title}-${currentWeek.weekKey}`,
          type: "goal",
          title: "Goal Pace Needs Attention",
          message: `${goal.title} is ${expectedProgress - goal.progress}% behind its deadline pace.`,
          action: "goals",
          cta: "Rebalance Goal",
          priority: "medium"
        }));
      }
    }

    const progressNow = goalProgressAt(goal, todayKey) ?? goal.progress;
    const progressSevenDaysAgo = goalProgressAt(goal, formatDateKey(addDays(parseDateKey(todayKey), -7))) ?? 0;
    const progressFourteenDaysAgo = goalProgressAt(goal, formatDateKey(addDays(parseDateKey(todayKey), -14))) ?? 0;
    const currentDelta = Math.max(0, progressNow - progressSevenDaysAgo);
    const previousDelta = Math.max(0, progressSevenDaysAgo - progressFourteenDaysAgo);

    if (previousDelta >= 12 && currentDelta <= Math.floor(previousDelta / 2)) {
      candidates.push(createCandidate({
        id: `goal-pace-drop-${goal.id || goal.title}-${currentWeek.weekKey}`,
        type: "goal",
        title: "Goal Progress Slowed",
        message: `${goal.title} gained ${currentDelta}% this week after ${previousDelta}% last week.`,
        action: "goals",
        cta: "Open Goals",
        priority: "medium"
      }));
    }

    if (goal.progress >= 75 && goal.progress < 100) {
      const bucket = Math.floor(goal.progress / 10) * 10;
      candidates.push(createCandidate({
        id: `goal-strong-${goal.id || goal.title}-${bucket}`,
        type: "goal",
        title: "Strong Goal Progress",
        message: `You completed ${goal.progress}% of ${goal.title}. Finish the next visible step while momentum is high.`,
        action: "goals",
        cta: "Keep Going",
        priority: "low"
      }));
    }
  });
}

function pushFocusAndCoachingNotifications(candidates, context) {
  const {
    todayKey,
    hour,
    focusByDate,
    weekDateKeys,
    previousWeekDateKeys,
    completedFocusToday,
    pendingTasksToday,
    days,
    currentWeek
  } = context;
  const currentFocusMinutes = sumDateValues(focusByDate, weekDateKeys);
  const previousFocusMinutes = sumDateValues(focusByDate, previousWeekDateKeys);
  const focusDays = weekDateKeys.filter((dateKey) => Number(focusByDate[dateKey] || 0) >= 15).length;

  if (!completedFocusToday && pendingTasksToday.length && hour >= 9) {
    candidates.push(createCandidate({
      id: `focus-start-${todayKey}`,
      type: "focuslock",
      title: "Time For Deep Work?",
      message: `Start a 25-minute FocusLock session for ${pendingTasksToday[0].title || pendingTasksToday[0].task || "your top task"}.`,
      action: "focus",
      cta: "Start FocusLock",
      priority: "medium"
    }));
  }

  if (previousFocusMinutes >= 60 && currentFocusMinutes < previousFocusMinutes * 0.7) {
    const drop = Math.round((1 - currentFocusMinutes / Math.max(1, previousFocusMinutes)) * 100);
    candidates.push(createCandidate({
      id: `focus-drop-${currentWeek.weekKey}`,
      type: "ai_coaching",
      title: "Focus Trend Detected",
      message: `Your FocusLock minutes dropped ${drop}% compared with last week. Protect one deep-work block today.`,
      action: "focus",
      cta: "Recover Focus",
      priority: drop >= 45 ? "high" : "medium"
    }));
  }

  if (focusDays <= 2 && currentFocusMinutes < 90 && weekDateKeys.some((dateKey) => dateKey <= todayKey)) {
    candidates.push(createCandidate({
      id: `focus-consistency-${currentWeek.weekKey}`,
      type: "study_suggestion",
      title: "Focus Consistency Is Weak",
      message: "Your weakest consistency area is FocusLock sessions. One 15-minute session resets the rhythm.",
      action: "focus",
      cta: "Start FocusLock",
      priority: "medium"
    }));
  }

  const strongestWindow = getStrongestFocusWindow(days);
  if (strongestWindow?.label && currentFocusMinutes >= 45) {
    candidates.push(createCandidate({
      id: `ai-best-window-${currentWeek.weekKey}`,
      type: "ai_coaching",
      title: "Best Focus Window Found",
      message: `You perform best around ${strongestWindow.label}. Schedule revision during that window today.`,
      action: "analytics",
      cta: "View Analytics",
      priority: "medium"
    }));
  }
}

function pushWeeklyReportNotification(candidates, context) {
  const { previousWeek, currentWeek, days, now, userStats, studentName } = context;
  const previousWeekDays = days.filter(
    (day) => day.dateKey >= previousWeek.startDateKey && day.dateKey <= previousWeek.endDateKey
  );
  const currentWeekDays = days.filter(
    (day) => day.dateKey >= currentWeek.startDateKey && day.dateKey <= currentWeek.endDateKey
  );

  const reportWeek =
    previousWeekDays.some((day) => day.hasActivity)
      ? { week: previousWeek, days: previousWeekDays }
      : now.getDay() === 0 && now.getHours() >= 18 && currentWeekDays.some((day) => day.hasActivity)
        ? { week: currentWeek, days: currentWeekDays }
        : null;

  if (!reportWeek) return null;

  const report = buildWeeklyReport({
    week: reportWeek.week,
    days: reportWeek.days,
    userStats,
    studentName
  });

  candidates.push(createCandidate({
    id: `weekly-report-${report.weekKey}`,
    type: "weekly_report",
    title: "SYNAPSE Weekly Report Is Ready",
    message: `${report.rangeLabel}: focus, tasks, Momentum, weak areas, and AI recommendations are ready.`,
    action: "analytics",
    cta: "Open Report",
    priority: "high"
  }));

  return report;
}

function pushRecoveryNotifications(candidates, context) {
  const { todayKey, currentWeek, days, focusByDate, todos, goals } = context;
  const lastActivityDate = getLastActivityDate(days, focusByDate, todos, goals);
  const inactiveDays = lastActivityDate ? dateDiffInDays(lastActivityDate, todayKey) : 0;

  if (!lastActivityDate) {
    candidates.push(createCandidate({
      id: `recovery-first-session-${todayKey}`,
      type: "recovery",
      title: "Start With One Productive Signal",
      message: "SYNAPSE needs one real focus session to begin coaching your Momentum intelligently.",
      action: "focus",
      cta: "Start FocusLock",
      priority: "low"
    }));
    return;
  }

  if (inactiveDays >= 2) {
    const bestDay = getMostProductiveWeekday(days);
    candidates.push(createCandidate({
      id: `recovery-${todayKey}`,
      type: "recovery",
      title: "Momentum Paused",
      message: bestDay
        ? `You were most productive on ${bestDay}s. Rebuild consistency today with one focused session.`
        : "Restart with one productive session today. Keep it small, real, and finished.",
      action: "focus",
      cta: "Restart Momentum",
      priority: inactiveDays >= 4 ? "high" : "medium"
    }));
  } else if (days.filter((day) => day.dateKey >= currentWeek.startDateKey && day.momentumCompleted).length === 0) {
    candidates.push(createCandidate({
      id: `recovery-week-loop-${currentWeek.weekKey}`,
      type: "recovery",
      title: "Rebuild The Weekly Loop",
      message: "This week has no completed Momentum day yet. One clean FocusLock session changes the pattern.",
      action: "focus",
      cta: "Start FocusLock",
      priority: "medium"
    }));
  }
}

function pushAchievementNotifications(candidates, context) {
  const { userStats, goals } = context;
  const currentMomentum = Number(userStats.currentMomentum || 0);
  const longestMomentum = Number(userStats.longestMomentum || 0);
  const totalFocusMinutes = Number(userStats.totalFocusMinutes || 0);
  const completedGoals = goals.filter((goal) => goal.completed).length;

  if (currentMomentum > 1 && currentMomentum >= longestMomentum) {
    candidates.push(createCandidate({
      id: `achievement-longest-momentum-${currentMomentum}`,
      type: "achievement",
      title: `New Longest Momentum: ${currentMomentum} Days`,
      message: "That is real consistency: productive focus days, not empty streak theater.",
      action: "analytics",
      cta: "View Momentum",
      priority: "low"
    }));
  }

  const focusHourMilestone = Math.floor(totalFocusMinutes / 600) * 10;
  if (focusHourMilestone >= 10) {
    candidates.push(createCandidate({
      id: `achievement-focus-hours-${focusHourMilestone}`,
      type: "achievement",
      title: `${focusHourMilestone} Hours Of Deep Focus`,
      message: `${formatMinutes(totalFocusMinutes)} of real FocusLock time is now logged in SYNAPSE.`,
      action: "focus",
      cta: "View Focus",
      priority: "low"
    }));
  }

  const goalMilestone = Math.floor(completedGoals / 25) * 25;
  if (goalMilestone >= 25) {
    candidates.push(createCandidate({
      id: `achievement-goals-${goalMilestone}`,
      type: "achievement",
      title: `${goalMilestone} Goals Completed`,
      message: "Goal completion is compounding. Keep the next target concrete and visible.",
      action: "goals",
      cta: "View Goals",
      priority: "low"
    }));
  }
}

function pushStudySuggestions(candidates, context) {
  const { todos, goals, focusSessions, weekDateKeys, currentWeek } = context;
  const { focus, demand } = buildSubjectSignals({ todos, goals, focusSessions, weekDateKeys });
  const totalFocus = Object.values(focus).reduce((sum, value) => sum + value, 0);
  const dominantSubject = Object.entries(focus).sort((a, b) => b[1] - a[1])[0];
  const neglectedSubject = Object.entries(demand)
    .filter(([subject]) => Number(focus[subject] || 0) < 20)
    .sort((a, b) => b[1] - a[1])[0];

  if (dominantSubject && neglectedSubject && totalFocus >= 45) {
    const focusShare = Math.round((dominantSubject[1] / Math.max(1, totalFocus)) * 100);

    if (focusShare >= 70 && dominantSubject[0] !== neglectedSubject[0]) {
      candidates.push(createCandidate({
        id: `study-balance-${dominantSubject[0]}-${neglectedSubject[0]}-${currentWeek.weekKey}`,
        type: "study_suggestion",
        title: "Study Balance Needs Attention",
        message: `You spent ${focusShare}% of study focus on ${dominantSubject[0]}. ${neglectedSubject[0]} revision is falling behind.`,
        action: "todo",
        cta: "Plan Revision",
        priority: "medium"
      }));
    }
  }

  const highPriorityBacklog = todos.filter(
    (todo) => !todo.completed && todo.priority === "High" && (todo.selectedDate || todo.date) <= formatDateKey()
  );

  if (highPriorityBacklog.length >= 2) {
    candidates.push(createCandidate({
      id: `task-high-priority-backlog-${currentWeek.weekKey}`,
      type: "ai_coaching",
      title: "High-Priority Work Is Clustering",
      message: `${highPriorityBacklog.length} high-priority tasks need attention. Convert one into a FocusLock block.`,
      action: "todo",
      cta: "Open Tasks",
      priority: "medium"
    }));
  }
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates
    .filter((candidate) => {
      if (!candidate?.id || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((a, b) => {
      const priorityCompare = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
      if (priorityCompare !== 0) return priorityCompare;
      return (TYPE_WEIGHT[a.type] ?? 9) - (TYPE_WEIGHT[b.type] ?? 9);
    })
    .slice(0, MAX_GENERATED_PER_CHECK);
}

export function listenToUserNotifications(uid, onNext, onError) {
  if (!uid) return () => {};

  return onSnapshot(
    query(notificationCollection(uid), orderBy("createdAt", "desc"), limit(NOTIFICATION_LIMIT)),
    (snapshot) => {
      onNext(snapshot.docs.map(normalizeNotification));
    },
    onError
  );
}

export function listenToNotificationSources(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();
  const sources = {
    focusSessions: [],
    todos: [],
    goals: [],
    aiUsage: [],
    dailyProgress: [],
    userStats: {}
  };
  const ready = new Set();

  const emit = (key, docs) => {
    sources[key] = docs;
    ready.add(key);

    if (ready.size === 6) {
      onNext({ ...sources });
    }
  };

  const rootListener = (key, collectionName) =>
    onSnapshot(
      query(collection(db, collectionName), where("uid", "==", uid)),
      (snapshot) => emit(key, snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    );

  const unsubscribes = [
    rootListener("focusSessions", COLLECTIONS.focusSessions),
    rootListener("todos", COLLECTIONS.todos),
    onSnapshot(
      collection(db, COLLECTIONS.users, uid, COLLECTIONS.goals),
      (snapshot) => emit("goals", snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    ),
    onSnapshot(
      collection(db, COLLECTIONS.users, uid, COLLECTIONS.aiUsage),
      (snapshot) => emit("aiUsage", snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    ),
    onSnapshot(
      collection(db, COLLECTIONS.users, uid, COLLECTIONS.dailyProgress),
      (snapshot) => emit("dailyProgress", snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    ),
    onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (snapshot) => emit("userStats", snapshot.exists() ? snapshot.data()?.stats || {} : {}),
      onError
    )
  ];

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export function buildNotificationCandidates(sources = {}, options = {}) {
  const now = options.now || new Date();
  const todayKey = formatDateKey(now);
  const currentWeek = getWeekRange(now, 0);
  const previousWeek = getWeekRange(now, -1);
  const weekDateKeys = getDateRange(currentWeek.startDateKey, currentWeek.endDateKey);
  const previousWeekDateKeys = getDateRange(previousWeek.startDateKey, previousWeek.endDateKey);
  const goals = (sources.goals || []).map(normalizeGoal);
  const focusSessions = sources.focusSessions || [];
  const todos = sources.todos || [];
  const userStats = sources.userStats || {};
  const dailyProgress = sources.dailyProgress || [];
  const progressByDate = Object.fromEntries(dailyProgress.map((progress) => [progress.dateKey || progress.id, progress]));
  const focusByDate = mapFocusByDate(focusSessions);
  const focusMinutesToday = Number(focusByDate[todayKey] || 0);
  const todayProgress = progressByDate[todayKey] || {};
  const completedFocusToday = Boolean(todayProgress.completedFocus || todayProgress.momentumCompleted || focusMinutesToday >= 15);
  const todosToday = todos.filter((todo) => (todo.selectedDate || todo.date) === todayKey);
  const pendingTasksToday = todosToday.filter((todo) => !todo.completed);
  const completedTaskToday = todosToday.some((todo) => todo.completed) || Boolean(todayProgress.completedTask);
  const days = buildNotificationAnalyticsDays(sources, now);
  const studentName = options.studentName || "Student";
  const candidates = [];
  const context = {
    now,
    todayKey,
    hour: now.getHours(),
    currentWeek,
    previousWeek,
    weekDateKeys,
    previousWeekDateKeys,
    goals,
    focusSessions,
    focusByDate,
    focusMinutesToday,
    todos,
    todosToday,
    pendingTasksToday,
    completedTaskToday,
    completedFocusToday,
    currentMomentum: Number(userStats.currentMomentum || 0),
    longestMomentum: Number(userStats.longestMomentum || 0),
    userStats,
    days,
    studentName
  };

  pushMomentumNotifications(candidates, context);
  pushGoalNotifications(candidates, context);
  pushFocusAndCoachingNotifications(candidates, context);
  const report = pushWeeklyReportNotification(candidates, context);
  pushRecoveryNotifications(candidates, context);
  pushAchievementNotifications(candidates, context);
  pushStudySuggestions(candidates, context);

  return {
    candidates: uniqueCandidates(candidates),
    report
  };
}

export async function syncGeneratedNotifications(uid, candidates = [], existingNotifications = []) {
  if (!uid || !candidates.length) {
    return { updated: 0 };
  }

  const existingById = new Map(existingNotifications.map((notification) => [notification.id, notification]));
  const db = getFirebaseDb();
  const batch = writeBatch(db);
  let updated = 0;

  candidates.forEach((candidate) => {
    const existing = existingById.get(candidate.id);
    if (existing?.signature === candidate.signature) return;

    const notificationRef = doc(db, COLLECTIONS.users, uid, COLLECTIONS.notifications, candidate.id);
    batch.set(
      notificationRef,
      {
        type: candidate.type,
        title: candidate.title,
        message: candidate.message,
        action: candidate.action,
        read: false,
        priority: candidate.priority,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        cta: candidate.cta || "",
        signature: candidate.signature,
        generatedBy: candidate.generatedBy
      },
      { merge: true }
    );
    updated += 1;
  });

  if (!updated) return { updated: 0 };

  await batch.commit();
  return { updated };
}

export async function runNotificationIntelligenceCheck(uid, sources = {}, options = {}) {
  if (!uid) return { updated: 0 };

  const { candidates, report } = buildNotificationCandidates(sources, options);

  if (report?.weekKey) {
    await syncWeeklyReport(uid, report);
  }

  return syncGeneratedNotifications(uid, candidates, options.existingNotifications || []);
}

export async function markNotificationRead(uid, notificationId) {
  if (!uid || !notificationId) return;

  await updateDoc(notificationDocument(uid, notificationId), {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function markNotificationsRead(uid, notificationIds = []) {
  if (!uid || !notificationIds.length) return;

  const db = getFirebaseDb();
  const batch = writeBatch(db);

  notificationIds.forEach((notificationId) => {
    batch.update(doc(db, COLLECTIONS.users, uid, COLLECTIONS.notifications, notificationId), {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

export async function clearNotifications(uid, notificationIds = []) {
  if (!uid || !notificationIds.length) return;

  const db = getFirebaseDb();
  const batch = writeBatch(db);

  notificationIds.forEach((notificationId) => {
    batch.delete(doc(db, COLLECTIONS.users, uid, COLLECTIONS.notifications, notificationId));
  });

  await batch.commit();
}

export async function deleteNotification(uid, notificationId) {
  if (!uid || !notificationId) return;
  await deleteDoc(notificationDocument(uid, notificationId));
}

export function getNotificationHref(action = "dashboard") {
  return NOTIFICATION_ACTIONS[action] || NOTIFICATION_ACTIONS.dashboard;
}

export function formatNotificationTime(value) {
  const date = coerceDate(value) || value?.createdAtDate || new Date();
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}
