import {
  doc,
  onSnapshot,
  runTransaction
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";
import { formatDateKey, parseDateKey } from "./todos";

export const emptyDailyProgress = {
  completedFocus: false,
  completedTask: false,
  completedGoalUpdate: false,
  completedAIUsage: false,
  momentumCompleted: false
};

export const emptyUserStats = {
  currentMomentum: 0,
  longestMomentum: 0,
  lastCompletedDate: "",
  totalFocusMinutes: 0,
  totalCompletedTasks: 0,
  totalGoalsUpdated: 0
};

const AI_PROMPT_LENGTH_THRESHOLD = 30;
const AI_INTERACTION_DURATION_THRESHOLD_MS = 10_000;
const PILLAR_FIELDS = {
  focus: "completedFocus",
  task: "completedTask",
  goal: "completedGoalUpdate",
  ai: "completedAIUsage"
};

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function clampNumber(value) {
  return Math.max(0, Number(value) || 0);
}

function normalizeStats(stats = {}) {
  return {
    currentMomentum: clampNumber(stats.currentMomentum),
    longestMomentum: clampNumber(stats.longestMomentum),
    lastCompletedDate: typeof stats.lastCompletedDate === "string" ? stats.lastCompletedDate : "",
    totalFocusMinutes: clampNumber(stats.totalFocusMinutes),
    totalCompletedTasks: clampNumber(stats.totalCompletedTasks),
    totalGoalsUpdated: clampNumber(stats.totalGoalsUpdated)
  };
}

function normalizeProgress(progress = {}) {
  return {
    ...emptyDailyProgress,
    completedFocus: Boolean(progress.completedFocus),
    completedTask: Boolean(progress.completedTask),
    completedGoalUpdate: Boolean(progress.completedGoalUpdate),
    completedAIUsage: Boolean(progress.completedAIUsage),
    momentumCompleted: Boolean(progress.momentumCompleted),
    dateKey: progress.dateKey || "",
    focusMinutes: clampNumber(progress.focusMinutes),
    aiPromptFingerprint: progress.aiPromptFingerprint || ""
  };
}

function getTodayKey() {
  return formatDateKey();
}

function getDailyProgressRef(db, uid, dateKey = getTodayKey()) {
  return doc(db, COLLECTIONS.users, uid, COLLECTIONS.dailyProgress, dateKey);
}

function getUserRef(db, uid) {
  return doc(db, COLLECTIONS.users, uid);
}

function resolvePillar(options = {}) {
  if (typeof options === "string") return options;
  if (options.pillar) return options.pillar;

  const source = options.source || "";
  if (source === "focusSession") return "focus";
  if (source === "taskCompletion") return "task";
  if (source === "goalUpdate" || source === "goalCompletion") return "goal";
  if (source === "aiUsage") return "ai";
  return "";
}

function normalizePrompt(prompt = "") {
  return String(prompt).trim().toLowerCase().replace(/\s+/g, " ");
}

function promptFingerprint(prompt = "") {
  const normalized = normalizePrompt(prompt);
  let hash = 0;

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }

  return normalized ? `${normalized.length}:${hash.toString(16)}` : "";
}

function looksLikeKeyboardSpam(prompt = "") {
  const normalized = normalizePrompt(prompt).replace(/\s+/g, "");
  if (!normalized) return true;
  if (/^(.)\1{5,}$/.test(normalized)) return true;
  if (/^(asdf|qwer|zxcv|hjkl|jkl;|1234|abcd)+$/i.test(normalized)) return true;

  const letters = normalized.replace(/[^a-z]/gi, "");
  if (letters.length >= 14) {
    const vowelCount = (letters.match(/[aeiou]/gi) || []).length;
    const repeatedRuns = (letters.match(/(.)\1{2,}/g) || []).join("").length;
    return vowelCount / letters.length < 0.16 || repeatedRuns / letters.length > 0.35;
  }

  return false;
}

export function isMeaningfulAiInteraction(options = {}) {
  const prompt = normalizePrompt(options.prompt || "");
  const durationMs = clampNumber(options.interactionDurationMs);
  const hasAttachment = Boolean(options.hasAttachment);

  if (hasAttachment) return true;
  if (!prompt) return false;
  if (["hi", "hey", "hello", "yo", "ok", "okay", "test", "hmm"].includes(prompt)) return false;
  if (looksLikeKeyboardSpam(prompt)) return false;

  const words = prompt.split(" ").filter(Boolean);
  const longEnoughPrompt = prompt.length >= AI_PROMPT_LENGTH_THRESHOLD && words.length >= 3;
  const deliberateInteraction = durationMs >= AI_INTERACTION_DURATION_THRESHOLD_MS && words.length >= 2;

  return longEnoughPrompt || deliberateInteraction;
}

export function getMomentumWeekDates(referenceDate = new Date()) {
  const today = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = addDays(today, -mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    return {
      date,
      dateKey: formatDateKey(date),
      label: date.toLocaleDateString("en-US", { weekday: "short" })
    };
  });
}

function buildWeeklyMomentum(progressByDate = {}, referenceDate = new Date()) {
  const todayKey = formatDateKey(referenceDate);

  return getMomentumWeekDates(referenceDate).map((day) => {
    const progress = normalizeProgress(progressByDate[day.dateKey]);
    const completed = Boolean(progress.momentumCompleted);
    const isCurrent = day.dateKey === todayKey;
    const isFuture = day.dateKey > todayKey;
    const isMissed = day.dateKey < todayKey && !completed;

    return {
      ...day,
      completed,
      isCurrent,
      isFuture,
      isMissed,
      state: completed ? "completed" : isCurrent ? "current" : isMissed ? "missed" : "future",
      progress
    };
  });
}

export function listenToUserStats(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();

  return onSnapshot(
    getUserRef(db, uid),
    (snapshot) => {
      const stats = snapshot.exists() ? snapshot.data()?.stats : null;
      onNext(normalizeStats(stats || {}));
    },
    onError
  );
}

export function listenToWeeklyMomentum(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();
  const progressByDate = {};
  const weekDates = getMomentumWeekDates();

  const unsubscribes = weekDates.map((day) =>
    onSnapshot(
      getDailyProgressRef(db, uid, day.dateKey),
      (snapshot) => {
        progressByDate[day.dateKey] = snapshot.exists() ? snapshot.data() : {};
        onNext(buildWeeklyMomentum(progressByDate));
      },
      onError
    )
  );

  return () => {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  };
}

export async function updateMomentumProgress(uid, options = {}) {
  if (!uid) return null;

  const pillar = resolvePillar(options);
  const pillarField = PILLAR_FIELDS[pillar];
  const todayKey = getTodayKey();

  if (!pillarField) return null;
  if (options.dateKey && options.dateKey !== todayKey) return null;

  if (pillar === "focus" && clampNumber(options.focusMinutes) < 15) {
    return null;
  }

  if (pillar === "ai" && !isMeaningfulAiInteraction(options)) {
    return { ignored: true, reason: "not_meaningful_ai_usage" };
  }

  const db = getFirebaseDb();
  const userRef = getUserRef(db, uid);
  const progressRef = getDailyProgressRef(db, uid, todayKey);
  const yesterdayKey = formatDateKey(addDays(parseDateKey(todayKey), -1));

  return runTransaction(db, async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const progressSnapshot = await transaction.get(progressRef);
    const previousStats = normalizeStats(userSnapshot.exists() ? userSnapshot.data()?.stats : {});
    const previousProgress = normalizeProgress(progressSnapshot.exists() ? progressSnapshot.data() : {});
    const nextProgress = {
      ...previousProgress,
      dateKey: todayKey,
      [pillarField]: true
    };
    const nextStats = { ...previousStats };
    let statsChanged = !userSnapshot.exists() || !userSnapshot.data()?.stats;

    if (pillar === "focus") {
      const focusMinutes = Math.floor(clampNumber(options.focusMinutes));
      const nextFocusMinutes = Math.max(previousProgress.focusMinutes || 0, focusMinutes);
      const focusMinuteDelta = Math.max(0, nextFocusMinutes - (previousProgress.focusMinutes || 0));
      nextProgress.focusMinutes = nextFocusMinutes;

      if (focusMinuteDelta > 0) {
        nextStats.totalFocusMinutes += focusMinuteDelta;
        statsChanged = true;
      }
    }

    if (pillar === "task" && !previousProgress.completedTask) {
      nextStats.totalCompletedTasks += 1;
      statsChanged = true;
    }

    if (pillar === "goal" && !previousProgress.completedGoalUpdate) {
      nextStats.totalGoalsUpdated += 1;
      statsChanged = true;
    }

    if (pillar === "ai") {
      const fingerprint = promptFingerprint(options.prompt || "");
      if (fingerprint && previousProgress.aiPromptFingerprint === fingerprint) {
        return {
          ignored: true,
          reason: "repeated_ai_prompt",
          dailyProgress: previousProgress,
          stats: previousStats
        };
      }
      nextProgress.aiPromptFingerprint = fingerprint || previousProgress.aiPromptFingerprint || "attachment";
    }

    const productiveDayComplete =
      nextProgress.completedFocus &&
      nextProgress.completedTask &&
      nextProgress.completedGoalUpdate &&
      nextProgress.completedAIUsage;

    if (productiveDayComplete && !previousProgress.momentumCompleted) {
      const previousMomentum = nextStats.currentMomentum || 0;
      const lastCompletedDate = nextStats.lastCompletedDate;
      const nextMomentum =
        lastCompletedDate === todayKey
          ? Math.max(previousMomentum, 1)
          : lastCompletedDate === yesterdayKey
            ? previousMomentum + 1
            : 1;

      nextProgress.momentumCompleted = true;
      nextStats.currentMomentum = nextMomentum;
      nextStats.longestMomentum = Math.max(nextStats.longestMomentum || 0, nextMomentum);
      nextStats.lastCompletedDate = todayKey;
      statsChanged = true;
    }

    const dailyProgressPayload = {
      completedFocus: Boolean(nextProgress.completedFocus),
      completedTask: Boolean(nextProgress.completedTask),
      completedGoalUpdate: Boolean(nextProgress.completedGoalUpdate),
      completedAIUsage: Boolean(nextProgress.completedAIUsage),
      momentumCompleted: Boolean(nextProgress.momentumCompleted),
      dateKey: todayKey,
      focusMinutes: nextProgress.focusMinutes || 0,
      aiPromptFingerprint: nextProgress.aiPromptFingerprint || ""
    };

    transaction.set(progressRef, dailyProgressPayload, { merge: true });

    if (statsChanged) {
      transaction.set(
        userRef,
        {
          stats: nextStats
        },
        { merge: true }
      );
    }

    return {
      dailyProgress: dailyProgressPayload,
      stats: nextStats,
      momentumCompleted: dailyProgressPayload.momentumCompleted
    };
  });
}

export async function recordUserActivity(uid, source = "app", metadata = {}) {
  const pillar = resolvePillar({ source });

  if (!pillar) {
    return null;
  }

  return updateMomentumProgress(uid, {
    ...metadata,
    pillar
  });
}
