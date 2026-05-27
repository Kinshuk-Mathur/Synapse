const idleState = document.getElementById("idle-state");
const activeState = document.getElementById("active-state");
const statusPill = document.getElementById("status-pill");
const heroSubtitle = document.getElementById("hero-subtitle");
const timerEl = document.getElementById("timer");
const timerLabel = document.getElementById("timer-label");
const progressValue = document.getElementById("progress-value");
const activeGoalChip = document.getElementById("active-goal-chip");
const focusGoalInput = document.getElementById("focus-goal");
const durationInput = document.getElementById("duration-time");
const startBtn = document.getElementById("start-btn");
const dashboardBtn = document.getElementById("dashboard-btn");
const sessionSite = document.getElementById("session-site");
const violationCount = document.getElementById("violation-count");
const focusScore = document.getElementById("focus-score");
const milestoneCount = document.getElementById("milestone-count");
const breaksLeftEl = document.getElementById("breaks-left");
const breakStatusEl = document.getElementById("break-status");
const stopWarningEl = document.getElementById("stop-warning");
const peakIntervalEl = document.getElementById("peak-interval");
const breakBtn = document.getElementById("break-btn");
const unlockBtn = document.getElementById("unlock-btn");
const syncLine = document.getElementById("sync-line");

const RING_SIZE = 301.59;
const DEFAULT_DASHBOARD_URL = "https://synapse24.netlify.app";
let timerInterval = null;
let currentSession = null;
let currentStats = null;
let currentSettings = null;
let settingsSaveTimer = null;

function ignoreRuntimeError() {
  void chrome.runtime.lastError;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(tabs || []);
    });
  });
}

function updateTab(tabId, updateProperties) {
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

function focusWindow(windowId) {
  return new Promise((resolve) => {
    if (windowId == null) {
      resolve(false);
      return;
    }

    chrome.windows.update(windowId, { focused: true }, () => {
      resolve(!chrome.runtime.lastError);
    });
  });
}

function createTab(url) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url }, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab || null);
    });
  });
}

function isLikelySynapseDashboardTab(tab) {
  const url = tab.url || "";
  const title = tab.title || "";

  return url.includes("localhost:3000")
    || url.includes("127.0.0.1:3000")
    || url.includes("synapse24.netlify.app")
    || /^SYNAPSE\b/i.test(title);
}

async function focusExistingDashboardTab() {
  const tabs = await tabsQuery({});
  const dashboardTab = tabs.find(isLikelySynapseDashboardTab);
  if (!dashboardTab?.id) return false;

  await focusWindow(dashboardTab.windowId);
  await updateTab(dashboardTab.id, { active: true, url: DEFAULT_DASHBOARD_URL });
  return true;
}

async function canReachUrl(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 900);

  try {
    await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return true;
  } catch (_) {
    clearTimeout(timeoutId);
    return false;
  }
}

function getDateKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatHms(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function parseDurationInput(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":");
  if (parts.length !== 3) return null;

  const [hoursText, minutesText, secondsText] = parts;
  if (![hoursText, minutesText, secondsText].every((part) => /^\d+$/.test(part))) return null;

  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (minutes > 59 || seconds > 59) return null;

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  return totalSeconds > 0 ? totalSeconds : null;
}

function getRemainingSeconds(session) {
  if (!session?.endTime) return null;
  return Math.max(0, Math.ceil((session.endTime - Date.now()) / 1000));
}

function getElapsedSeconds(session) {
  if (!session?.startTime) return 0;
  if (session.onBreak) return Math.max(0, Math.floor(session.pausedElapsedSeconds || 0));
  return Math.max(0, Math.floor((Date.now() - session.startTime) / 1000));
}

function updateProgress(session) {
  if (!session?.durationSeconds) {
    progressValue.style.strokeDashoffset = String(RING_SIZE);
    return;
  }

  const elapsed = session.onBreak
    ? Math.max(0, session.pausedElapsedSeconds || 0)
    : Math.min(session.durationSeconds, getElapsedSeconds(session));
  const progress = Math.max(0, Math.min(1, elapsed / session.durationSeconds));
  progressValue.style.strokeDashoffset = String(RING_SIZE - RING_SIZE * progress);
}

function getPlatformLabel() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const lower = platform.toLowerCase();
  if (lower.includes("win")) return "Windows";
  if (lower.includes("mac")) return "macOS";
  if (lower.includes("linux")) return "Linux";
  return "desktop";
}

function updateTimer(session) {
  if (!session?.active) {
    const seconds = parseDurationInput(durationInput.value) || currentSettings?.defaultDurationSeconds || 7200;
    timerLabel.textContent = "Ready";
    timerEl.textContent = formatHms(seconds);
    progressValue.style.strokeDashoffset = String(RING_SIZE);
    return;
  }

  if (session.onBreak && session.breakEndTime) {
    timerLabel.textContent = "Break";
    timerEl.textContent = formatHms(Math.max(0, Math.ceil((session.breakEndTime - Date.now()) / 1000)));
  } else if (session.durationSeconds) {
    timerLabel.textContent = "Remaining";
    timerEl.textContent = formatHms(getRemainingSeconds(session));
  } else {
    timerLabel.textContent = "Elapsed";
    timerEl.textContent = formatHms(getElapsedSeconds(session));
  }

  updateProgress(session);
}

function updateStats(stats = currentStats) {
  currentStats = stats || currentStats;
  if (!currentStats) return;

  if (currentStats.lastSyncedAt) {
    syncLine.textContent = `Synced with Synapse ${new Date(currentStats.lastSyncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
  } else {
    syncLine.textContent = "Open the Synapse dashboard to sync analytics.";
  }
}

function updateSummary(session) {
  const breaksLeft = Math.max(0, (session.breaksAllowed || 0) - (session.breaksUsed || 0));
  const warningsUsed = Math.min(session.stopWarningCount || 0, 3);
  const topPeak = [...Object.values(session.distractionIntervals || {})].sort((a, b) => (b.count || 0) - (a.count || 0))[0];
  violationCount.textContent = String(session.violations || 0);
  focusScore.textContent = String(session.focusScore ?? 100);
  milestoneCount.textContent = String(session.milestoneCount || 0);
  breaksLeftEl.textContent = String(breaksLeft);
  sessionSite.textContent = session.lockedTitle || session.lockedUrl || "Current study page";
  activeGoalChip.textContent = session.focusGoal || "Deep study session";
  peakIntervalEl.textContent = topPeak?.count
    ? `${topPeak.startMinute}-${topPeak.endMinute} min - ${topPeak.count} attempts`
    : "Clean so far";

  if (session.onBreak && session.breakEndTime) {
    breakStatusEl.style.display = "block";
    breakStatusEl.textContent = `Break active. Focus resumes in ${formatHms(Math.max(0, Math.ceil((session.breakEndTime - Date.now()) / 1000)))}.`;
  } else {
    breakStatusEl.style.display = "none";
  }

  if (warningsUsed > 0 && warningsUsed < 3) {
    stopWarningEl.style.display = "block";
    stopWarningEl.textContent = `${warningsUsed}/3 stop checks used. One steady choice can save this session.`;
  } else if (warningsUsed >= 3) {
    stopWarningEl.style.display = "block";
    stopWarningEl.textContent = "Stop is now unlocked. Click once more if you truly need to end.";
  } else {
    stopWarningEl.style.display = "none";
  }
}

function showActiveUI(session) {
  currentSession = session;
  idleState.style.display = "none";
  activeState.style.display = "grid";
  statusPill.textContent = "Active";
  statusPill.classList.add("is-active");
  heroSubtitle.textContent = "FOCUSLOCK - powered by Synapse";
  dashboardBtn.disabled = true;
  updateSummary(session);
  updateTimer(session);

  const warningsUsed = Math.min(session.stopWarningCount || 0, 3);
  unlockBtn.disabled = false;
  unlockBtn.textContent = warningsUsed >= 3 ? "Stop Session" : `Stop Check ${warningsUsed}/3`;
  breakBtn.disabled = Boolean(session.onBreak || ((session.breaksAllowed || 0) - (session.breaksUsed || 0) <= 0));
  breakBtn.textContent = session.onBreak ? "Break Running" : "Take 6 Minute Break";

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!currentSession?.active) return;
    updateTimer(currentSession);
    updateSummary(currentSession);
  }, 1000);
}

function showIdleUI() {
  currentSession = null;
  idleState.style.display = "grid";
  activeState.style.display = "none";
  statusPill.textContent = "Idle";
  statusPill.classList.remove("is-active");
  heroSubtitle.textContent = "FOCUSLOCK - powered by Synapse";
  activeGoalChip.textContent = focusGoalInput.value || currentSettings?.focusGoal || "Deep study session";
  dashboardBtn.disabled = false;
  breakStatusEl.style.display = "none";
  stopWarningEl.style.display = "none";

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  updateTimer(null);
}

function applySession(session) {
  if (session?.active) {
    showActiveUI(session);
  } else {
    showIdleUI();
  }
}

function hydrateSettings(settings = {}) {
  currentSettings = settings;
  const goal = settings.focusGoal || "Deep study session";
  focusGoalInput.value = goal;
  activeGoalChip.textContent = goal;

  const duration = settings.defaultDurationSeconds || 7200;
  durationInput.value = formatHms(duration);
}

async function loadState() {
  const response = await sendMessage({ type: "GET_SESSION" });
  hydrateSettings(response?.settings || {});
  updateStats(response?.stats || null);
  applySession(response?.session || null);
}

function saveSettingsSoon() {
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    const parsedDuration = parseDurationInput(durationInput.value);
    sendMessage({
      type: "UPDATE_SETTINGS",
      settings: {
        focusGoal: focusGoalInput.value.trim() || "Deep study session",
        defaultDurationSeconds: parsedDuration || currentSettings?.defaultDurationSeconds || 7200
      }
    }).then((response) => {
      if (response?.settings) currentSettings = response.settings;
    });
  }, 300);
}

chrome.runtime.sendMessage({ type: "POPUP_OPENED" }, ignoreRuntimeError);

window.addEventListener("unload", () => {
  chrome.runtime.sendMessage({ type: "POPUP_CLOSED" }, ignoreRuntimeError);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.synapseFocusSession) {
    applySession(changes.synapseFocusSession.newValue || null);
  }

  if (changes.synapseFocusStats) {
    updateStats(changes.synapseFocusStats.newValue || null);
  }

  if (changes.synapseFocusSettings) {
    currentSettings = changes.synapseFocusSettings.newValue || currentSettings;
  }
});

durationInput.addEventListener("input", () => {
  updateTimer(null);
  saveSettingsSoon();
});

focusGoalInput.addEventListener("input", () => {
  activeGoalChip.textContent = focusGoalInput.value || "Deep study session";
  saveSettingsSoon();
});

startBtn.addEventListener("click", async () => {
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, resolve);
  });
  const tab = tabs?.[0];
  if (!tab?.id) return;

  const durationSeconds = parseDurationInput(durationInput.value);

  if (!durationSeconds) {
    syncLine.textContent = "Use HH:MM:SS, like 01:30:00.";
    return;
  }

  startBtn.disabled = true;
  const response = await sendMessage({
    type: "START_SESSION",
    tabId: tab.id,
    windowId: tab.windowId,
    emergencyCode: "__none__",
    title: tab.title,
    url: tab.url,
    durationSeconds,
    focusGoal: focusGoalInput.value.trim() || "Deep study session",
    platform: getPlatformLabel()
  });
  startBtn.disabled = false;

  if (!response?.success) {
    syncLine.textContent = response?.error || "Unable to start Focus Lock.";
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: "SESSION_STARTED", session: response.session }, ignoreRuntimeError);
  updateStats(response.stats);
  applySession(response.session);
  window.close();
});

unlockBtn.addEventListener("click", async () => {
  unlockBtn.disabled = true;
  const response = await sendMessage({ type: "END_SESSION" });
  unlockBtn.disabled = false;

  if (response?.warningOnly) {
    currentSession = response.session || currentSession;
    syncLine.textContent = response.message || "Take one breath before stopping.";
    applySession(currentSession);
    return;
  }

  if (!response?.success) {
    syncLine.textContent = response?.error || "This session cannot be stopped right now.";
    return;
  }

  updateStats(response.stats);
  showIdleUI();
  window.close();
});

breakBtn.addEventListener("click", async () => {
  const response = await sendMessage({ type: "START_BREAK" });
  if (!response?.success) {
    syncLine.textContent = response?.error || "Break is not available right now.";
    return;
  }
  applySession(response.session);
});

dashboardBtn.addEventListener("click", async () => {
  dashboardBtn.disabled = true;
  syncLine.textContent = "Opening Synapse dashboard...";

  const focusedExisting = await focusExistingDashboardTab();
  if (focusedExisting) {
    window.close();
    return;
  }

  await createTab(DEFAULT_DASHBOARD_URL);
  window.close();
});

loadState();
