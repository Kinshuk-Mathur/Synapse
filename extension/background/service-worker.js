const MOTIVATION_ALARM = "synapse-focus-motivation";
const SESSION_END_ALARM = "synapse-focus-session-end";
const BREAK_END_ALARM = "synapse-focus-break-end";
const SYNC_REMINDER_ALARM = "synapse-focus-sync-reminder";
const SYNAPSE_AI_MODEL = "llama-3.1-8b-instant";

const STORAGE_KEYS = {
  session: "synapseFocusSession",
  legacySession: "focusSession",
  stats: "synapseFocusStats",
  settings: "synapseFocusSettings",
  dashboardBridge: "synapseFocusDashboardBridge"
};

const DEFAULT_SETTINGS = {
  focusGoal: "Deep study session",
  defaultDurationSeconds: 2 * 60 * 60,
  sameOriginLock: true,
  fullscreenProtection: true,
  blockDistractingSites: true,
  aiCompanionEnabled: false,
  aiButtonPosition: null,
  dashboardUrl: "https://synapse24.netlify.app",
  restrictedHosts: [
    "instagram.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "tiktok.com",
    "facebook.com",
    "netflix.com",
    "primevideo.com",
    "hotstar.com",
    "discord.com",
    "twitch.tv"
  ]
};

const MOTIVATION_MESSAGES = [
  "Stay focused.",
  "Your goals need consistency.",
  "Two hours of focus can change your future.",
  "Come back to your session.",
  "One tab. One goal. Keep going.",
  "This is the quiet work that compounds."
];

const REASON_COPY = {
  "tab-switch": "Tab switch blocked. Come back to your session.",
  "window-switch": "Window switch detected. Stay with the study window.",
  "new-tab": "New tab blocked. Your current goal is still waiting.",
  "blocked-site": "Distraction blocked. Return to the focus tab.",
  "keyboard-shortcut": "Shortcut blocked. Stay focused.",
  "fullscreen-exit": "Fullscreen exit detected. Returning you to focus.",
  "video-change": "Video change blocked. Finish the current lesson first.",
  "tab-close": "Focus tab restored. Finish the session before closing it.",
  "switch-burst": "Too many switches. Take one breath and return to the work.",
  "new-window": "New window blocked. Stay in your focus space.",
  "miniplayer": "Mini-player blocked. Finish the current lesson first.",
  "manual-stop": "Stop attempt recorded. Take one breath before ending the session."
};

const ATTEMPT_TYPE_BY_REASON = {
  "tab-switch": "tab_switch_attempt",
  "window-switch": "window_switch_attempt",
  "new-tab": "new_tab_attempt",
  "blocked-site": "blocked_site_attempt",
  "keyboard-shortcut": "shortcut_attempt",
  "fullscreen-exit": "fullscreen_exit_attempt",
  "video-change": "video_change_attempt",
  "new-window": "new_window_attempt",
  "miniplayer": "miniplayer_attempt",
  "tab-close": "focus_tab_close_attempt",
  "switch-burst": "excessive_switching_attempt",
  "restore": "focus_tab_restore_attempt",
  "manual-stop": "manual_stop_attempt"
};

const STOP_WARNING_MESSAGES = [
  "Pause for one breath. You started this session for a reason.",
  "Your future self is quietly asking you to finish this block.",
  "Last check-in. If you still need to stop, the next click will end the session."
];

const defaultSession = () => ({
  active: false,
  sessionId: "",
  lockedTabId: null,
  lockedWindowId: null,
  lockedOrigin: "",
  emergencyCode: "",
  startTime: null,
  durationSeconds: null,
  endTime: null,
  breaksAllowed: 0,
  breaksUsed: 0,
  onBreak: false,
  breakStartedAt: null,
  breakEndTime: null,
  pausedElapsedSeconds: 0,
  violations: 0,
  milestoneCount: 0,
  lockedTitle: "",
  lockedUrl: "",
  focusGoal: DEFAULT_SETTINGS.focusGoal,
  platform: "desktop",
  sessionDistractions: {},
  distractionAttempts: [],
  distractionIntervals: {},
  distractionPeaks: [],
  focusScore: 100,
  stopWarningCount: 0,
  recentSwitches: [],
  lastViolationAt: null,
  aiChats: [],
  aiSummary: null,
  aiTopics: [],
  aiQuestionCount: 0
});

const defaultStats = () => ({
  version: 2,
  totalFocusSeconds: 0,
  sessionsCompleted: 0,
  sessionsStarted: 0,
  blockedDistractions: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastFocusDate: "",
  daily: {},
  reasonCounts: {},
  distractingSites: {},
  attemptLog: [],
  intervalHeatmap: {},
  sessionHistory: [],
  lastSyncedAt: null
});

let sessionData = defaultSession();
let focusStats = defaultStats();
let focusSettings = { ...DEFAULT_SETTINGS };
let dashboardBridge = null;
let dashboardAuth = null;
let guardIntervalId = null;
let popupInteractionUntil = 0;
let lastNotificationAt = 0;
const blockedTabIds = new Map();

function ignoreRuntimeError() {
  try {
    void chrome.runtime.lastError;
  } catch (_) {
    // Chrome can invalidate callbacks while an unpacked extension is reloading.
  }
}

function toChromeId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

function safeTabsSendMessage(tabId, message, callback = ignoreRuntimeError) {
  const id = toChromeId(tabId);
  if (id == null) return false;

  try {
    chrome.tabs.sendMessage(id, message, callback);
    return true;
  } catch (_) {
    return false;
  }
}

function safeTabsUpdate(tabId, updateInfo, callback = ignoreRuntimeError) {
  const id = toChromeId(tabId);
  if (id == null) return false;

  try {
    chrome.tabs.update(id, updateInfo, callback);
    return true;
  } catch (_) {
    return false;
  }
}

function safeWindowsUpdate(windowId, updateInfo, callback = ignoreRuntimeError) {
  const id = toChromeId(windowId);
  if (id == null) return false;

  try {
    chrome.windows.update(id, updateInfo, callback);
    return true;
  } catch (_) {
    return false;
  }
}

function safeTabsGet(tabId, callback) {
  const id = toChromeId(tabId);
  if (id == null) return false;

  try {
    chrome.tabs.get(id, callback);
    return true;
  } catch (_) {
    return false;
  }
}

function randomId(prefix = "sf") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, offset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return getDateKey(date.getTime());
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch (_) {
    return null;
  }
}

function normalizeHost(hostname = "") {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function getHost(url) {
  const parsed = safeUrl(url);
  return parsed ? normalizeHost(parsed.hostname) : "";
}

function getOrigin(url) {
  const parsed = safeUrl(url);
  return parsed ? parsed.origin : "";
}

function getWebsiteLabel(url = "") {
  const host = getHost(url);
  if (host) return host;
  if (url.startsWith("chrome://")) return "chrome";
  if (url.startsWith("chrome-extension://")) return "extension";
  if (url.startsWith("file://")) return "local-file";
  return "browser";
}

function isInternalUrl(url = "") {
  return (
    !url ||
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://")
  );
}

function isLockableUrl(url = "") {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

function isRestrictedHost(hostname) {
  const host = normalizeHost(hostname);
  return focusSettings.restrictedHosts.some(
    (restrictedHost) => host === restrictedHost || host.endsWith(`.${restrictedHost}`)
  );
}

function isDistractingPath(url = "") {
  const parsed = safeUrl(url);
  if (!parsed) return false;
  const host = normalizeHost(parsed.hostname);
  const path = parsed.pathname.toLowerCase();

  if (host.includes("youtube.com")) {
    return path.startsWith("/shorts") || path.startsWith("/feed/trending");
  }

  if (host.includes("instagram.com")) {
    return path.startsWith("/reels") || path.startsWith("/explore");
  }

  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) {
    return path.startsWith("/explore") || path.startsWith("/i/trends");
  }

  return isRestrictedHost(host);
}

function shouldBlockLockedNavigation(url = "") {
  if (!sessionData.active || !isLockableUrl(url)) return false;
  if (focusSettings.blockDistractingSites && isDistractingPath(url)) return true;

  const nextOrigin = getOrigin(url);
  if (focusSettings.sameOriginLock && sessionData.lockedOrigin && nextOrigin !== sessionData.lockedOrigin) {
    return true;
  }

  return false;
}

function ensureDaily(dateKey = getDateKey()) {
  if (!focusStats.daily[dateKey]) {
    focusStats.daily[dateKey] = {
      dateKey,
      focusSeconds: 0,
      sessionsCompleted: 0,
      sessionsStarted: 0,
      blockedDistractions: 0,
      reasonCounts: {},
      distractingSites: {},
      attemptTypes: {},
      intervalHeatmap: {},
      focusScoreTotal: 0,
      focusScoreSamples: 0
    };
  }

  focusStats.daily[dateKey] = {
    dateKey,
    focusSeconds: 0,
    sessionsCompleted: 0,
    sessionsStarted: 0,
    blockedDistractions: 0,
    reasonCounts: {},
    distractingSites: {},
    attemptTypes: {},
    intervalHeatmap: {},
    focusScoreTotal: 0,
    focusScoreSamples: 0,
    ...focusStats.daily[dateKey]
  };

  return focusStats.daily[dateKey];
}

function getAttemptType(reason) {
  return ATTEMPT_TYPE_BY_REASON[reason] || "restriction_bypass_attempt";
}

function getIntervalKey(elapsedSeconds) {
  const intervalIndex = Math.max(0, Math.floor(elapsedSeconds / 300));
  return `${intervalIndex * 5}-${intervalIndex * 5 + 5}`;
}

function computeSessionFocusScore(session = sessionData) {
  if (!session?.active && !session?.startTime) return 100;

  const attempts = Number(session.violations || 0);
  const focusSeconds = computeFocusSeconds(session);
  const focusMinutes = Math.max(1, focusSeconds / 60);
  const attemptsPerTenMinutes = attempts / Math.max(1, focusMinutes / 10);
  const peakCount = Math.max(
    0,
    ...Object.values(session.distractionIntervals || {}).map((interval) => Number(interval.count || 0))
  );
  const completionBonus = session.durationSeconds && focusSeconds >= session.durationSeconds ? 6 : 0;
  const rawScore = 100 - attemptsPerTenMinutes * 8 - peakCount * 2 + completionBonus;

  return Math.max(0, Math.min(100, Math.round(rawScore)));
}

function computeStreak() {
  let cursor = getDateKey();
  let streak = 0;

  while (
    Number(focusStats.daily[cursor]?.sessionsCompleted || 0) > 0 &&
    Number(focusStats.daily[cursor]?.focusSeconds || 0) >= 15 * 60
  ) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  focusStats.currentStreak = streak;
  focusStats.bestStreak = Math.max(focusStats.bestStreak || 0, streak);
}

function saveSession() {
  chrome.storage.local.set({
    [STORAGE_KEYS.session]: sessionData,
    [STORAGE_KEYS.legacySession]: sessionData
  });
  updateActionState();
}

function saveStats({ broadcast = true } = {}) {
  chrome.storage.local.set({ [STORAGE_KEYS.stats]: focusStats });
  if (broadcast) scheduleDashboardSync();
}

function saveSettings() {
  chrome.storage.local.set({ [STORAGE_KEYS.settings]: focusSettings });
}

function saveDashboardBridge() {
  chrome.storage.local.set({ [STORAGE_KEYS.dashboardBridge]: dashboardBridge });
}

function publicAiStatus() {
  return {
    enabled: Boolean(focusSettings.aiCompanionEnabled),
    model: SYNAPSE_AI_MODEL,
    endpoint: `${(focusSettings.dashboardUrl || DEFAULT_SETTINGS.dashboardUrl).replace(/\/$/, "")}/api/focus-ai`,
    position: focusSettings.aiButtonPosition || null,
    session: sessionData.active ? sessionData : null,
    dashboardConnected: Boolean(dashboardBridge?.uid),
    firebaseWritable: Boolean(dashboardBridge?.uid && dashboardAuth?.idToken && dashboardAuth?.firebaseProjectId)
  };
}

function cleanText(value = "", maxLength = 8000) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeAiChat(chat = {}) {
  return {
    id: chat.id || randomId("chat"),
    userId: chat.userId || dashboardBridge?.uid || "",
    sessionId: chat.sessionId || sessionData.sessionId || "",
    timestamp: Number(chat.timestamp || Date.now()),
    userMessage: cleanText(chat.userMessage || chat.prompt || "", 5000),
    aiResponse: String(chat.aiResponse || chat.response || "").trim(),
    topic: cleanText(chat.topic || detectTopic(`${chat.userMessage || ""} ${chat.aiResponse || ""}`), 80),
    model: chat.model || SYNAPSE_AI_MODEL,
    pageTitle: cleanText(chat.pageTitle || "", 180),
    pageUrl: cleanText(chat.pageUrl || "", 1000)
  };
}

function normalizeAiChats(chats = []) {
  return (Array.isArray(chats) ? chats : [])
    .map(normalizeAiChat)
    .filter((chat) => chat.userMessage || chat.aiResponse)
    .slice(-80);
}

function getSessionAiChats(session = {}) {
  return normalizeAiChats(session.aiChats || []);
}

function getHistoryRecord(sessionId) {
  return (focusStats.sessionHistory || []).find((item) => item.id === sessionId) || null;
}

function extractTopicsFromChats(chats = []) {
  const seen = new Set();
  const topics = [];

  chats.forEach((chat) => {
    const topic = cleanText(chat.topic || detectTopic(`${chat.userMessage} ${chat.aiResponse}`), 80);
    if (!topic || seen.has(topic.toLowerCase())) return;
    seen.add(topic.toLowerCase());
    topics.push(topic);
  });

  return topics.slice(0, 8);
}

function detectTopic(text = "") {
  const value = cleanText(text, 900).toLowerCase();
  const topicSignals = [
    ["Electrostatics", /\b(electrostatics?|electric field|coulomb|capacitance|potential difference)\b/],
    ["Capacitance", /\b(capacitance|capacitor|dielectric|charge storage)\b/],
    ["Calculus", /\b(calculus|derivative|integral|limit|differentiation|integration)\b/],
    ["Physics numericals", /\b(numerical|formula|velocity|acceleration|force|work energy|momentum)\b/],
    ["Chemistry", /\b(chemical|mole concept|organic|inorganic|reaction|equilibrium|acid|base)\b/],
    ["Biology", /\b(biology|cell|genetics|photosynthesis|respiration|anatomy)\b/],
    ["Mathematics", /\b(algebra|trigonometry|geometry|probability|matrix|vector)\b/],
    ["Programming", /\b(code|bug|javascript|python|react|firebase|api|function|component|algorithm)\b/],
    ["Business Studies", /\b(business|organisation|management|marketing|finance|enterprise)\b/],
    ["History", /\b(history|civics|politics|geography|constitution)\b/]
  ];
  const match = topicSignals.find(([, pattern]) => pattern.test(value));
  if (match) return match[0];

  const words = value
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["what", "when", "where", "which", "should", "could", "would", "explain", "please", "this", "that", "with", "from", "about"].includes(word));

  return words.slice(0, 3).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") || "Study question";
}

function getWeakAreas(chats = []) {
  const weakSignals = /\b(confused|weak|wrong|mistake|stuck|doubt|hard|difficult|numerical|error|derive|derivation|formula)\b/i;
  const areas = chats
    .filter((chat) => weakSignals.test(`${chat.userMessage} ${chat.aiResponse}`))
    .map((chat) => chat.topic || detectTopic(chat.userMessage));

  return [...new Set(areas)].slice(0, 5);
}

function buildLocalAiSummary(session = {}, focusSeconds = 0) {
  const chats = getSessionAiChats(session);
  const topics = extractTopicsFromChats(chats);
  const weakAreas = getWeakAreas(chats);
  const goal = session.focusGoal || DEFAULT_SETTINGS.focusGoal;
  const durationMinutes = Math.max(0, Math.round(focusSeconds / 60));
  const revision = weakAreas.length
    ? weakAreas.map((area) => `Review ${area} with 3-5 focused practice questions.`)
    : ["Revisit the main notes from this session and solve a short recall set."];
  const markdown = [
    "# Session Summary",
    `- **Focus Goal:** ${goal}`,
    `- **Duration:** ${durationMinutes} min`,
    `- **Questions Asked:** ${chats.length}`,
    "",
    "## Topics Covered",
    ...(topics.length ? topics.map((topic) => `- ${topic}`) : ["- No AI topics recorded."]),
    "",
    "## Weak Areas",
    ...(weakAreas.length ? weakAreas.map((area) => `- ${area}`) : ["- No clear weak area detected yet."]),
    "",
    "## Suggested Revision",
    ...revision.map((item) => `- ${item}`)
  ].join("\n");

  return {
    generatedAt: Date.now(),
    source: "local",
    model: chats.length ? "synapse-local-summary" : "",
    topicsCovered: topics,
    questionsAsked: chats.length,
    weakAreas,
    keyConcepts: topics.slice(0, 5),
    recommendedRevision: revision,
    markdown
  };
}

function buildRecentAiMessages(sessionId, limit = 5) {
  const sourceSession = sessionData.sessionId === sessionId
    ? sessionData
    : getHistoryRecord(sessionId) || {};
  const chats = getSessionAiChats(sourceSession).slice(-limit);
  const messages = [];

  chats.forEach((chat) => {
    if (chat.userMessage) messages.push({ role: "user", content: chat.userMessage });
    if (chat.aiResponse) messages.push({ role: "assistant", content: chat.aiResponse });
  });

  return messages;
}

function getSynapseAiEndpoint() {
  return `${(focusSettings.dashboardUrl || DEFAULT_SETTINGS.dashboardUrl).replace(/\/$/, "")}/api/focus-ai`;
}

async function callSynapseAiBackend(payload = {}) {
  const response = await fetch(getSynapseAiEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(dashboardAuth?.idToken ? { Authorization: `Bearer ${dashboardAuth.idToken}` } : {})
    },
    body: JSON.stringify({
      uid: dashboardBridge?.uid || "",
      sessionId: payload.sessionId || sessionData.sessionId || "",
      session: payload.session || null,
      pageContext: payload.pageContext || {},
      prompt: payload.prompt || "",
      recentMessages: payload.recentMessages || [],
      chats: payload.chats || [],
      focusSeconds: payload.focusSeconds || 0,
      reason: payload.reason || "",
      mode: payload.mode || "chat"
    })
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message || errorBody?.message || "";
    } catch (_) {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || `SYNAPSE AI request failed with ${response.status}.`);
  }

  const data = await response.json();
  const reply = data?.message?.trim();
  if (!reply) throw new Error("SYNAPSE AI returned an empty answer.");
  return reply;
}

function storeAiChat(chat) {
  const normalized = normalizeAiChat(chat);
  if (!normalized.sessionId) return normalized;

  let changed = false;

  if (sessionData.active && sessionData.sessionId === normalized.sessionId) {
    const chats = getSessionAiChats(sessionData).filter((item) => item.id !== normalized.id);
    chats.push(normalized);
    sessionData.aiChats = chats.slice(-80);
    sessionData.aiQuestionCount = sessionData.aiChats.length;
    sessionData.aiTopics = extractTopicsFromChats(sessionData.aiChats);
    saveSession();
    changed = true;
  }

  const historyRecord = getHistoryRecord(normalized.sessionId);
  if (historyRecord) {
    const chats = getSessionAiChats(historyRecord).filter((item) => item.id !== normalized.id);
    chats.push(normalized);
    historyRecord.aiChats = chats.slice(-80);
    historyRecord.aiChatCount = historyRecord.aiChats.length;
    historyRecord.aiTopics = extractTopicsFromChats(historyRecord.aiChats);
    saveStats();
    changed = true;
  }

  if (changed) scheduleDashboardSync();
  persistAiChatToFirestore(normalized).catch(() => {});
  return normalized;
}

function upsertSessionAiSummary(sessionId, summary) {
  if (!sessionId || !summary) return;

  const normalizedSummary = {
    generatedAt: Number(summary.generatedAt || Date.now()),
    source: summary.source || "groq",
    model: summary.model || SYNAPSE_AI_MODEL,
    topicsCovered: Array.isArray(summary.topicsCovered) ? summary.topicsCovered : [],
    questionsAsked: Number(summary.questionsAsked || 0),
    weakAreas: Array.isArray(summary.weakAreas) ? summary.weakAreas : [],
    keyConcepts: Array.isArray(summary.keyConcepts) ? summary.keyConcepts : [],
    recommendedRevision: Array.isArray(summary.recommendedRevision) ? summary.recommendedRevision : [],
    markdown: String(summary.markdown || "").trim()
  };

  if (sessionData.active && sessionData.sessionId === sessionId) {
    sessionData.aiSummary = normalizedSummary;
    sessionData.aiTopics = normalizedSummary.topicsCovered.length
      ? normalizedSummary.topicsCovered
      : sessionData.aiTopics || [];
    saveSession();
  }

  const historyRecord = getHistoryRecord(sessionId);
  if (historyRecord) {
    historyRecord.aiSummary = normalizedSummary;
    historyRecord.aiTopics = normalizedSummary.topicsCovered.length
      ? normalizedSummary.topicsCovered
      : historyRecord.aiTopics || [];
    historyRecord.notes = normalizedSummary.markdown;
    saveStats();
    scheduleDashboardSync();
  }

  persistAiSummaryToFirestore(sessionId, normalizedSummary).catch(() => {});
}

async function generateAndStoreAiSummary(session, reason, focusSeconds) {
  const chats = getSessionAiChats(session);
  if (!chats.length) return;

  try {
    const localSummary = buildLocalAiSummary(session, focusSeconds);
    const markdown = await callSynapseAiBackend({
      mode: "summary",
      sessionId: session.sessionId,
      session,
      chats: chats.slice(-18),
      focusSeconds,
      reason
    });
    upsertSessionAiSummary(session.sessionId, {
      ...localSummary,
      generatedAt: Date.now(),
      source: "groq",
      model: SYNAPSE_AI_MODEL,
      markdown
    });
  } catch (_) {
    // The local summary is already saved, so failed AI summarization stays quiet.
  }
}

async function handleAiChatRequest(message = {}, sender = {}) {
  if (!focusSettings.aiCompanionEnabled) {
    return { success: false, error: "SYNAPSE AI Companion is turned off." };
  }

  const prompt = cleanText(message.prompt || "", 5000);
  if (!prompt) return { success: false, error: "Ask a study question first." };

  const pageContext = {
    title: cleanText(message.pageContext?.title || sender.tab?.title || "", 180),
    url: cleanText(message.pageContext?.url || sender.tab?.url || "", 1000),
    selection: cleanText(message.pageContext?.selection || "", 1200)
  };
  const sessionId = message.sessionId || sessionData.sessionId || `ambient_${getDateKey()}`;
  const sourceSession = sessionData.sessionId === sessionId ? sessionData : getHistoryRecord(sessionId) || sessionData;
  const aiResponse = await callSynapseAiBackend({
    mode: "chat",
    sessionId,
    session: sourceSession,
    pageContext,
    prompt,
    recentMessages: buildRecentAiMessages(sessionId)
  });
  const chat = storeAiChat({
    id: message.chatId || randomId("chat"),
    userId: dashboardBridge?.uid || "",
    sessionId,
    timestamp: Date.now(),
    userMessage: prompt,
    aiResponse,
    topic: detectTopic(`${prompt} ${aiResponse}`),
    model: SYNAPSE_AI_MODEL,
    pageTitle: pageContext.title,
    pageUrl: pageContext.url
  });

  return { success: true, chat, aiStatus: publicAiStatus() };
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .map(([key, child]) => [key, toFirestoreValue(child)])
        )
      }
    };
  }
  return { stringValue: String(value) };
}

async function patchFirestoreDocument(documentPath, data = {}) {
  if (!dashboardBridge?.uid || !dashboardAuth?.idToken || !dashboardAuth?.firebaseProjectId) return false;

  const fields = Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, toFirestoreValue(value)])
  );
  const updateMask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const url = `${dashboardAuth.firestoreBaseUrl || "https://firestore.googleapis.com/v1"}/projects/${dashboardAuth.firebaseProjectId}/databases/(default)/documents/${documentPath}${updateMask ? `?${updateMask}` : ""}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${dashboardAuth.idToken}`
    },
    body: JSON.stringify({ fields })
  });

  return response.ok;
}

async function persistAiChatToFirestore(chat) {
  if (!chat?.sessionId || !dashboardBridge?.uid) return false;
  const sessionDocId = `${dashboardBridge.uid}_${chat.sessionId}`;

  await patchFirestoreDocument(`focusSessions/${sessionDocId}/chats/${chat.id}`, {
    ...chat,
    uid: dashboardBridge.uid,
    updatedAt: Date.now()
  });

  return true;
}

async function persistAiSummaryToFirestore(sessionId, summary) {
  if (!sessionId || !dashboardBridge?.uid) return false;
  const sessionDocId = `${dashboardBridge.uid}_${sessionId}`;

  await patchFirestoreDocument(`focusSessions/${sessionDocId}/summaries/session`, {
    uid: dashboardBridge.uid,
    sessionId,
    summary,
    updatedAt: Date.now()
  });

  return true;
}

function updateActionState() {
  if (!chrome.action) return;

  chrome.action.setBadgeText({ text: sessionData.active ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: sessionData.active ? "#ff00b8" : "#4b0082" });
  chrome.action.setTitle({
    title: sessionData.active ? "Focus Lock is guarding your session" : "Start Focus Lock"
  });
}

function resetSessionSilently() {
  clearMotivationAlarm();
  clearSessionEndAlarm();
  clearBreakEndAlarm();
  stopGuardLoop();
  sessionData = defaultSession();
  saveSession();
}

function computeFocusSeconds(session, endTimestamp = Date.now()) {
  if (!session?.startTime) return 0;
  if (session.onBreak) return Math.max(0, Math.floor(session.pausedElapsedSeconds || 0));

  const elapsed = Math.max(0, Math.floor((endTimestamp - session.startTime) / 1000));
  return session.durationSeconds ? Math.min(elapsed, session.durationSeconds) : elapsed;
}

function getAllowedBreaks(durationSeconds) {
  if (!durationSeconds) return 0;
  if (durationSeconds < 3600) return 1;
  return Math.min(5, Math.floor(durationSeconds / 3600) + 1);
}

function scheduleMotivationAlarm() {
  chrome.alarms.clear(MOTIVATION_ALARM, () => {
    if (!sessionData.active || !sessionData.startTime) return;

    const thirtyMinutes = 30 * 60 * 1000;
    const elapsed = Date.now() - sessionData.startTime;
    const nextDelay = Math.max(1, (thirtyMinutes - (elapsed % thirtyMinutes)) / 60000);

    chrome.alarms.create(MOTIVATION_ALARM, {
      delayInMinutes: nextDelay,
      periodInMinutes: 30
    });
  });
}

function clearMotivationAlarm() {
  chrome.alarms.clear(MOTIVATION_ALARM);
}

function scheduleSessionEndAlarm() {
  chrome.alarms.clear(SESSION_END_ALARM, () => {
    if (!sessionData.active || !sessionData.endTime) return;

    const delayInMinutes = Math.max(0.1, (sessionData.endTime - Date.now()) / 60000);
    chrome.alarms.create(SESSION_END_ALARM, { delayInMinutes });
  });
}

function clearSessionEndAlarm() {
  chrome.alarms.clear(SESSION_END_ALARM);
}

function scheduleBreakEndAlarm() {
  chrome.alarms.clear(BREAK_END_ALARM, () => {
    if (!sessionData.active || !sessionData.onBreak || !sessionData.breakEndTime) return;

    const delayInMinutes = Math.max(0.1, (sessionData.breakEndTime - Date.now()) / 60000);
    chrome.alarms.create(BREAK_END_ALARM, { delayInMinutes });
  });
}

function clearBreakEndAlarm() {
  chrome.alarms.clear(BREAK_END_ALARM);
}

function notifyTab(tabId, message) {
  safeTabsSendMessage(tabId, message);
}

function notifyBrowser(message, force = false) {
  const now = Date.now();
  if (!force && now - lastNotificationAt < 12000) return;
  lastNotificationAt = now;

  if (!chrome.notifications?.create) return;
  chrome.notifications.create(
    randomId("notice"),
    {
      type: "basic",
      iconUrl: "assets/icon128.png",
      title: "Focus Lock",
      message
    },
    ignoreRuntimeError
  );
}

function focusLockedWindowAndTab(forceWindowState = false) {
  const lockedTabId = toChromeId(sessionData.lockedTabId);
  const lockedWindowId = toChromeId(sessionData.lockedWindowId);
  if (!sessionData.active || lockedTabId == null || lockedWindowId == null) return;

  const windowUpdate = forceWindowState && focusSettings.fullscreenProtection
    ? { focused: true, state: "fullscreen" }
    : { focused: true };

  if (!safeWindowsUpdate(lockedWindowId, windowUpdate)) {
    safeWindowsUpdate(lockedWindowId, { focused: true });
  }
  safeTabsUpdate(lockedTabId, { active: true });
}

function enforceLock(forceWindowState = false) {
  if (!sessionData.active || sessionData.onBreak || sessionData.lockedTabId == null) return;

  focusLockedWindowAndTab(forceWindowState);
  setTimeout(() => focusLockedWindowAndTab(forceWindowState), 140);
  setTimeout(() => focusLockedWindowAndTab(false), 420);
}

function isPopupInteractionActive() {
  return Date.now() < popupInteractionUntil;
}

function startGuardLoop() {
  stopGuardLoop();
  guardIntervalId = setInterval(() => {
    if (!sessionData.active || sessionData.onBreak) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (chrome.runtime.lastError || !sessionData.active || sessionData.onBreak) return;
      if (activeTab && activeTab.id !== sessionData.lockedTabId && !blockedTabIds.has(activeTab.id)) {
        registerViolation("tab-switch", activeTab.id, activeTab.url);
      }
    });

    chrome.windows.getLastFocused({}, (window) => {
      if (chrome.runtime.lastError || !sessionData.active || sessionData.onBreak || !window) return;
      if (window.id !== sessionData.lockedWindowId) {
        registerViolation("window-switch");
      }
    });
  }, 900);
}

function stopGuardLoop() {
  if (!guardIntervalId) return;
  clearInterval(guardIntervalId);
  guardIntervalId = null;
}

function syncLockedTab() {
  if (!sessionData.active || sessionData.lockedTabId == null) return;
  notifyTab(sessionData.lockedTabId, { type: "SESSION_RESYNC", session: sessionData });
  setTimeout(() => notifyTab(sessionData.lockedTabId, { type: "SESSION_RESYNC", session: sessionData }), 300);
  setTimeout(() => notifyTab(sessionData.lockedTabId, { type: "SESSION_RESYNC", session: sessionData }), 1100);
}

function cleanupBlockedTabs() {
  const staleBefore = Date.now() - 5 * 60 * 1000;
  for (const [tabId, createdAt] of blockedTabIds.entries()) {
    if (createdAt < staleBefore) blockedTabIds.delete(tabId);
  }

  const sorted = [...blockedTabIds.entries()].sort((a, b) => a[1] - b[1]);
  while (sorted.length > 4) {
    const [tabId] = sorted.shift();
    blockedTabIds.delete(tabId);
    chrome.tabs.remove(tabId, ignoreRuntimeError);
  }
}

function getBlockedPageUrl(reason, targetUrl = "") {
  const params = new URLSearchParams({
    reason,
    target: targetUrl || "",
    session: sessionData.sessionId || "",
    until: sessionData.endTime ? String(sessionData.endTime) : ""
  });
  return chrome.runtime.getURL(`blocked/blocked.html?${params.toString()}`);
}

function showBlockedPage(tabId, reason, targetUrl = "") {
  const safeTabId = toChromeId(tabId);
  if (safeTabId == null) return;
  blockedTabIds.set(safeTabId, Date.now());
  cleanupBlockedTabs();
  safeTabsUpdate(safeTabId, { url: getBlockedPageUrl(reason, targetUrl), active: false });
  setTimeout(() => enforceLock(false), 180);
}

function recordViolationStats(reason, targetUrl = "") {
  const now = Date.now();
  const host = getHost(targetUrl);
  const website = getWebsiteLabel(targetUrl || sessionData.lockedUrl || "");
  const today = ensureDaily();
  const attemptType = getAttemptType(reason);
  const elapsedSeconds = computeFocusSeconds(sessionData, now);
  const intervalKey = getIntervalKey(elapsedSeconds);
  const attemptRecord = {
    id: randomId("attempt"),
    timestamp: new Date(now).toISOString(),
    timestampMs: now,
    type: attemptType,
    reason,
    website,
    sessionId: sessionData.sessionId || "",
    elapsedSeconds,
    intervalKey
  };

  focusStats.blockedDistractions += 1;
  focusStats.reasonCounts[reason] = (focusStats.reasonCounts[reason] || 0) + 1;
  focusStats.attemptLog = [attemptRecord, ...(focusStats.attemptLog || [])].slice(0, 500);
  focusStats.intervalHeatmap[intervalKey] = (focusStats.intervalHeatmap[intervalKey] || 0) + 1;
  today.blockedDistractions += 1;
  today.reasonCounts[reason] = (today.reasonCounts[reason] || 0) + 1;
  today.attemptTypes[attemptType] = (today.attemptTypes[attemptType] || 0) + 1;
  today.intervalHeatmap[intervalKey] = (today.intervalHeatmap[intervalKey] || 0) + 1;

  sessionData.distractionAttempts = [attemptRecord, ...(sessionData.distractionAttempts || [])].slice(0, 250);
  if (!sessionData.distractionIntervals[intervalKey]) {
    const [startMinute, endMinute] = intervalKey.split("-").map(Number);
    sessionData.distractionIntervals[intervalKey] = {
      intervalKey,
      intervalIndex: Math.floor(startMinute / 5),
      startMinute,
      endMinute,
      count: 0,
      types: {},
      websites: {},
      attempts: []
    };
  }

  const interval = sessionData.distractionIntervals[intervalKey];
  interval.count += 1;
  interval.types[attemptType] = (interval.types[attemptType] || 0) + 1;
  interval.websites[website] = (interval.websites[website] || 0) + 1;
  interval.attempts = [attemptRecord, ...(interval.attempts || [])].slice(0, 30);

  if (host) {
    focusStats.distractingSites[host] = (focusStats.distractingSites[host] || 0) + 1;
    today.distractingSites[host] = (today.distractingSites[host] || 0) + 1;
    sessionData.sessionDistractions[host] = (sessionData.sessionDistractions[host] || 0) + 1;
  }

  sessionData.distractionPeaks = Object.values(sessionData.distractionIntervals)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => ({
      intervalKey: item.intervalKey,
      startMinute: item.startMinute,
      endMinute: item.endMinute,
      count: item.count
    }));

  sessionData.focusScore = computeSessionFocusScore(sessionData);
  today.focusScoreTotal += sessionData.focusScore;
  today.focusScoreSamples += 1;

  saveStats();
}

function registerViolation(reason, offendingTabId = null, offendingUrl = "") {
  if (!sessionData.active || sessionData.onBreak) return;
  if (isPopupInteractionActive() && (reason === "window-switch" || reason === "tab-switch")) return;

  const now = Date.now();
  sessionData.violations += 1;
  sessionData.lastViolationAt = now;

  if (reason === "window-switch" || reason === "tab-switch") {
    sessionData.recentSwitches = (sessionData.recentSwitches || []).filter((timestamp) => now - timestamp < 30000);
    sessionData.recentSwitches.push(now);
    if (sessionData.recentSwitches.length >= 4) {
      reason = "switch-burst";
      sessionData.recentSwitches = [];
    }
  }

  recordViolationStats(reason, offendingUrl);
  saveSession();

  if (offendingTabId != null && offendingTabId !== sessionData.lockedTabId) {
    notifyTab(offendingTabId, {
      type: "SHOW_IMMEDIATE_WARNING",
      reason,
      violations: sessionData.violations
    });
  }

  notifyTab(sessionData.lockedTabId, {
    type: "VIOLATION_DETECTED",
    reason,
    violations: sessionData.violations
  });

  notifyBrowser(REASON_COPY[reason] || "Distraction blocked. Return to focus.");
  enforceLock(true);
}

function recordSessionStats(session, reason, focusSeconds) {
  if (!session?.sessionId || !session.startTime || focusSeconds <= 0) return;

  const dateKey = getDateKey(session.startTime);
  const today = ensureDaily(dateKey);
  const completed = reason === "completed";
  const focusScore = computeSessionFocusScore(session);
  const distractionAttempts = session.distractionAttempts || [];
  const distractionIntervals = Object.values(session.distractionIntervals || {}).sort((a, b) => a.intervalIndex - b.intervalIndex);
  const aiChats = getSessionAiChats(session);
  const aiSummary = session.aiSummary || (aiChats.length ? buildLocalAiSummary(session, focusSeconds) : null);
  const aiTopics = aiSummary?.topicsCovered?.length ? aiSummary.topicsCovered : extractTopicsFromChats(aiChats);
  const historyRecord = {
    id: session.sessionId,
    dateKey,
    startedAt: session.startTime,
    endedAt: Date.now(),
    durationSeconds: session.durationSeconds || focusSeconds,
    focusSeconds,
    violations: session.violations || 0,
    completed,
    reason,
    goal: session.focusGoal || DEFAULT_SETTINGS.focusGoal,
    lockedTitle: session.lockedTitle || "Study session",
    lockedUrl: session.lockedUrl || "",
    platform: session.platform || "desktop",
    distractionCounts: session.sessionDistractions || {},
    distractionAttempts,
    distractionIntervals,
    distractionPeaks: session.distractionPeaks || [],
    focusScore,
    stopWarningCount: session.stopWarningCount || 0,
    aiChats,
    aiChatCount: aiChats.length,
    aiTopics,
    aiSummary,
    notes: aiSummary?.markdown || ""
  };

  focusStats.totalFocusSeconds += focusSeconds;
  today.focusSeconds += focusSeconds;
  today.focusScoreTotal += focusScore;
  today.focusScoreSamples += 1;
  focusStats.lastFocusDate = dateKey;

  if (completed) {
    focusStats.sessionsCompleted += 1;
    today.sessionsCompleted += 1;
  }

  const existingIndex = focusStats.sessionHistory.findIndex((item) => item.id === historyRecord.id);
  if (existingIndex >= 0) {
    focusStats.sessionHistory[existingIndex] = historyRecord;
  } else {
    focusStats.sessionHistory.push(historyRecord);
  }

  focusStats.sessionHistory = focusStats.sessionHistory
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 80);

  computeStreak();
  saveStats();
}

function endSession(reason = "manual") {
  if (!sessionData.active) return;

  const lockedTabId = sessionData.lockedTabId;
  const completedSession = {
    ...sessionData,
    sessionDistractions: { ...sessionData.sessionDistractions },
    aiChats: getSessionAiChats(sessionData)
  };
  const focusSeconds = computeFocusSeconds(completedSession);
  if (completedSession.aiChats.length && !completedSession.aiSummary) {
    completedSession.aiSummary = buildLocalAiSummary(completedSession, focusSeconds);
    completedSession.aiTopics = completedSession.aiSummary.topicsCovered || [];
    completedSession.aiQuestionCount = completedSession.aiChats.length;
  }

  recordSessionStats(completedSession, reason, focusSeconds);
  generateAndStoreAiSummary(completedSession, reason, focusSeconds);
  clearMotivationAlarm();
  clearSessionEndAlarm();
  clearBreakEndAlarm();
  stopGuardLoop();
  sessionData = defaultSession();
  saveSession();

  notifyTab(lockedTabId, {
    type: reason === "completed" ? "SESSION_COMPLETED" : "SESSION_ENDED",
    session: completedSession,
    focusSeconds
  });

  notifyBrowser(
    reason === "completed"
      ? "Focus session completed."
      : "Focus session ended and saved to Synapse.",
    true
  );
}

function requestManualStop() {
  if (!sessionData.active) {
    return { success: true, stats: focusStats };
  }

  if ((sessionData.stopWarningCount || 0) < STOP_WARNING_MESSAGES.length) {
    const warningIndex = sessionData.stopWarningCount;
    sessionData.stopWarningCount += 1;
    sessionData.violations += 1;
    sessionData.lastViolationAt = Date.now();
    recordViolationStats("manual-stop", sessionData.lockedUrl);
    saveSession();
    notifyTab(sessionData.lockedTabId, {
      type: "STOP_WARNING",
      warningCount: sessionData.stopWarningCount,
      warningsRequired: STOP_WARNING_MESSAGES.length,
      message: STOP_WARNING_MESSAGES[warningIndex],
      session: sessionData
    });
    return {
      success: false,
      warningOnly: true,
      warningCount: sessionData.stopWarningCount,
      warningsRequired: STOP_WARNING_MESSAGES.length,
      message: STOP_WARNING_MESSAGES[warningIndex],
      session: sessionData
    };
  }

  endSession("manual");
  return { success: true, stats: focusStats };
}

function startBreak() {
  if (!sessionData.active || sessionData.onBreak) {
    return { success: false, error: "Break is not available right now." };
  }

  if (!sessionData.breaksAllowed || sessionData.breaksUsed >= sessionData.breaksAllowed) {
    return { success: false, error: "No break slots left in this session." };
  }

  const now = Date.now();
  sessionData.onBreak = true;
  sessionData.breaksUsed += 1;
  sessionData.breakStartedAt = now;
  sessionData.breakEndTime = now + 6 * 60 * 1000;
  sessionData.pausedElapsedSeconds = computeFocusSeconds(sessionData, now);
  saveSession();
  clearMotivationAlarm();
  clearSessionEndAlarm();
  scheduleBreakEndAlarm();
  stopGuardLoop();
  notifyTab(sessionData.lockedTabId, {
    type: "BREAK_STARTED",
    session: sessionData
  });

  return { success: true, session: sessionData };
}

function finishBreak() {
  if (!sessionData.active || !sessionData.onBreak || !sessionData.breakStartedAt) return;

  const now = Date.now();
  const breakDurationMs = now - sessionData.breakStartedAt;
  sessionData.startTime += breakDurationMs;
  if (sessionData.endTime) sessionData.endTime += breakDurationMs;
  sessionData.onBreak = false;
  sessionData.breakStartedAt = null;
  sessionData.breakEndTime = null;
  sessionData.pausedElapsedSeconds = 0;
  saveSession();
  clearBreakEndAlarm();
  scheduleMotivationAlarm();
  scheduleSessionEndAlarm();
  startGuardLoop();
  enforceLock(true);
  syncLockedTab();
  notifyTab(sessionData.lockedTabId, {
    type: "BREAK_ENDED",
    session: sessionData
  });
}

function restoreLockedTab(reason = "tab-close") {
  if (!sessionData.active || !sessionData.lockedUrl || !isLockableUrl(sessionData.lockedUrl)) {
    resetSessionSilently();
    return;
  }

  registerViolation(reason, null, sessionData.lockedUrl);

  const createTab = (withWindow) => {
    const createProperties = {
      url: sessionData.lockedUrl,
      active: true
    };
    const lockedWindowId = toChromeId(sessionData.lockedWindowId);
    if (withWindow && lockedWindowId != null) {
      createProperties.windowId = lockedWindowId;
    }

    chrome.tabs.create(createProperties, (tab) => {
      if (chrome.runtime.lastError || !tab?.id) {
        if (withWindow) {
          createTab(false);
          return;
        }
        resetSessionSilently();
        return;
      }

      sessionData.lockedTabId = tab.id;
      sessionData.lockedWindowId = tab.windowId;
      saveSession();
      scheduleMotivationAlarm();
      scheduleSessionEndAlarm();
      startGuardLoop();
      enforceLock(true);
      setTimeout(syncLockedTab, 900);
    });
  };

  createTab(true);
}

function restoreSessionIfValid() {
  const lockedTabId = toChromeId(sessionData.lockedTabId);
  const lockedWindowId = toChromeId(sessionData.lockedWindowId);

  if (!sessionData.active || lockedTabId == null || lockedWindowId == null) {
    resetSessionSilently();
    return;
  }

  sessionData.lockedTabId = lockedTabId;
  sessionData.lockedWindowId = lockedWindowId;

  if (sessionData.endTime && Date.now() >= sessionData.endTime) {
    endSession("completed");
    return;
  }

  if (!safeTabsGet(lockedTabId, (tab) => {
    if (chrome.runtime.lastError || !tab || toChromeId(tab.windowId) !== lockedWindowId) {
      restoreLockedTab("restore");
      return;
    }

    scheduleMotivationAlarm();
    scheduleSessionEndAlarm();
    scheduleBreakEndAlarm();
    startGuardLoop();
    enforceLock(false);
    syncLockedTab();
  })) {
    restoreLockedTab("restore");
  }
}

function buildSyncPayload() {
  return {
    source: "synapse-focus-extension",
    version: 2,
    exportedAt: Date.now(),
    activeSession: sessionData.active ? sessionData : null,
    settings: {
      focusGoal: focusSettings.focusGoal,
      sameOriginLock: focusSettings.sameOriginLock,
      fullscreenProtection: focusSettings.fullscreenProtection
    },
    stats: focusStats
  };
}

function broadcastDashboardSync() {
  const payload = buildSyncPayload();
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) return;
    tabs.forEach((tab) => {
      if (tab.id != null) {
        notifyTab(tab.id, { type: "DASHBOARD_SYNC_PUSH", payload });
      }
    });
  });
}

function scheduleDashboardSync() {
  broadcastDashboardSync();
  chrome.alarms.create(SYNC_REMINDER_ALARM, { delayInMinutes: 2 });
}

function handleDashboardConnected(message) {
  dashboardBridge = {
    uid: message.uid || "",
    origin: message.origin || "",
    url: message.url || "",
    connectedAt: Date.now(),
    lastAckAt: dashboardBridge?.lastAckAt || null
  };
  if (message.idToken && message.firebaseProjectId) {
    dashboardAuth = {
      idToken: message.idToken,
      firebaseProjectId: message.firebaseProjectId,
      firebaseApiKey: message.firebaseApiKey || "",
      firestoreBaseUrl: message.firestoreBaseUrl || "https://firestore.googleapis.com/v1",
      receivedAt: Date.now()
    };
  }
  saveDashboardBridge();
  return { success: true, payload: buildSyncPayload() };
}

chrome.storage.local.get(
  [STORAGE_KEYS.session, STORAGE_KEYS.legacySession, STORAGE_KEYS.stats, STORAGE_KEYS.settings, STORAGE_KEYS.dashboardBridge],
  (result) => {
    sessionData = { ...defaultSession(), ...(result[STORAGE_KEYS.session] || result[STORAGE_KEYS.legacySession] || {}) };
    focusStats = { ...defaultStats(), ...(result[STORAGE_KEYS.stats] || {}) };
    focusSettings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] || {}) };
    dashboardBridge = result[STORAGE_KEYS.dashboardBridge] || null;
    updateActionState();

    if (sessionData.active) {
      restoreSessionIfValid();
    }
  }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) return true;

  if (message.type === "START_SESSION") {
    const { tabId, windowId, emergencyCode, title, url, durationSeconds, focusGoal, platform } = message;

    if (!isLockableUrl(url)) {
      sendResponse({ success: false, error: "Open a regular website or study page before starting Focus Lock." });
      return true;
    }

    const parsedDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0
      ? Math.round(durationSeconds)
      : null;
    const startTime = Date.now();
    const goal = focusGoal || focusSettings.focusGoal || DEFAULT_SETTINGS.focusGoal;

    focusSettings.focusGoal = goal;
    if (parsedDurationSeconds) focusSettings.defaultDurationSeconds = parsedDurationSeconds;
    saveSettings();

    sessionData = {
      ...defaultSession(),
      active: true,
      sessionId: randomId("session"),
      lockedTabId: tabId,
      lockedWindowId: windowId,
      lockedOrigin: getOrigin(url),
      emergencyCode: emergencyCode || "__none__",
      startTime,
      durationSeconds: parsedDurationSeconds,
      endTime: parsedDurationSeconds ? startTime + parsedDurationSeconds * 1000 : null,
      breaksAllowed: getAllowedBreaks(parsedDurationSeconds),
      lockedTitle: title || "Study session",
      lockedUrl: url || "",
      focusGoal: goal,
      platform: platform || "desktop"
    };

    focusStats.sessionsStarted += 1;
    ensureDaily(getDateKey(startTime)).sessionsStarted += 1;
    saveStats();
    saveSession();
    scheduleMotivationAlarm();
    scheduleSessionEndAlarm();
    startGuardLoop();
    enforceLock(true);
    notifyTab(sessionData.lockedTabId, { type: "SESSION_STARTED", session: sessionData });
    syncLockedTab();
    sendResponse({ success: true, session: sessionData, stats: focusStats });
    return true;
  }

  if (message.type === "END_SESSION") {
    sendResponse(requestManualStop());
    return true;
  }

  if (message.type === "UNLOCK_WITH_CODE") {
    if (message.code === sessionData.emergencyCode) {
      endSession("manual");
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Wrong code." });
    }
    return true;
  }

  if (message.type === "GET_SESSION") {
    sendResponse({ session: sessionData, stats: focusStats, settings: focusSettings });
    return true;
  }

  if (message.type === "GET_STATS") {
    sendResponse({ stats: focusStats, settings: focusSettings });
    return true;
  }

  if (message.type === "UPDATE_SETTINGS") {
    focusSettings = { ...focusSettings, ...(message.settings || {}) };
    saveSettings();
    sendResponse({ success: true, settings: focusSettings });
    return true;
  }

  if (message.type === "GET_AI_STATUS") {
    sendResponse({
      success: true,
      ...publicAiStatus()
    });
    return true;
  }

  if (message.type === "UPDATE_AI_SETTINGS") {
    const nextSettings = message.settings || {};
    focusSettings = {
      ...focusSettings,
      aiCompanionEnabled: nextSettings.aiCompanionEnabled === undefined
        ? Boolean(focusSettings.aiCompanionEnabled)
        : Boolean(nextSettings.aiCompanionEnabled),
      aiButtonPosition: nextSettings.aiButtonPosition === undefined
        ? focusSettings.aiButtonPosition || null
        : nextSettings.aiButtonPosition
    };

    saveSettings();
    broadcastDashboardSync();
    sendResponse({
      success: true,
      settings: focusSettings,
      aiStatus: publicAiStatus()
    });
    return true;
  }

  if (message.type === "SAVE_AI_WIDGET_POSITION") {
    const position = message.position || {};
    const x = Number(position.x);
    const y = Number(position.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      focusSettings.aiButtonPosition = { x, y };
      saveSettings();
    }
    sendResponse({ success: true, aiStatus: publicAiStatus() });
    return true;
  }

  if (message.type === "SYNAPSE_AI_CHAT") {
    handleAiChatRequest(message, sender)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({ success: false, error: error?.message || "SYNAPSE AI could not answer right now." });
      });
    return true;
  }

  if (message.type === "START_BREAK") {
    sendResponse(startBreak());
    return true;
  }

  if (message.type === "RETURN_TO_FOCUS") {
    enforceLock(true);
    sendResponse({ success: true, session: sessionData });
    return true;
  }

  if (message.type === "POPUP_OPENED") {
    popupInteractionUntil = Date.now() + 2500;
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "POPUP_CLOSED") {
    popupInteractionUntil = 0;
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "TAB_VIOLATION") {
    registerViolation(message.reason || "tab-switch", sender.tab?.id ?? null, sender.tab?.url || message.url || "");
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "DASHBOARD_CONNECTED") {
    sendResponse(handleDashboardConnected(message));
    return true;
  }

  if (message.type === "DASHBOARD_SYNC_ACK") {
    focusStats.lastSyncedAt = message.syncedAt || Date.now();
    if (dashboardBridge) dashboardBridge.lastAckAt = focusStats.lastSyncedAt;
    saveStats({ broadcast: false });
    saveDashboardBridge();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === "GET_DASHBOARD_SYNC_PAYLOAD") {
    sendResponse({ success: true, payload: buildSyncPayload() });
    return true;
  }

  return true;
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (!sessionData.active || sessionData.onBreak || isPopupInteractionActive()) return;
  if (activeInfo.tabId === sessionData.lockedTabId) return;

  if (blockedTabIds.has(activeInfo.tabId)) {
    enforceLock(false);
    return;
  }

  safeTabsGet(activeInfo.tabId, (tab) => {
    registerViolation("tab-switch", activeInfo.tabId, tab?.url || "");
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!sessionData.active || sessionData.onBreak) return;

  registerViolation("new-tab", tab.id, tab.pendingUrl || tab.url || "");
  if (tab.id != null) {
    showBlockedPage(tab.id, "new-tab", tab.pendingUrl || tab.url || "");
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  blockedTabIds.delete(tabId);

  if (sessionData.active && tabId === sessionData.lockedTabId) {
    restoreLockedTab("tab-close");
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!sessionData.active) return;

  if (tabId !== sessionData.lockedTabId) {
    if (changeInfo.url && !isInternalUrl(changeInfo.url) && !blockedTabIds.has(tabId)) {
      registerViolation("blocked-site", tabId, changeInfo.url);
      showBlockedPage(tabId, "blocked-site", changeInfo.url);
    }
    return;
  }

  if (changeInfo.url) {
    if (shouldBlockLockedNavigation(changeInfo.url)) {
      registerViolation("blocked-site", tabId, changeInfo.url);
      if (sessionData.lockedUrl && sessionData.lockedUrl !== changeInfo.url) {
        safeTabsUpdate(tabId, { url: sessionData.lockedUrl });
      } else {
        showBlockedPage(tabId, "blocked-site", changeInfo.url);
      }
      return;
    }

    sessionData.lockedUrl = changeInfo.url;
    sessionData.lockedOrigin = getOrigin(changeInfo.url);
    saveSession();
  }

  if (changeInfo.title) {
    sessionData.lockedTitle = changeInfo.title;
    saveSession();
  }

  if (changeInfo.status === "complete") {
    notifyTab(tabId, { type: "SESSION_RESYNC", session: sessionData });
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (!sessionData.active || sessionData.onBreak || isPopupInteractionActive()) return;
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    registerViolation("window-switch");
    return;
  }
  if (toChromeId(windowId) === toChromeId(sessionData.lockedWindowId)) return;

  registerViolation("window-switch");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BREAK_END_ALARM) {
    finishBreak();
    return;
  }

  if (alarm.name === SESSION_END_ALARM) {
    if (sessionData.active && sessionData.endTime && Date.now() >= sessionData.endTime) {
      endSession("completed");
    }
    return;
  }

  if (alarm.name === SYNC_REMINDER_ALARM) {
    broadcastDashboardSync();
    return;
  }

  if (alarm.name !== MOTIVATION_ALARM || !sessionData.active || !sessionData.startTime) return;

  const totalMinutes = Math.floor((Date.now() - sessionData.startTime) / 60000);
  const milestoneCount = Math.floor(totalMinutes / 30);

  if (milestoneCount <= sessionData.milestoneCount) return;

  sessionData.milestoneCount = milestoneCount;
  saveSession();

  const message = MOTIVATION_MESSAGES[(milestoneCount - 1) % MOTIVATION_MESSAGES.length];
  notifyTab(sessionData.lockedTabId, {
    type: "MOTIVATION_MILESTONE",
    totalMinutes: milestoneCount * 30,
    milestoneCount,
    message
  });
  notifyBrowser(`${message} ${milestoneCount * 30} minutes completed.`, true);
});
