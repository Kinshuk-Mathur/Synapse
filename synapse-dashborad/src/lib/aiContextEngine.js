const FIRESTORE_BASE_URL = "https://firestore.googleapis.com/v1";
const TODO_PRIORITIES = ["High", "Medium", "Low"];
const SUPPORTED_ACTIONS = new Set([
  "create_todo",
  "update_todo",
  "complete_todo",
  "create_goal",
  "update_goal"
]);

function getProjectId() {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
}

function getDocumentsBaseUrl() {
  const projectId = getProjectId();
  return projectId
    ? `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents`
    : "";
}

function encodeFirestorePath(path = "") {
  return String(path)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function authHeaders(idToken, extra = {}) {
  return {
    Authorization: `Bearer ${idToken}`,
    ...extra
  };
}

function parseFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;

  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }

  if ("mapValue" in value) {
    return parseFirestoreFields(value.mapValue.fields || {});
  }

  return null;
}

function parseFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, parseFirestoreValue(value)])
  );
}

function parseFirestoreDocument(document) {
  if (!document?.name) return null;
  const path = document.name.split("/documents/")[1] || "";
  const id = path.split("/").pop() || "";

  return {
    id,
    __path: path,
    ...parseFirestoreFields(document.fields || {})
  };
}

function toFirestoreValue(value) {
  if (value === null || typeof value === "undefined") {
    return { nullValue: null };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue)
      }
    };
  }

  return {
    mapValue: {
      fields: toFirestoreFields(value)
    }
  };
}

function toFirestoreFields(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => typeof value !== "undefined")
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
}

async function safeFetchJson(url, options = {}, requestId = "chat", label = "Firestore request") {
  if (!url || !options.headers?.Authorization) {
    return null;
  }

  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store"
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(
        `[SYNAPSE AI ${requestId}] ${label} failed: ${response.status} ${errorText.slice(0, 220)}`
      );
      return null;
    }

    return response.json();
  } catch (error) {
    console.warn(`[SYNAPSE AI ${requestId}] ${label} error:`, error?.message || error);
    return null;
  }
}

async function fetchDocument(path, idToken, requestId) {
  const baseUrl = getDocumentsBaseUrl();
  const data = await safeFetchJson(
    `${baseUrl}/${encodeFirestorePath(path)}`,
    {
      headers: authHeaders(idToken)
    },
    requestId,
    `Fetch document ${path}`
  );

  return parseFirestoreDocument(data);
}

async function fetchCollection(path, idToken, requestId, pageSize = 80) {
  const baseUrl = getDocumentsBaseUrl();
  const params = new URLSearchParams({
    pageSize: String(pageSize)
  });
  const data = await safeFetchJson(
    `${baseUrl}/${encodeFirestorePath(path)}?${params.toString()}`,
    {
      headers: authHeaders(idToken)
    },
    requestId,
    `Fetch collection ${path}`
  );

  return (data?.documents || []).map(parseFirestoreDocument).filter(Boolean);
}

async function fetchRootCollectionByUid(collectionId, uid, idToken, requestId, limit = 80) {
  const baseUrl = getDocumentsBaseUrl();
  const data = await safeFetchJson(
    `${baseUrl}:runQuery`,
    {
      method: "POST",
      headers: authHeaders(idToken, {
        "Content-Type": "application/json"
      }),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: "uid" },
              op: "EQUAL",
              value: { stringValue: uid }
            }
          },
          limit
        }
      })
    },
    requestId,
    `Query ${collectionId} by uid`
  );

  return Array.isArray(data)
    ? data.map((entry) => parseFirestoreDocument(entry.document)).filter(Boolean)
    : [];
}

async function patchDocument(path, idToken, payload, requestId, options = {}) {
  const baseUrl = getDocumentsBaseUrl();
  const updateMask = options.merge
    ? Object.keys(payload).reduce((params, fieldPath) => {
        params.append("updateMask.fieldPaths", fieldPath);
        return params;
      }, new URLSearchParams())
    : new URLSearchParams();
  const url = `${baseUrl}/${encodeFirestorePath(path)}${
    updateMask.toString() ? `?${updateMask.toString()}` : ""
  }`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: authHeaders(idToken, {
      "Content-Type": "application/json"
    }),
    body: JSON.stringify({
      fields: toFirestoreFields(payload)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText.slice(0, 220)}`);
  }

  return parseFirestoreDocument(await response.json());
}

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === "number") {
    const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string") {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : new Date(value);
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  return null;
}

function dateKeyFromValue(value, fallbackDate = new Date()) {
  return formatDateKey(coerceDate(value) || fallbackDate);
}

function normalizeText(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function titleFingerprint(title = "") {
  return normalizeText(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizePriority(value = "Medium") {
  const exact = TODO_PRIORITIES.find((priority) => priority.toLowerCase() === String(value).toLowerCase());
  return exact || "Medium";
}

function normalizeDateInput(value, fallback = new Date()) {
  const raw = normalizeText(value).toLowerCase();
  const today = new Date();

  if (!raw) return formatDateKey(fallback);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw === "today") return formatDateKey(today);
  if (raw === "tomorrow") return formatDateKey(addDays(today, 1));

  const inDays = raw.match(/^in\s+(\d{1,3})\s+days?$/);
  if (inDays) return formatDateKey(addDays(today, Number(inDays[1])));

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.indexOf(raw);
  if (weekdayIndex >= 0) {
    const offset = (weekdayIndex - today.getDay() + 7) % 7 || 7;
    return formatDateKey(addDays(today, offset));
  }

  const parsed = coerceDate(value);
  return parsed ? formatDateKey(parsed) : formatDateKey(fallback);
}

function normalizeTimeInput(value = "") {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return "09:00";

  const twentyFourHour = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (twentyFourHour) {
    return `${twentyFourHour[1].padStart(2, "0")}:${twentyFourHour[2]}`;
  }

  const twelveHour = raw.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = twelveHour[2] || "00";
    if (twelveHour[3] === "pm" && hour < 12) hour += 12;
    if (twelveHour[3] === "am" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${minute}`;
  }

  return "09:00";
}

function getTodoDate(todo = {}) {
  return todo.selectedDate || todo.date || dateKeyFromValue(todo.createdAt || todo.createdLocal);
}

function getSessionDate(session = {}) {
  return session.dateKey || session.date || dateKeyFromValue(session.startedAt || session.completedAt || session.endedAt);
}

function getFocusMinutes(session = {}) {
  if (session.focusSeconds !== undefined) return Math.max(0, Math.round(Number(session.focusSeconds || 0) / 60));
  if (session.durationSeconds !== undefined) return Math.max(0, Math.round(Number(session.durationSeconds || 0) / 60));
  if (session.duration !== undefined) {
    const duration = Number(session.duration) || 0;
    return duration > 600 ? Math.round(duration / 60) : Math.round(duration);
  }
  return 0;
}

function getSessionStartHour(session = {}) {
  const startedAt = coerceDate(session.startedAt);
  return startedAt ? startedAt.getHours() : null;
}

function normalizeTodo(todo = {}) {
  const title = normalizeText(todo.title || todo.task || "Untitled task");
  return {
    id: todo.id || "",
    path: todo.__path || "",
    title,
    task: title,
    priority: normalizePriority(todo.priority),
    date: getTodoDate(todo),
    time: normalizeTimeInput(todo.time || "09:00"),
    completed: Boolean(todo.completed),
    status: todo.status || "active",
    locked: Boolean(todo.locked)
  };
}

function normalizeGoal(goal = {}) {
  const target = Math.max(1, Number(goal.target) || 1);
  const current = Math.max(0, Number(goal.current ?? goal.currentProgress) || 0);
  const progress = goal.progress !== undefined
    ? clamp(goal.progress, 0, 100)
    : clamp(Math.round((current / target) * 100), 0, 100);
  const deadlineDate = coerceDate(goal.deadline);

  return {
    id: goal.id || "",
    path: goal.__path || "",
    title: normalizeText(goal.title || "Untitled goal"),
    target,
    current,
    progress,
    completed: Boolean(goal.completed) || progress >= 100,
    deadlineDate,
    deadline: deadlineDate ? formatDateKey(deadlineDate) : "",
    category: goal.category || "Study"
  };
}

function uniqueByFingerprint(items, getFingerprint) {
  const seen = new Set();
  return items.filter((item) => {
    const fingerprint = getFingerprint(item);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function goalDeadlineText(goal, todayKey = formatDateKey()) {
  if (!goal.deadline) return "No deadline";
  const today = parseDateKey(todayKey);
  const deadline = parseDateKey(goal.deadline);
  if (!today || !deadline) return goal.deadline;
  const daysLeft = Math.ceil((deadline - today) / 86400000);
  if (daysLeft < 0) return "deadline passed";
  if (daysLeft === 0) return "due today";
  if (daysLeft === 1) return "due tomorrow";
  return `${daysLeft} days left`;
}

function inferWeakAreas({ profile, pendingTodos, activeGoals, todayFocusMinutes, currentMomentum }) {
  const weakAreas = [];
  const weakSubjects = Array.isArray(profile?.weakSubjects)
    ? profile.weakSubjects
    : profile?.weakSubjects
      ? [profile.weakSubjects]
      : [];

  weakSubjects.slice(0, 2).forEach((subject) => {
    weakAreas.push(`weak consistency in ${subject}`);
  });

  if (pendingTodos.some((todo) => todo.date < formatDateKey())) {
    weakAreas.push("overdue task follow-through");
  }

  if (todayFocusMinutes < 15) {
    weakAreas.push("focus consistency today");
  }

  if (activeGoals.some((goal) => goal.progress < 35 && goal.deadline)) {
    weakAreas.push("goal progress needs attention");
  }

  if (currentMomentum <= 1) {
    weakAreas.push("Momentum is fragile");
  }

  return Array.from(new Set(weakAreas)).slice(0, 5);
}

function getMostProductiveTime(sessions = [], profile = {}) {
  const buckets = {};

  sessions.forEach((session) => {
    const hour = getSessionStartHour(session);
    const minutes = getFocusMinutes(session);
    if (hour === null || minutes <= 0) return;
    buckets[hour] = (buckets[hour] || 0) + minutes;
  });

  const [hour, minutes] = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0] || [];
  if (minutes > 0) {
    const start = Number(hour);
    const end = (start + 2) % 24;
    const formatHour = (value) => {
      const suffix = value >= 12 ? "PM" : "AM";
      const hourValue = value % 12 || 12;
      return `${hourValue}${suffix}`;
    };
    return `${formatHour(start)}-${formatHour(end)}`;
  }

  if (profile?.productiveTime) {
    return Array.isArray(profile.productiveTime)
      ? profile.productiveTime.join(", ")
      : String(profile.productiveTime);
  }

  return "Not enough data yet";
}

function summarizeProductivityScore({ todayFocusMinutes, todayTodos, todayProgress, activeGoals }) {
  if (Number.isFinite(Number(todayProgress.productivityScore))) {
    return clamp(todayProgress.productivityScore, 0, 100);
  }

  const taskScore = todayTodos.length
    ? (todayTodos.filter((todo) => todo.completed).length / todayTodos.length) * 20
    : 0;
  const focusScore = clamp(todayFocusMinutes / 120, 0, 1) * 40;
  const goalScore = activeGoals.length
    ? (activeGoals.reduce((total, goal) => total + goal.progress, 0) / activeGoals.length / 100) * 20
    : 0;
  const momentumScore = todayProgress.momentumCompleted ? 10 : 0;
  const aiScore = todayProgress.completedAIUsage ? 10 : 0;

  return clamp(Math.round(focusScore + taskScore + goalScore + momentumScore + aiScore), 0, 100);
}

export async function buildUserContext(userId, options = {}) {
  const uid = typeof userId === "string" ? userId.trim() : "";
  const idToken = options.idToken || "";
  const requestId = options.requestId || "chat";
  const profile = options.userProfile || {};
  const emptyContext = {
    todayFocusMinutes: 0,
    pendingTodos: [],
    completedTodos: [],
    activeGoals: [],
    goalProgressSummary: [],
    currentMomentum: 0,
    longestMomentum: 0,
    productivityScore: 0,
    weakAreas: [],
    upcomingDeadlines: [],
    todayProgress: {},
    blockedDistractions: 0,
    mostProductiveTime: "Not enough data yet"
  };

  if (!uid || !idToken || !getProjectId()) {
    return emptyContext;
  }

  const todayKey = formatDateKey();
  const [
    userDocument,
    nestedTodos,
    rootTodos,
    nestedGoals,
    nestedFocusSessions,
    rootFocusSessions,
    todayProgressDoc,
    statsDocs
  ] = await Promise.all([
    fetchDocument(`users/${uid}`, idToken, requestId),
    fetchCollection(`users/${uid}/todos`, idToken, requestId),
    fetchRootCollectionByUid("todos", uid, idToken, requestId),
    fetchCollection(`users/${uid}/goals`, idToken, requestId),
    fetchCollection(`users/${uid}/focusSessions`, idToken, requestId),
    fetchRootCollectionByUid("focusSessions", uid, idToken, requestId),
    fetchDocument(`users/${uid}/dailyProgress/${todayKey}`, idToken, requestId),
    fetchCollection(`users/${uid}/stats`, idToken, requestId, 5)
  ]);

  const allTodoRefs = [...nestedTodos, ...rootTodos].map(normalizeTodo);
  const allGoalRefs = nestedGoals.map(normalizeGoal);
  const allFocusSessions = [...nestedFocusSessions, ...rootFocusSessions];
  const todos = uniqueByFingerprint(
    allTodoRefs,
    (todo) => `${titleFingerprint(todo.title)}|${todo.date}|${todo.time}|${todo.completed}`
  );
  const goals = uniqueByFingerprint(
    allGoalRefs,
    (goal) => `${titleFingerprint(goal.title)}|${goal.deadline}|${goal.target}`
  );
  const todayProgress = todayProgressDoc || {};
  const userStats = userDocument?.stats || statsDocs[0] || {};
  const todaySessions = allFocusSessions.filter((session) => getSessionDate(session) === todayKey);
  const todayFocusMinutesFromSessions = todaySessions.reduce(
    (total, session) => total + getFocusMinutes(session),
    0
  );
  const todayFocusMinutes = Math.max(
    Math.round(Number(todayProgress.focusMinutes || 0)),
    todayFocusMinutesFromSessions
  );
  const blockedDistractions = todaySessions.reduce(
    (total, session) => total + Number(session.violations || session.blockedDistractions || 0),
    0
  );
  const pendingTodos = todos
    .filter((todo) => !todo.completed && todo.status !== "carried")
    .sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      if (dateCompare !== 0) return dateCompare;
      if (a.priority !== b.priority) {
        return TODO_PRIORITIES.indexOf(a.priority) - TODO_PRIORITIES.indexOf(b.priority);
      }
      return String(a.time).localeCompare(String(b.time));
    });
  const completedTodos = todos
    .filter((todo) => todo.completed)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const todayTodos = todos.filter((todo) => todo.date === todayKey);
  const activeGoals = goals
    .filter((goal) => !goal.completed)
    .sort((a, b) => {
      if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return a.progress - b.progress;
    });
  const upcomingDeadlines = [
    ...pendingTodos
      .filter((todo) => todo.date)
      .map((todo) => ({
        type: "todo",
        title: todo.title,
        date: todo.date,
        detail: todo.date === todayKey ? "due today" : todo.date
      })),
    ...activeGoals
      .filter((goal) => goal.deadline)
      .map((goal) => ({
        type: "goal",
        title: goal.title,
        date: goal.deadline,
        detail: goalDeadlineText(goal, todayKey)
      }))
  ]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6);
  const currentMomentum = Math.max(0, Number(userStats.currentMomentum) || 0);
  const longestMomentum = Math.max(0, Number(userStats.longestMomentum) || 0);
  const summarizedTodayProgress = {
    dateKey: todayKey,
    completedTasks: todayTodos.filter((todo) => todo.completed).length,
    totalTasks: todayTodos.length,
    pendingTasks: todayTodos.filter((todo) => !todo.completed).length,
    completedFocus: Boolean(todayProgress.completedFocus) || todayFocusMinutes >= 15,
    completedTask: Boolean(todayProgress.completedTask),
    completedGoalUpdate: Boolean(todayProgress.completedGoalUpdate),
    completedAIUsage: Boolean(todayProgress.completedAIUsage),
    momentumCompleted: Boolean(todayProgress.momentumCompleted),
    focusSessions: todaySessions.filter((session) => getFocusMinutes(session) > 0).length,
    blockedDistractions
  };
  const context = {
    todayFocusMinutes,
    pendingTodos: pendingTodos.slice(0, 8).map(({ id, title, priority, date, time }) => ({
      id,
      title,
      priority,
      date,
      time
    })),
    completedTodos: completedTodos.slice(0, 6).map(({ id, title, date }) => ({
      id,
      title,
      date
    })),
    activeGoals: activeGoals.slice(0, 8).map(({ id, title, progress, target, current, deadline }) => ({
      id,
      title,
      progress,
      target,
      current,
      deadline
    })),
    goalProgressSummary: activeGoals.slice(0, 5).map((goal) => {
      const deadline = goal.deadline ? `, ${goalDeadlineText(goal, todayKey)}` : "";
      return `${goal.title} (${goal.progress}%${deadline})`;
    }),
    currentMomentum,
    longestMomentum,
    productivityScore: summarizeProductivityScore({
      todayFocusMinutes,
      todayTodos,
      todayProgress: summarizedTodayProgress,
      activeGoals
    }),
    weakAreas: inferWeakAreas({
      profile,
      pendingTodos,
      activeGoals,
      todayFocusMinutes,
      currentMomentum
    }),
    upcomingDeadlines,
    todayProgress: summarizedTodayProgress,
    blockedDistractions,
    mostProductiveTime: getMostProductiveTime(allFocusSessions, profile)
  };

  Object.defineProperty(context, "actionRefs", {
    enumerable: false,
    value: {
      todos: allTodoRefs,
      goals: allGoalRefs
    }
  });

  return context;
}

function formatList(items, formatter, emptyText) {
  if (!items?.length) return emptyText;
  return items.slice(0, 5).map(formatter).join("; ");
}

export function formatUserContextForPrompt(context = {}) {
  return `
Realtime User Context:
- Focus today: ${Math.round(Number(context.todayFocusMinutes) || 0)} mins
- Momentum: ${Number(context.currentMomentum) || 0} days; longest ${Number(context.longestMomentum) || 0} days
- Productivity score: ${Number(context.productivityScore) || 0}/100
- Distractions blocked today: ${Number(context.blockedDistractions) || 0}
- Pending todos: ${formatList(
    context.pendingTodos,
    (todo) => `${todo.title} (${todo.priority || "Medium"}, ${todo.date || "unscheduled"} ${todo.time || ""})`,
    "None"
  )}
- Completed todos: ${formatList(context.completedTodos, (todo) => todo.title, "None today")}
- Active goals: ${context.goalProgressSummary?.length ? context.goalProgressSummary.join("; ") : "None"}
- Weak consistency signals: ${context.weakAreas?.length ? context.weakAreas.join("; ") : "No clear weak area yet"}
- Upcoming deadlines: ${formatList(
    context.upcomingDeadlines,
    (item) => `${item.title} (${item.detail || item.date})`,
    "None"
  )}
- Today progress: ${context.todayProgress?.completedTasks || 0}/${context.todayProgress?.totalTasks || 0} tasks, ${
    context.todayProgress?.completedFocus ? "focus done" : "focus pending"
  }, ${context.todayProgress?.momentumCompleted ? "Momentum complete" : "Momentum incomplete"}
- Most productive time: ${context.mostProductiveTime || "Not enough data yet"}
`;
}

function extractJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [
    raw,
    fenced?.[1],
    raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)
  ].filter((candidate) => candidate && candidate.trim().startsWith("{"));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

export function parseAiActionResponse(rawMessage = "") {
  const parsed = extractJsonObject(rawMessage);

  if (!parsed || typeof parsed !== "object") {
    return {
      reply: normalizeText(rawMessage) || "I am ready.",
      action: null
    };
  }

  const reply = normalizeText(parsed.reply || parsed.message || "");
  const action = parsed.action && typeof parsed.action === "object" ? parsed.action : null;

  if (!action?.type || !SUPPORTED_ACTIONS.has(action.type)) {
    return {
      reply: reply || normalizeText(rawMessage) || "I am ready.",
      action: null
    };
  }

  return {
    reply: reply || "Done.",
    action: {
      type: action.type,
      data: action.data && typeof action.data === "object" ? action.data : {}
    }
  };
}

function createDocumentId(prefix) {
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

function cleanTitle(value, fallback = "") {
  return normalizeText(value || fallback).slice(0, 160);
}

function findByTitle(refs = [], title = "", options = {}) {
  const target = titleFingerprint(title);
  if (!target) return null;

  const candidates = refs
    .filter((ref) => (options.completed === undefined ? true : Boolean(ref.completed) === options.completed))
    .map((ref) => {
      const source = titleFingerprint(ref.title);
      let score = 0;
      if (source === target) score = 100;
      else if (source.includes(target) || target.includes(source)) score = 70;
      else {
        const targetWords = target.split(" ").filter(Boolean);
        const matches = targetWords.filter((word) => source.includes(word)).length;
        score = targetWords.length ? Math.round((matches / targetWords.length) * 50) : 0;
      }
      return { ref, score };
    })
    .filter((item) => item.score >= 40)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.ref || null;
}

function getMatchingRefs(refs = [], candidate = {}) {
  const fingerprint = `${titleFingerprint(candidate.title)}|${candidate.date || candidate.deadline || ""}|${
    candidate.time || ""
  }`;

  return refs.filter((ref) => {
    if (candidate.id && ref.id === candidate.id) return true;
    const refFingerprint = `${titleFingerprint(ref.title)}|${ref.date || ref.deadline || ""}|${ref.time || ""}`;
    return fingerprint.trim() && refFingerprint === fingerprint;
  });
}

async function writeTodo(uid, idToken, data, requestId) {
  const now = new Date();
  const todoId = createDocumentId("todo");
  const title = cleanTitle(data.title || data.task);

  if (title.length < 2) {
    throw new Error("Todo title is missing.");
  }

  const date = normalizeDateInput(data.date || data.selectedDate || data.deadline, now);
  const payload = {
    uid,
    title,
    task: title,
    completed: false,
    priority: normalizePriority(data.priority),
    date,
    selectedDate: date,
    time: normalizeTimeInput(data.time),
    note: cleanTitle(data.note, ""),
    locked: date < formatDateKey(),
    status: "active",
    source: "synapse_ai",
    createdLocal: now.toISOString(),
    createdAt: now,
    updatedAt: now,
    completedAt: null
  };
  const paths = [`users/${uid}/todos/${todoId}`, `todos/${todoId}`];
  const results = await Promise.allSettled(
    paths.map((path) => patchDocument(path, idToken, payload, requestId))
  );
  const successful = results.filter((result) => result.status === "fulfilled");

  if (!successful.length) {
    throw new Error(results[0]?.reason?.message || "Todo write failed.");
  }

  return {
    id: todoId,
    title,
    date,
    time: payload.time
  };
}

async function writeGoal(uid, idToken, data, requestId) {
  const now = new Date();
  const goalId = createDocumentId("goal");
  const title = cleanTitle(data.title || data.goal);

  if (title.length < 2) {
    throw new Error("Goal title is missing.");
  }

  const deadlineKey = normalizeDateInput(data.deadline || data.date || "in 30 days", addDays(now, 30));
  const deadlineDate = parseDateKey(deadlineKey) || addDays(now, 30);
  deadlineDate.setHours(23, 59, 59, 999);
  const target = Math.max(1, Number(data.target) || Number(String(title).match(/\d+/)?.[0]) || 1);
  const current = Math.max(0, Number(data.current ?? data.currentProgress) || 0);
  const progress = data.progress !== undefined
    ? clamp(data.progress, 0, 100)
    : clamp(Math.round((current / target) * 100), 0, 100);
  const payload = {
    uid,
    title,
    progress,
    target,
    current,
    currentProgress: current,
    deadline: deadlineDate,
    completed: progress >= 100,
    category: cleanTitle(data.category, "Study") || "Study",
    description: cleanTitle(data.description, ""),
    notes: cleanTitle(data.notes, ""),
    month: deadlineDate.getMonth() + 1,
    monthName: deadlineDate.toLocaleDateString("en-US", { month: "long" }),
    year: deadlineDate.getFullYear(),
    source: "synapse_ai",
    progressHistory: [
      {
        progress,
        current,
        target,
        completed: progress >= 100,
        dateKey: formatDateKey(now),
        recordedAt: now.toISOString()
      }
    ],
    createdLocal: now.toISOString(),
    createdAt: now,
    updatedAt: now
  };

  await patchDocument(`users/${uid}/goals/${goalId}`, idToken, payload, requestId);

  return {
    id: goalId,
    title,
    deadline: deadlineKey,
    progress
  };
}

async function markProgressPillar(uid, idToken, pillar, requestId) {
  const todayKey = formatDateKey();
  const yesterdayKey = formatDateKey(addDays(parseDateKey(todayKey), -1));
  const userPath = `users/${uid}`;
  const progressPath = `users/${uid}/dailyProgress/${todayKey}`;
  const [userDoc, progressDoc] = await Promise.all([
    fetchDocument(userPath, idToken, requestId),
    fetchDocument(progressPath, idToken, requestId)
  ]);
  const previousProgress = progressDoc || {};
  const previousStats = userDoc?.stats || {};
  const nextProgress = {
    completedFocus: Boolean(previousProgress.completedFocus),
    completedTask: Boolean(previousProgress.completedTask),
    completedGoalUpdate: Boolean(previousProgress.completedGoalUpdate),
    completedAIUsage: Boolean(previousProgress.completedAIUsage),
    momentumCompleted: Boolean(previousProgress.momentumCompleted),
    dateKey: todayKey,
    focusMinutes: Number(previousProgress.focusMinutes || 0),
    aiPromptFingerprint: previousProgress.aiPromptFingerprint || ""
  };

  if (pillar === "task") nextProgress.completedTask = true;
  if (pillar === "goal") nextProgress.completedGoalUpdate = true;

  const nextStats = {
    currentMomentum: Number(previousStats.currentMomentum || 0),
    longestMomentum: Number(previousStats.longestMomentum || 0),
    lastCompletedDate: previousStats.lastCompletedDate || "",
    totalFocusMinutes: Number(previousStats.totalFocusMinutes || 0),
    totalCompletedTasks: Number(previousStats.totalCompletedTasks || 0),
    totalGoalsUpdated: Number(previousStats.totalGoalsUpdated || 0)
  };

  if (pillar === "task" && !previousProgress.completedTask) {
    nextStats.totalCompletedTasks += 1;
  }

  if (pillar === "goal" && !previousProgress.completedGoalUpdate) {
    nextStats.totalGoalsUpdated += 1;
  }

  const productiveDayComplete = nextProgress.completedFocus;

  if (productiveDayComplete && !previousProgress.momentumCompleted) {
    const currentMomentum =
      nextStats.lastCompletedDate === todayKey
        ? Math.max(nextStats.currentMomentum, 1)
        : nextStats.lastCompletedDate === yesterdayKey
          ? nextStats.currentMomentum + 1
          : 1;

    nextProgress.momentumCompleted = true;
    nextStats.currentMomentum = currentMomentum;
    nextStats.longestMomentum = Math.max(nextStats.longestMomentum, currentMomentum);
    nextStats.lastCompletedDate = todayKey;
  }

  await patchDocument(progressPath, idToken, nextProgress, requestId, { merge: true });
  await patchDocument(userPath, idToken, { stats: nextStats }, requestId, { merge: true });
}

async function updateTodoAction(uid, idToken, action, context, requestId, complete = false) {
  const refs = context?.actionRefs?.todos || [];
  const data = action.data || {};
  const candidate = data.id
    ? refs.find((todo) => todo.id === data.id)
    : findByTitle(refs, data.title || data.task || data.query, complete ? { completed: false } : {});

  if (!candidate) {
    throw new Error("Could not find the matching todo.");
  }

  const title = cleanTitle(data.newTitle || data.title || data.task, candidate.title);
  const patch = complete
    ? {
        completed: true,
        status: "completed",
        completedAt: new Date(),
        completedLocal: new Date().toISOString(),
        updatedAt: new Date()
      }
    : {
        title,
        task: title,
        priority: data.priority ? normalizePriority(data.priority) : candidate.priority,
        date: data.date ? normalizeDateInput(data.date) : candidate.date,
        selectedDate: data.date ? normalizeDateInput(data.date) : candidate.date,
        time: data.time ? normalizeTimeInput(data.time) : candidate.time,
        updatedAt: new Date()
      };
  const matchingRefs = getMatchingRefs(refs, candidate);
  const targets = matchingRefs.length ? matchingRefs : [candidate];

  await Promise.all(targets.filter((target) => target.path).map((target) => patchDocument(target.path, idToken, patch, requestId, { merge: true })));

  if (complete && candidate.date === formatDateKey()) {
    await markProgressPillar(uid, idToken, "task", requestId);
  }

  return {
    id: candidate.id,
    title: patch.title || candidate.title
  };
}

async function updateGoalAction(uid, idToken, action, context, requestId) {
  const refs = context?.actionRefs?.goals || [];
  const data = action.data || {};
  const candidate = data.id
    ? refs.find((goal) => goal.id === data.id)
    : findByTitle(refs, data.title || data.goal || data.query);

  if (!candidate?.path) {
    throw new Error("Could not find the matching goal.");
  }

  const title = cleanTitle(data.newTitle || data.title || data.goal, candidate.title);
  const target = Math.max(1, Number(data.target) || candidate.target || 1);
  const current = data.current !== undefined || data.currentProgress !== undefined
    ? Math.max(0, Number(data.current ?? data.currentProgress) || 0)
    : data.progress !== undefined
      ? Math.round((target * clamp(data.progress, 0, 100)) / 100)
      : candidate.current || 0;
  const progress = data.progress !== undefined
    ? clamp(data.progress, 0, 100)
    : clamp(Math.round((current / target) * 100), 0, 100);
  const deadlineKey = data.deadline || data.date
    ? normalizeDateInput(data.deadline || data.date)
    : candidate.deadline;
  const deadlineDate = deadlineKey ? parseDateKey(deadlineKey) : null;
  if (deadlineDate) deadlineDate.setHours(23, 59, 59, 999);

  const patch = {
    title,
    target,
    current,
    currentProgress: current,
    progress,
    completed: Boolean(data.completed) || progress >= 100,
    updatedAt: new Date(),
    updatedLocal: new Date().toISOString()
  };

  if (deadlineDate) {
    patch.deadline = deadlineDate;
    patch.month = deadlineDate.getMonth() + 1;
    patch.monthName = deadlineDate.toLocaleDateString("en-US", { month: "long" });
    patch.year = deadlineDate.getFullYear();
  }

  await patchDocument(candidate.path, idToken, patch, requestId, { merge: true });
  await markProgressPillar(uid, idToken, "goal", requestId);

  return {
    id: candidate.id,
    title,
    progress
  };
}

export async function executeAiAction(uid, idToken, action, options = {}) {
  const requestId = options.requestId || "chat";

  if (!uid || !idToken) {
    return {
      success: false,
      type: action?.type || "",
      message: "Sign in again so SYNAPSE AI can update Firebase."
    };
  }

  if (!action?.type || !SUPPORTED_ACTIONS.has(action.type)) {
    return {
      success: false,
      type: action?.type || "",
      message: "Unsupported action."
    };
  }

  try {
    if (action.type === "create_todo") {
      const todo = await writeTodo(uid, idToken, action.data || {}, requestId);
      return {
        success: true,
        type: action.type,
        message: `Created todo "${todo.title}" for ${todo.date} at ${todo.time}.`,
        data: todo
      };
    }

    if (action.type === "create_goal") {
      const goal = await writeGoal(uid, idToken, action.data || {}, requestId);
      return {
        success: true,
        type: action.type,
        message: `Created goal "${goal.title}" with deadline ${goal.deadline}.`,
        data: goal
      };
    }

    if (action.type === "update_todo") {
      const todo = await updateTodoAction(uid, idToken, action, options.context, requestId, false);
      return {
        success: true,
        type: action.type,
        message: `Updated todo "${todo.title}".`,
        data: todo
      };
    }

    if (action.type === "complete_todo") {
      const todo = await updateTodoAction(uid, idToken, action, options.context, requestId, true);
      return {
        success: true,
        type: action.type,
        message: `Completed todo "${todo.title}".`,
        data: todo
      };
    }

    if (action.type === "update_goal") {
      const goal = await updateGoalAction(uid, idToken, action, options.context, requestId);
      return {
        success: true,
        type: action.type,
        message: `Updated goal "${goal.title}" to ${goal.progress}%.`,
        data: goal
      };
    }
  } catch (error) {
    console.warn(`[SYNAPSE AI ${requestId}] Action ${action.type} failed:`, error?.message || error);
    return {
      success: false,
      type: action.type,
      message: error?.message || "Firebase update failed."
    };
  }

  return {
    success: false,
    type: action.type,
    message: "Action was not handled."
  };
}

export function composeActionReply(reply, actionResult) {
  const baseReply = normalizeText(reply) || "Done.";

  if (!actionResult) {
    return baseReply;
  }

  if (actionResult.success) {
    const alreadyDone = /\b(done|created|updated|completed|added)\b/i.test(baseReply);
    return alreadyDone ? baseReply : `${baseReply}\n\nDone: ${actionResult.message}`;
  }

  return `${baseReply}\n\nI could not complete the Firebase action: ${actionResult.message}`;
}
