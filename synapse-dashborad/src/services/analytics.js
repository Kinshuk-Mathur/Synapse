import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";
import { formatDateKey, parseDateKey } from "./todos";
import { isMeaningfulAiInteraction } from "./userStats";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FOCUS_TARGET_MINUTES = 120;
const DEFAULT_AI_USAGE_TARGET = 2;

export const emptyAnalyticsDay = {
  dateKey: "",
  focusMinutes: 0,
  focusSessions: 0,
  averageSessionMinutes: 0,
  longestSessionMinutes: 0,
  blockedSites: [],
  focusHourBuckets: {},
  tasksTotal: 0,
  tasksCompleted: 0,
  overdueTasks: 0,
  taskCompletionRate: 0,
  goalsTotal: 0,
  goalsCompleted: 0,
  goalsInProgress: 0,
  goalsNotStarted: 0,
  goalProgressAverage: 0,
  goalsUpdated: 0,
  aiUsageCount: 0,
  aiCategories: {},
  momentumCompleted: false,
  momentumPillarsCompleted: 0,
  productivityScore: 0,
  hasActivity: false
};

export const emptyWeeklyReport = {
  title: "Start your work",
  body:
    "Start a focus session, finish a task, update a goal, or ask SYNAPSE AI something meaningful. Your analytics will appear as soon as real data lands.",
  highlights: [],
  signature: "",
  generatedAt: ""
};

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
  const nextDate = startOfDay(date);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function coerceAnalyticsDate(value) {
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

export function getUserAnalyticsStartDate(profile, user) {
  return (
    coerceAnalyticsDate(profile?.createdAt) ||
    coerceAnalyticsDate(profile?.onboardingCompletedAt) ||
    coerceAnalyticsDate(user?.metadata?.creationTime) ||
    new Date()
  );
}

function getDateKeyFromValue(value, fallbackDate = new Date()) {
  const date = coerceAnalyticsDate(value) || fallbackDate;
  return formatDateKey(date);
}

function getDateRange(startDateKey, endDateKey) {
  const startDate = parseDateKey(startDateKey);
  const endDate = parseDateKey(endDateKey);
  const dayCount = Math.max(0, Math.round((startOfDay(endDate) - startOfDay(startDate)) / DAY_MS));

  return Array.from({ length: dayCount + 1 }, (_, index) => formatDateKey(addDays(startDate, index)));
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

export function buildAvailableAnalyticsMonths(startDate, endDate = new Date()) {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  const months = [];
  let cursor = start;

  while (cursor <= end) {
    months.push({
      value: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      label: cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      year: cursor.getFullYear(),
      month: cursor.getMonth()
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
}

export function buildUserAnchoredMonthWeeks(monthDate, startDate) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const anchor = startOfDay(startDate || monthStart);

  if (anchor > monthEnd) {
    return [];
  }

  let cursor = anchor;

  if (cursor < monthStart) {
    const diffDays = Math.floor((startOfDay(monthStart) - cursor) / DAY_MS);
    cursor = addDays(anchor, Math.floor(diffDays / 7) * 7);

    while (addDays(cursor, 6) < monthStart) {
      cursor = addDays(cursor, 7);
    }
  }

  const weeks = [];
  while (cursor <= monthEnd) {
    const startDateKey = formatDateKey(cursor);
    const endDateKey = formatDateKey(addDays(cursor, 6));

    weeks.push({
      index: weeks.length,
      label: `Week ${weeks.length + 1}`,
      startDateKey,
      endDateKey,
      rangeLabel: formatShortRange(startDateKey, endDateKey)
    });

    cursor = addDays(cursor, 7);
  }

  return weeks;
}

function promptFingerprint(prompt = "") {
  const normalized = String(prompt).trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  return normalized ? `${normalized.length}-${hash.toString(16)}` : "";
}

function categorizePrompt(prompt = "", hasAttachment = false) {
  const normalized = String(prompt).toLowerCase();

  if (hasAttachment) return "document";
  if (/(plan|schedule|routine|priority|organize|productivity|focus)/.test(normalized)) return "productivity";
  if (/(code|bug|debug|javascript|react|next|python|api)/.test(normalized)) return "coding";
  if (/(explain|solve|study|exam|chapter|topic|formula|revision)/.test(normalized)) return "study";
  if (/(write|summarize|draft|essay|notes)/.test(normalized)) return "writing";
  return "general";
}

export async function recordMeaningfulAiUsage(uid, options = {}) {
  if (!uid) return null;

  const meaningful = isMeaningfulAiInteraction(options);
  if (!meaningful) {
    return { ignored: true, reason: "not_meaningful_ai_usage" };
  }

  const prompt = String(options.prompt || "").trim();
  const fingerprint = promptFingerprint(prompt) || (options.hasAttachment ? "attachment" : "");
  const dateKey = options.dateKey || formatDateKey();
  const documentId = `${dateKey}_${fingerprint || "meaningful"}`;
  const db = getFirebaseDb();
  const usageRef = doc(db, COLLECTIONS.users, uid, COLLECTIONS.aiUsage, documentId);
  const existing = await getDoc(usageRef);

  if (existing.exists()) {
    return { ignored: true, reason: "repeated_ai_prompt" };
  }

  const payload = {
    promptLength: prompt.length,
    category: options.category || categorizePrompt(prompt, Boolean(options.hasAttachment)),
    meaningful: true,
    timestamp: serverTimestamp(),
    date: dateKey,
    dateKey,
    fingerprint
  };

  await setDoc(usageRef, payload, { merge: true });
  return payload;
}

function dailyAnalyticsCollection(db, uid) {
  return collection(db, COLLECTIONS.users, uid, COLLECTIONS.analytics, "daily", "days");
}

function dailyAnalyticsDoc(db, uid, dateKey) {
  return doc(db, COLLECTIONS.users, uid, COLLECTIONS.analytics, "daily", "days", dateKey);
}

function weeklyReportDoc(db, uid, weekKey) {
  return doc(db, COLLECTIONS.users, uid, COLLECTIONS.analytics, "weekly", "reports", weekKey);
}

function dateKeyFromFocusSession(session = {}) {
  return (
    session.date ||
    session.dateKey ||
    getDateKeyFromValue(session.startedAt || session.completedAt || session.endedAt || session.updatedAt)
  );
}

function focusMinutesFromSession(session = {}) {
  if (session.focusSeconds !== undefined) return Math.max(0, Math.round(safeNumber(session.focusSeconds) / 60));
  if (session.durationSeconds !== undefined) return Math.max(0, Math.round(safeNumber(session.durationSeconds) / 60));
  if (session.duration !== undefined) {
    const duration = safeNumber(session.duration);
    return duration > 600 ? Math.round(duration / 60) : Math.round(duration);
  }
  return 0;
}

function blockedSitesFromSession(session = {}) {
  if (Array.isArray(session.blockedSites)) return session.blockedSites.filter(Boolean);
  return Object.keys(session.distractionCounts || {}).filter(Boolean);
}

function normalizeTodoForAnalytics(todo = {}) {
  const dateKey = todo.date || todo.selectedDate || getDateKeyFromValue(todo.completedAt || todo.createdAt);

  return {
    id: todo.id,
    dateKey,
    title: todo.title || todo.task || "Untitled task",
    completed: Boolean(todo.completed),
    priority: todo.priority || "Medium",
    status: todo.status || "active"
  };
}

function normalizeGoalHistoryEntry(entry = {}) {
  const recordedDate = coerceAnalyticsDate(entry.recordedAt || entry.updatedAt || entry.date);

  return {
    dateKey: entry.dateKey || (recordedDate ? formatDateKey(recordedDate) : ""),
    recordedDate,
    progress: clamp(Math.round(safeNumber(entry.progress)), 0, 100),
    completed: Boolean(entry.completed) || safeNumber(entry.progress) >= 100
  };
}

function normalizeGoalForAnalytics(goal = {}) {
  const createdDate = coerceAnalyticsDate(goal.createdAt || goal.createdLocal || goal.updatedAt || goal.updatedLocal);
  const updatedDate = coerceAnalyticsDate(goal.updatedAt || goal.updatedLocal || goal.createdAt || goal.createdLocal);
  const progress = clamp(Math.round(safeNumber(goal.progress ?? goal.progressPercentage)), 0, 100);
  const history = Array.isArray(goal.progressHistory)
    ? goal.progressHistory.map(normalizeGoalHistoryEntry).filter((entry) => entry.dateKey)
    : [];

  if (!history.length && updatedDate) {
    history.push({
      dateKey: formatDateKey(updatedDate),
      recordedDate: updatedDate,
      progress,
      completed: Boolean(goal.completed) || progress >= 100
    });
  }

  history.sort((a, b) => (a.recordedDate || new Date(0)) - (b.recordedDate || new Date(0)));

  return {
    id: goal.id,
    createdDate,
    updatedDate,
    progress,
    completed: Boolean(goal.completed) || progress >= 100,
    history
  };
}

function goalProgressAtDate(goal, dateKey) {
  const dateEnd = endOfDay(parseDateKey(dateKey));
  const entries = goal.history.filter((entry) => entry.recordedDate && entry.recordedDate <= dateEnd);

  if (entries.length) {
    return entries[entries.length - 1].progress;
  }

  if (goal.createdDate && goal.createdDate <= dateEnd) {
    return 0;
  }

  return null;
}

function initializeDay(dateKey) {
  return {
    ...emptyAnalyticsDay,
    dateKey,
    blockedSites: [],
    focusHourBuckets: {},
    aiCategories: {}
  };
}

export function calculateProductivityScore(day = {}) {
  const focusScore = clamp(safeNumber(day.focusMinutes) / DEFAULT_FOCUS_TARGET_MINUTES, 0, 1) * 40;
  const taskScore = day.tasksTotal > 0 ? clamp(safeNumber(day.tasksCompleted) / safeNumber(day.tasksTotal), 0, 1) * 20 : 0;
  const goalProgressScore = day.goalsTotal > 0 ? clamp(safeNumber(day.goalProgressAverage) / 100, 0, 1) * 14 : 0;
  const goalUpdateScore = day.goalsUpdated > 0 ? 6 : 0;
  const momentumScore = day.momentumCompleted ? 10 : 0;
  const aiScore = clamp(safeNumber(day.aiUsageCount) / DEFAULT_AI_USAGE_TARGET, 0, 1) * 10;

  return clamp(Math.round(focusScore + taskScore + goalProgressScore + goalUpdateScore + momentumScore + aiScore), 0, 100);
}

function analyticsSignature(day) {
  return JSON.stringify({
    focusMinutes: day.focusMinutes,
    focusSessions: day.focusSessions,
    averageSessionMinutes: day.averageSessionMinutes,
    longestSessionMinutes: day.longestSessionMinutes,
    blockedSites: day.blockedSites,
    focusHourBuckets: day.focusHourBuckets,
    tasksTotal: day.tasksTotal,
    tasksCompleted: day.tasksCompleted,
    overdueTasks: day.overdueTasks,
    taskCompletionRate: day.taskCompletionRate,
    goalsTotal: day.goalsTotal,
    goalsCompleted: day.goalsCompleted,
    goalsInProgress: day.goalsInProgress,
    goalsNotStarted: day.goalsNotStarted,
    goalProgressAverage: day.goalProgressAverage,
    goalsUpdated: day.goalsUpdated,
    aiUsageCount: day.aiUsageCount,
    aiCategories: day.aiCategories,
    momentumCompleted: day.momentumCompleted,
    momentumPillarsCompleted: day.momentumPillarsCompleted,
    productivityScore: day.productivityScore,
    hasActivity: day.hasActivity
  });
}

export function normalizeAnalyticsDay(data = {}) {
  const next = {
    ...emptyAnalyticsDay,
    ...data,
    dateKey: data.dateKey || data.date || "",
    blockedSites: Array.isArray(data.blockedSites) ? data.blockedSites : [],
    focusHourBuckets: data.focusHourBuckets || {},
    aiCategories: data.aiCategories || {}
  };

  next.productivityScore = calculateProductivityScore(next);
  return next;
}

export function buildDailyAnalyticsFromSources(sources = {}, options = {}) {
  const dateKeys = new Set(options.includeDateKeys || []);
  const days = new Map();
  const focusByDate = new Map();
  const goals = (sources.goals || []).map(normalizeGoalForAnalytics);
  const todayKey = formatDateKey();

  const getDay = (dateKey) => {
    if (!days.has(dateKey)) {
      days.set(dateKey, initializeDay(dateKey));
      dateKeys.add(dateKey);
    }

    return days.get(dateKey);
  };

  (sources.focusSessions || []).forEach((session) => {
    const dateKey = dateKeyFromFocusSession(session);
    const minutes = focusMinutesFromSession(session);
    if (!dateKey) return;

    const day = getDay(dateKey);
    const startDate = coerceAnalyticsDate(session.startedAt);
    const hour = startDate ? String(startDate.getHours()).padStart(2, "0") : "";
    const blockedSites = blockedSitesFromSession(session);
    const currentSessions = focusByDate.get(dateKey) || [];

    day.focusMinutes += minutes;
    day.focusSessions += minutes > 0 ? 1 : 0;
    day.longestSessionMinutes = Math.max(day.longestSessionMinutes, minutes);
    day.blockedSites = Array.from(new Set([...day.blockedSites, ...blockedSites])).slice(0, 12);
    if (hour) {
      day.focusHourBuckets[hour] = Math.round((day.focusHourBuckets[hour] || 0) + minutes);
    }
    currentSessions.push(minutes);
    focusByDate.set(dateKey, currentSessions);
  });

  (sources.todos || []).map(normalizeTodoForAnalytics).forEach((todo) => {
    if (!todo.dateKey) return;

    const day = getDay(todo.dateKey);
    day.tasksTotal += 1;
    if (todo.completed) day.tasksCompleted += 1;
    if (!todo.completed && todo.dateKey < todayKey && todo.status !== "carried") {
      day.overdueTasks += 1;
    }
  });

  (sources.aiUsage || []).forEach((usage) => {
    const meaningful = usage.meaningful !== false;
    const dateKey = usage.date || usage.dateKey || getDateKeyFromValue(usage.timestamp);
    if (!meaningful || !dateKey) return;

    const category = usage.category || "general";
    const day = getDay(dateKey);
    day.aiUsageCount += 1;
    day.aiCategories[category] = (day.aiCategories[category] || 0) + 1;
  });

  (sources.dailyProgress || []).forEach((progress) => {
    const dateKey = progress.dateKey || progress.date || "";
    if (!dateKey) return;

    const day = getDay(dateKey);
    day.momentumCompleted = Boolean(progress.momentumCompleted);
    day.momentumPillarsCompleted = [
      progress.completedFocus,
      progress.completedTask || progress.completedGoalUpdate
    ].filter(Boolean).length;
    day.focusMinutes = Math.max(day.focusMinutes, Math.round(safeNumber(progress.focusMinutes)));
  });

  goals.forEach((goal) => {
    if (goal.createdDate) dateKeys.add(formatDateKey(goal.createdDate));
    if (goal.updatedDate) dateKeys.add(formatDateKey(goal.updatedDate));
    goal.history.forEach((entry) => {
      if (entry.dateKey) dateKeys.add(entry.dateKey);
    });
  });

  Array.from(dateKeys).forEach((dateKey) => getDay(dateKey));

  days.forEach((day, dateKey) => {
    const sessionDurations = focusByDate.get(dateKey) || [];
    const activeGoals = [];
    const updatedGoalIds = new Set();

    goals.forEach((goal) => {
      const progress = goalProgressAtDate(goal, dateKey);
      if (progress !== null) {
        activeGoals.push(progress);
      }

      if (goal.history.some((entry) => entry.dateKey === dateKey)) {
        updatedGoalIds.add(goal.id);
      } else if (!goal.history.length && goal.updatedDate && formatDateKey(goal.updatedDate) === dateKey) {
        updatedGoalIds.add(goal.id);
      }
    });

    day.focusMinutes = Math.round(day.focusMinutes);
    day.averageSessionMinutes = sessionDurations.length
      ? Math.round(sessionDurations.reduce((total, minutes) => total + minutes, 0) / sessionDurations.length)
      : 0;
    day.taskCompletionRate = day.tasksTotal > 0 ? Math.round((day.tasksCompleted / day.tasksTotal) * 100) : 0;
    day.goalsTotal = activeGoals.length;
    day.goalsCompleted = activeGoals.filter((progress) => progress >= 100).length;
    day.goalsInProgress = activeGoals.filter((progress) => progress > 0 && progress < 100).length;
    day.goalsNotStarted = activeGoals.filter((progress) => progress <= 0).length;
    day.goalProgressAverage = activeGoals.length
      ? Math.round(activeGoals.reduce((total, progress) => total + progress, 0) / activeGoals.length)
      : 0;
    day.goalsUpdated = updatedGoalIds.size;
    day.hasActivity = Boolean(
      day.focusMinutes ||
        day.tasksTotal ||
        day.goalsTotal ||
        day.goalsUpdated ||
        day.aiUsageCount ||
        day.momentumPillarsCompleted ||
        day.momentumCompleted
    );
    day.productivityScore = calculateProductivityScore(day);
    day.signature = analyticsSignature(day);
  });

  return Array.from(days.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

async function commitBatches(db, operations) {
  let batch = writeBatch(db);
  let count = 0;

  for (const operation of operations) {
    operation(batch);
    count += 1;

    if (count >= 430) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
  }
}

export async function syncDailyAnalytics(uid, analyticsDays = [], existingByDate = {}) {
  if (!uid || !analyticsDays.length) return { updated: 0 };

  const db = getFirebaseDb();
  const operations = [];

  analyticsDays.forEach((day) => {
    const existing = existingByDate[day.dateKey];
    if (existing?.signature === day.signature) return;

    operations.push((batch) => {
      batch.set(
        dailyAnalyticsDoc(db, uid, day.dateKey),
        {
          ...day,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
  });

  if (!operations.length) return { updated: 0 };

  operations.push((batch) => {
    batch.set(
      doc(db, COLLECTIONS.users, uid, COLLECTIONS.analytics, "daily"),
      {
        updatedAt: serverTimestamp(),
        storagePath: "users/{userId}/analytics/daily/days/{date}"
      },
      { merge: true }
    );
  });

  await commitBatches(db, operations);
  return { updated: operations.length - 1 };
}

export function listenToAllDailyAnalytics(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();

  return onSnapshot(
    dailyAnalyticsCollection(db, uid),
    (snapshot) => {
      const byDate = {};
      snapshot.docs.forEach((dayDoc) => {
        byDate[dayDoc.id] = normalizeAnalyticsDay({
          id: dayDoc.id,
          ...dayDoc.data()
        });
      });
      onNext(byDate);
    },
    onError
  );
}

export function listenToWeeklyReport(uid, weekKey, onNext, onError) {
  if (!uid || !weekKey) return () => {};

  const db = getFirebaseDb();
  return onSnapshot(
    weeklyReportDoc(db, uid, weekKey),
    (snapshot) => {
      onNext(snapshot.exists() ? snapshot.data() : null);
    },
    onError
  );
}

export function listenToAnalyticsSources(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();
  const sources = {
    focusSessions: [],
    todos: [],
    goals: [],
    aiUsage: [],
    dailyProgress: []
  };
  const ready = new Set();

  const emit = (key, docs) => {
    sources[key] = docs;
    ready.add(key);
    if (ready.size === Object.keys(sources).length) {
      onNext({ ...sources });
    }
  };

  const createRootListener = (key, collectionName) =>
    onSnapshot(
      query(collection(db, collectionName), where("uid", "==", uid)),
      (snapshot) => emit(key, snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      onError
    );

  const unsubscribes = [
    createRootListener("focusSessions", COLLECTIONS.focusSessions),
    createRootListener("todos", COLLECTIONS.todos),
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
    )
  ];

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export function fillAnalyticsRange(dailyByDate = {}, startDateKey, endDateKey) {
  return getDateRange(startDateKey, endDateKey).map((dateKey) =>
    normalizeAnalyticsDay(dailyByDate[dateKey] || initializeDay(dateKey))
  );
}

function formatMinutes(minutes = 0) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;

  if (hours > 0) return `${hours}h ${remainingMinutes}m`;
  return `${remainingMinutes}m`;
}

function formatFocusWindow(hour) {
  if (hour === null || hour === undefined || hour === "") return "";
  const start = Number(hour);
  const end = (start + 2) % 24;
  const formatHour = (value) => {
    const suffix = value >= 12 ? "PM" : "AM";
    const hourValue = value % 12 || 12;
    return `${hourValue}${suffix}`;
  };
  return `${formatHour(start)}-${formatHour(end)}`;
}

export function getStrongestFocusWindow(days = []) {
  const buckets = {};

  days.forEach((day) => {
    Object.entries(day.focusHourBuckets || {}).forEach(([hour, minutes]) => {
      const startHour = Number(hour);
      const nextHour = String((startHour + 1) % 24).padStart(2, "0");
      const windowKey = String(startHour).padStart(2, "0");
      buckets[windowKey] = (buckets[windowKey] || 0) + safeNumber(minutes) + safeNumber(day.focusHourBuckets[nextHour]) * 0.5;
    });
  });

  const [hour, minutes] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0] || [];
  return minutes > 0
    ? {
        hour,
        minutes,
        label: formatFocusWindow(hour)
      }
    : null;
}

function reportSignature(week, days, userStats = {}) {
  return JSON.stringify({
    weekKey: week?.weekKey,
    currentMomentum: userStats.currentMomentum || 0,
    longestMomentum: userStats.longestMomentum || 0,
    days: days.map((day) => ({
      dateKey: day.dateKey,
      focusMinutes: day.focusMinutes,
      tasksTotal: day.tasksTotal,
      tasksCompleted: day.tasksCompleted,
      goalsUpdated: day.goalsUpdated,
      aiUsageCount: day.aiUsageCount,
      momentumCompleted: day.momentumCompleted,
      productivityScore: day.productivityScore
    }))
  });
}

export function buildWeeklyReport({ week, days = [], userStats = {}, studentName = "Student" }) {
  const activeDays = days.filter((day) => day.hasActivity);

  if (!activeDays.length) {
    return {
      ...emptyWeeklyReport,
      weekKey: week?.weekKey || "",
      rangeLabel: week?.rangeLabel || "",
      signature: reportSignature(week, days, userStats)
    };
  }

  const focusMinutes = days.reduce((total, day) => total + day.focusMinutes, 0);
  const tasksTotal = days.reduce((total, day) => total + day.tasksTotal, 0);
  const tasksCompleted = days.reduce((total, day) => total + day.tasksCompleted, 0);
  const goalsUpdated = days.reduce((total, day) => total + day.goalsUpdated, 0);
  const aiUsageCount = days.reduce((total, day) => total + day.aiUsageCount, 0);
  const momentumDays = days.filter((day) => day.momentumCompleted).length;
  const averageScore = Math.round(
    activeDays.reduce((total, day) => total + day.productivityScore, 0) / Math.max(1, activeDays.length)
  );
  const taskRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : null;
  const strongestWindow = getStrongestFocusWindow(days);
  const sentenceParts = [];

  if (focusMinutes > 0) sentenceParts.push(`protected ${formatMinutes(focusMinutes)} of focus`);
  if (taskRate !== null) sentenceParts.push(`completed ${taskRate}% of planned tasks`);
  if (momentumDays > 0) sentenceParts.push(`maintained ${momentumDays} productive momentum day${momentumDays === 1 ? "" : "s"}`);
  if (goalsUpdated > 0) sentenceParts.push(`updated goals ${goalsUpdated} time${goalsUpdated === 1 ? "" : "s"}`);
  if (aiUsageCount > 0) sentenceParts.push(`used SYNAPSE AI meaningfully ${aiUsageCount} time${aiUsageCount === 1 ? "" : "s"}`);

  const recommendation =
    strongestWindow && focusMinutes >= 30
      ? `Your strongest focus window was ${strongestWindow.label}; keep your hardest work close to that rhythm.`
      : momentumDays < 2
        ? "Build one clean daily loop: 15+ minutes of Focus Lock plus one task or goal update."
        : "Your consistency is starting to compound. Keep the week simple and repeatable.";

  return {
    title: `Great work, ${studentName}.`,
    body: `This week you ${sentenceParts.join(", ")}. Your average productivity score was ${averageScore}/100. ${recommendation}`,
    highlights: [
      momentumDays ? `${momentumDays} productive days` : "",
      focusMinutes ? `${formatMinutes(focusMinutes)} focus` : "",
      taskRate !== null ? `${taskRate}% tasks` : "",
      averageScore ? `${averageScore}/100 score` : ""
    ].filter(Boolean),
    weekKey: week?.weekKey || "",
    rangeLabel: week?.rangeLabel || "",
    signature: reportSignature(week, days, userStats)
  };
}

export async function syncWeeklyReport(uid, report) {
  if (!uid || !report?.weekKey) return null;

  const db = getFirebaseDb();
  const reportRef = weeklyReportDoc(db, uid, report.weekKey);
  const snapshot = await getDoc(reportRef);
  const existingSignature = snapshot.exists() ? snapshot.data()?.signature : "";

  if (existingSignature === report.signature) {
    return snapshot.data();
  }

  await setDoc(
    reportRef,
    {
      ...report,
      generatedAt: serverTimestamp()
    },
    { merge: true }
  );

  return report;
}

function getCompletionRate(days, predicate) {
  const scoped = days.filter(predicate);
  const total = scoped.reduce((sum, day) => sum + day.tasksTotal, 0);
  const completed = scoped.reduce((sum, day) => sum + day.tasksCompleted, 0);
  return total > 0 ? Math.round((completed / total) * 100) : null;
}

export function buildAiInsights(days = []) {
  const insights = [];
  const focusDays = days.filter((day) => day.focusMinutes > 0);
  const strongestWindow = getStrongestFocusWindow(days);

  if (strongestWindow && focusDays.length >= 2) {
    const totalFocus = focusDays.reduce((total, day) => total + day.focusMinutes, 0);
    const windowShare = Math.round((strongestWindow.minutes / Math.max(1, totalFocus)) * 100);
    if (windowShare >= 25) {
      insights.push({
        title: "Best Focus Window",
        body: `${windowShare}% of your focus clusters around ${strongestWindow.label}.`,
        tone: "pink"
      });
    }
  }

  const weekdayRate = getCompletionRate(days, (day) => {
    const weekDay = parseDateKey(day.dateKey).getDay();
    return weekDay >= 1 && weekDay <= 5;
  });
  const weekendRate = getCompletionRate(days, (day) => {
    const weekDay = parseDateKey(day.dateKey).getDay();
    return weekDay === 0 || weekDay === 6;
  });

  if (weekdayRate !== null && weekendRate !== null && weekdayRate - weekendRate >= 15) {
    insights.push({
      title: "Weekend Dip",
      body: `Task completion is ${weekdayRate - weekendRate}% lower on weekends.`,
      tone: "blue"
    });
  }

  const momentumDays = days.filter((day) => day.momentumCompleted).length;
  if (momentumDays >= 2) {
    insights.push({
      title: "Momentum Signal",
      body: `${momentumDays} days completed the full SYNAPSE momentum loop.`,
      tone: "green"
    });
  }

  const aiDays = days.filter((day) => day.aiUsageCount > 0 && day.hasActivity);
  const nonAiDays = days.filter((day) => day.aiUsageCount === 0 && day.hasActivity);
  if (aiDays.length && nonAiDays.length) {
    const aiAverage = Math.round(aiDays.reduce((total, day) => total + day.productivityScore, 0) / aiDays.length);
    const nonAiAverage = Math.round(nonAiDays.reduce((total, day) => total + day.productivityScore, 0) / nonAiDays.length);
    if (aiAverage - nonAiAverage >= 10) {
      insights.push({
        title: "AI Assist Lift",
        body: `Scores are ${aiAverage - nonAiAverage} points higher on meaningful AI days.`,
        tone: "gold"
      });
    }
  }

  const goalUpdateDays = days.filter((day) => day.goalsUpdated > 0);
  if (goalUpdateDays.length >= 2) {
    insights.push({
      title: "Goal Rhythm",
      body: `Goals were updated on ${goalUpdateDays.length} days in this week.`,
      tone: "purple"
    });
  }

  return insights.slice(0, 4);
}

export function buildWeeklyWins(days = []) {
  const bestFocusDay = [...days].sort((a, b) => b.focusMinutes - a.focusMinutes)[0];
  const longestSessionDay = [...days].sort((a, b) => b.longestSessionMinutes - a.longestSessionMinutes)[0];
  const highestScoreDay = [...days].sort((a, b) => b.productivityScore - a.productivityScore)[0];
  const momentumDays = days.filter((day) => day.momentumCompleted).length;

  return [
    {
      label: "Best Focus Day",
      value: bestFocusDay?.focusMinutes ? formatMinutes(bestFocusDay.focusMinutes) : "Start focus",
      detail: bestFocusDay?.focusMinutes
        ? parseDateKey(bestFocusDay.dateKey).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
        : "No focus data yet"
    },
    {
      label: "Longest Session",
      value: longestSessionDay?.longestSessionMinutes ? formatMinutes(longestSessionDay.longestSessionMinutes) : "No session",
      detail: longestSessionDay?.longestSessionMinutes ? "Deep Work" : "Complete a focus session"
    },
    {
      label: "Highest Score",
      value: highestScoreDay?.productivityScore ? `${highestScoreDay.productivityScore}/100` : "0/100",
      detail: highestScoreDay?.productivityScore ? "Productivity Score" : "Real data only"
    },
    {
      label: "Momentum Week",
      value: `${momentumDays} day${momentumDays === 1 ? "" : "s"}`,
      detail: "Productive Days"
    }
  ];
}

export function summarizeAnalytics(days = [], userStats = {}) {
  const activeDays = days.filter((day) => day.hasActivity);
  const focusMinutes = days.reduce((total, day) => total + day.focusMinutes, 0);
  const tasksCompleted = days.reduce((total, day) => total + day.tasksCompleted, 0);
  const tasksTotal = days.reduce((total, day) => total + day.tasksTotal, 0);
  const goalsTotal = Math.max(...days.map((day) => day.goalsTotal), 0);
  const goalsCompleted = Math.max(...days.map((day) => day.goalsCompleted), 0);
  const latestGoalDay = [...days].reverse().find((day) => day.goalsTotal > 0) || {};
  const goalProgressAverage = latestGoalDay.goalProgressAverage || 0;
  const aiUsageCount = days.reduce((total, day) => total + day.aiUsageCount, 0);
  const momentumDays = days.filter((day) => day.momentumCompleted).length;
  const productivityScore = activeDays.length
    ? Math.round(activeDays.reduce((total, day) => total + day.productivityScore, 0) / activeDays.length)
    : 0;

  return {
    focusMinutes,
    focusLabel: formatMinutes(focusMinutes),
    averageSessionMinutes: activeDays.length
      ? Math.round(days.reduce((total, day) => total + day.averageSessionMinutes, 0) / Math.max(1, activeDays.length))
      : 0,
    tasksCompleted,
    tasksTotal,
    taskCompletionRate: tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : 0,
    goalsTotal,
    goalsCompleted,
    goalsInProgress: latestGoalDay.goalsInProgress || 0,
    goalsNotStarted: latestGoalDay.goalsNotStarted || 0,
    goalProgressAverage,
    aiUsageCount,
    momentumDays,
    momentumCompletionRate: Math.round((momentumDays / Math.max(1, days.length)) * 100),
    productivityScore,
    currentMomentum: userStats.currentMomentum || 0,
    longestMomentum: userStats.longestMomentum || 0,
    activeDays: activeDays.length
  };
}

export function formatAnalyticsMinutes(minutes = 0) {
  return formatMinutes(minutes);
}
