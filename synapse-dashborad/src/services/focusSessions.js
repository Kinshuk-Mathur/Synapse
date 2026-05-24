import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { COLLECTIONS, userScopedQuery } from "./firestore";
import { formatDateKey, parseDateKey } from "./todos";
import { getFirebaseDb } from "../lib/firebase";
import { updateMomentumProgress } from "./userStats";

const EMPTY_SUMMARY = {
  focusSecondsToday: 0,
  sessionsCompletedToday: 0,
  blockedDistractionsToday: 0,
  totalFocusSeconds: 0,
  sessionsCompleted: 0,
  currentStreak: 0,
  bestStreak: 0,
  productivityScore: 72,
  weeklyData: [],
  topDistractions: [],
  topAttemptTypes: [],
  intervalHeatmap: [],
  distractionPeaks: [],
  recentSessions: []
};

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function dateKeyFromSession(session) {
  if (session.dateKey) return session.dateKey;
  if (session.startedAt) return formatDateKey(new Date(session.startedAt));
  return formatDateKey();
}

function formatHost(host = "") {
  return host
    .replace(/^www\./, "")
    .split(".")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function computeStreak(dayMap) {
  let cursor = formatDateKey();
  let streak = 0;

  while ((dayMap[cursor]?.focusSeconds || 0) > 0) {
    streak += 1;
    cursor = formatDateKey(addDays(parseDateKey(cursor), -1));
  }

  return streak;
}

function computeBestStreak(dayMap) {
  const keys = Object.keys(dayMap).sort();
  let best = 0;
  let current = 0;
  let previousKey = "";

  keys.forEach((dateKey) => {
    if ((dayMap[dateKey]?.focusSeconds || 0) <= 0) {
      current = 0;
      previousKey = dateKey;
      return;
    }

    const expectedPrevious = previousKey
      ? formatDateKey(addDays(parseDateKey(dateKey), -1))
      : "";
    current = previousKey && previousKey === expectedPrevious ? current + 1 : 1;
    best = Math.max(best, current);
    previousKey = dateKey;
  });

  return best;
}

export function buildFocusSummary(sessions = []) {
  if (!sessions.length) return EMPTY_SUMMARY;

  const todayKey = formatDateKey();
  const dayMap = {};
  const distractionMap = {};
  const attemptTypeMap = {};
  const intervalHeatmap = {};
  let focusScoreTotal = 0;
  let focusScoreSamples = 0;

  sessions.forEach((session) => {
    const dateKey = dateKeyFromSession(session);
    if (!dayMap[dateKey]) {
      dayMap[dateKey] = {
        dateKey,
        focusSeconds: 0,
        sessionsCompleted: 0,
        blockedDistractions: 0,
        focusScoreTotal: 0,
        focusScoreSamples: 0
      };
    }

    dayMap[dateKey].focusSeconds += Number(session.focusSeconds || 0);
    dayMap[dateKey].blockedDistractions += Number(session.violations || 0);
    if (session.completed) dayMap[dateKey].sessionsCompleted += 1;
    if (Number.isFinite(Number(session.focusScore))) {
      const score = Number(session.focusScore);
      focusScoreTotal += score;
      focusScoreSamples += 1;
      dayMap[dateKey].focusScoreTotal += score;
      dayMap[dateKey].focusScoreSamples += 1;
    }

    Object.entries(session.distractionCounts || {}).forEach(([host, count]) => {
      distractionMap[host] = (distractionMap[host] || 0) + Number(count || 0);
    });

    (session.distractionAttempts || []).forEach((attempt) => {
      const type = attempt.type || "restriction_bypass_attempt";
      attemptTypeMap[type] = (attemptTypeMap[type] || 0) + 1;
    });

    (session.distractionIntervals || []).forEach((interval) => {
      if (!interval?.intervalKey) return;
      if (!intervalHeatmap[interval.intervalKey]) {
        intervalHeatmap[interval.intervalKey] = {
          intervalKey: interval.intervalKey,
          startMinute: Number(interval.startMinute || 0),
          endMinute: Number(interval.endMinute || 0),
          count: 0
        };
      }
      intervalHeatmap[interval.intervalKey].count += Number(interval.count || 0);
    });
  });

  const today = dayMap[todayKey] || {};
  const totalFocusSeconds = sessions.reduce((total, session) => total + Number(session.focusSeconds || 0), 0);
  const sessionsCompleted = sessions.filter((session) => session.completed).length;
  const currentStreak = computeStreak(dayMap);
  const bestStreak = computeBestStreak(dayMap);

  const weeklyData = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(new Date(), index - 6);
    const dateKey = formatDateKey(date);
    return {
      day: date.toLocaleDateString(undefined, { weekday: "short" }),
      dateKey,
      hours: Number(((dayMap[dateKey]?.focusSeconds || 0) / 3600).toFixed(2))
    };
  });

  const topDistractions = Object.entries(distractionMap)
    .map(([host, count]) => ({
      host,
      name: formatHost(host) || "Other",
      count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const focusHoursToday = (today.focusSeconds || 0) / 3600;
  const productivityScore = focusScoreSamples > 0
    ? Math.round(focusScoreTotal / focusScoreSamples)
    : Math.max(
        42,
        Math.min(
          99,
          Math.round(66 + Math.min(24, focusHoursToday * 8) + (today.sessionsCompleted || 0) * 4 - (today.blockedDistractions || 0) * 1.2)
        )
      );

  const intervalHeatmapList = Object.values(intervalHeatmap)
    .sort((a, b) => a.startMinute - b.startMinute);
  const distractionPeaks = [...intervalHeatmapList]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topAttemptTypes = Object.entries(attemptTypeMap)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    focusSecondsToday: today.focusSeconds || 0,
    sessionsCompletedToday: today.sessionsCompleted || 0,
    blockedDistractionsToday: today.blockedDistractions || 0,
    totalFocusSeconds,
    sessionsCompleted,
    currentStreak,
    bestStreak,
    productivityScore,
    weeklyData,
    topDistractions,
    topAttemptTypes,
    intervalHeatmap: intervalHeatmapList,
    distractionPeaks,
    recentSessions: [...sessions].sort((a, b) => Number(b.startedAt || 0) - Number(a.startedAt || 0)).slice(0, 8)
  };
}

export function listenToFocusSessions(uid, onNext, onError) {
  if (!uid) return () => {};

  try {
    return onSnapshot(
      userScopedQuery("focusSessions", uid),
      (snapshot) => {
        const sessions = snapshot.docs.map((sessionDoc) => ({
          id: sessionDoc.id,
          ...sessionDoc.data()
        }));
        onNext(buildFocusSummary(sessions));
      },
      onError
    );
  } catch (error) {
    if (onError) onError(error);
    return () => {};
  }
}

function normalizeSessionRecord(uid, record) {
  const id = record.id || `${record.startedAt || Date.now()}`;

  return {
    uid,
    id,
    dateKey: record.dateKey || dateKeyFromSession(record),
    startedAt: Number(record.startedAt || Date.now()),
    endedAt: Number(record.endedAt || Date.now()),
    durationSeconds: Number(record.durationSeconds || 0),
    focusSeconds: Number(record.focusSeconds || 0),
    violations: Number(record.violations || 0),
    completed: Boolean(record.completed),
    reason: record.reason || "manual",
    goal: record.goal || "Deep study session",
    lockedTitle: record.lockedTitle || "Study session",
    lockedUrl: record.lockedUrl || "",
    platform: record.platform || "desktop",
    distractionCounts: record.distractionCounts || {},
    distractionAttempts: record.distractionAttempts || [],
    distractionIntervals: record.distractionIntervals || [],
    distractionPeaks: record.distractionPeaks || [],
    focusScore: Number(record.focusScore || 100),
    stopWarningCount: Number(record.stopWarningCount || 0),
    source: "focus-lock-extension",
    updatedAt: serverTimestamp()
  };
}

function normalizeActiveSession(uid, activeSession) {
  const now = Date.now();
  const elapsedSeconds = activeSession.onBreak
    ? Number(activeSession.pausedElapsedSeconds || 0)
    : Math.max(0, Math.floor((now - Number(activeSession.startTime || now)) / 1000));
  const focusSeconds = activeSession.durationSeconds
    ? Math.min(elapsedSeconds, Number(activeSession.durationSeconds))
    : elapsedSeconds;

  return normalizeSessionRecord(uid, {
    id: activeSession.sessionId,
    dateKey: activeSession.startTime ? formatDateKey(new Date(activeSession.startTime)) : formatDateKey(),
    startedAt: activeSession.startTime || now,
    endedAt: now,
    durationSeconds: activeSession.durationSeconds || focusSeconds,
    focusSeconds,
    violations: activeSession.violations || 0,
    completed: false,
    reason: "active",
    goal: activeSession.focusGoal || "Deep study session",
    lockedTitle: activeSession.lockedTitle || "Study session",
    lockedUrl: activeSession.lockedUrl || "",
    platform: activeSession.platform || "desktop",
    distractionCounts: activeSession.sessionDistractions || {},
    distractionAttempts: activeSession.distractionAttempts || [],
    distractionIntervals: Object.values(activeSession.distractionIntervals || {}),
    distractionPeaks: activeSession.distractionPeaks || [],
    focusScore: activeSession.focusScore ?? 100,
    stopWarningCount: activeSession.stopWarningCount || 0
  });
}

async function commitInChunks(db, operations) {
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

export async function recordExtensionFocusPayload(uid, payload) {
  if (!uid || !payload?.stats) return;

  const db = getFirebaseDb();
  const stats = payload.stats;
  const history = Array.isArray(stats.sessionHistory) ? stats.sessionHistory : [];
  const dailyEntries = Object.values(stats.daily || {});
  const operations = [];

  if (payload.activeSession?.sessionId) {
    const activeSession = normalizeActiveSession(uid, payload.activeSession);
    operations.push((batch) => {
      batch.set(doc(db, COLLECTIONS.focusSessions, `${uid}_${activeSession.id}`), activeSession, { merge: true });
    });
  }

  history.forEach((record) => {
    const normalized = normalizeSessionRecord(uid, record);
    operations.push((batch) => {
      batch.set(doc(db, COLLECTIONS.focusSessions, `${uid}_${normalized.id}`), normalized, { merge: true });
    });
  });

  dailyEntries.forEach((day) => {
    if (!day?.dateKey) return;
    operations.push((batch) => {
      batch.set(
        doc(db, COLLECTIONS.analytics, `${uid}_focus_${day.dateKey}`),
        {
          uid,
          type: "focusDay",
          selectedDate: day.dateKey,
          focusSeconds: Number(day.focusSeconds || 0),
          sessionsCompleted: Number(day.sessionsCompleted || 0),
          sessionsStarted: Number(day.sessionsStarted || 0),
          blockedDistractions: Number(day.blockedDistractions || 0),
          reasonCounts: day.reasonCounts || {},
          distractingSites: day.distractingSites || {},
          attemptTypes: day.attemptTypes || {},
          intervalHeatmap: day.intervalHeatmap || {},
          averageFocusScore: day.focusScoreSamples
            ? Math.round(Number(day.focusScoreTotal || 0) / Number(day.focusScoreSamples || 1))
            : null,
          source: "focus-lock-extension",
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
  });

  if (stats.lastSyncedAt) {
    operations.push((batch) => {
      batch.set(
        doc(db, COLLECTIONS.analytics, `${uid}_focus_sync`),
        {
          uid,
          type: "focusSync",
          selectedDate: formatDateKey(),
          lastSyncedAt: stats.lastSyncedAt,
          totalFocusSeconds: Number(stats.totalFocusSeconds || 0),
          sessionsCompleted: Number(stats.sessionsCompleted || 0),
          blockedDistractions: Number(stats.blockedDistractions || 0),
          currentStreak: Number(stats.currentStreak || 0),
          bestStreak: Number(stats.bestStreak || 0),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
  }

  await commitInChunks(db, operations);

  await setDoc(
    doc(db, COLLECTIONS.users, uid),
    {
      focusLockConnected: true,
      focusLockLastSyncAt: serverTimestamp()
    },
    { merge: true }
  );

  const todayKey = formatDateKey();
  const completedFocusSecondsToday = history
    .filter((record) => record.completed && dateKeyFromSession(record) === todayKey)
    .reduce((total, record) => total + Number(record.focusSeconds || 0), 0);
  const todayFocusSummary = dailyEntries.find((day) => day?.dateKey === todayKey);
  const syncedCompletedFocusSecondsToday =
    Number(todayFocusSummary?.sessionsCompleted || 0) > 0
      ? Number(todayFocusSummary?.focusSeconds || 0)
      : 0;
  const focusMinutes = Math.floor(
    Math.max(completedFocusSecondsToday, syncedCompletedFocusSecondsToday) / 60
  );

  if (focusMinutes >= 15) {
    await updateMomentumProgress(uid, {
      pillar: "focus",
      focusMinutes,
      dateKey: todayKey
    });
  }
}

export { EMPTY_SUMMARY as emptyFocusSummary };
