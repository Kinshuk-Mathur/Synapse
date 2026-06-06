import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";

export const SYNAPSE_FREE_PLAN_LIMITS = {
  aiInteractions: 25,
  pdfUploads: 3,
  voiceSessions: 10
};

export const SYNAPSE_USAGE_WINDOW_SLOTS = ["00", "06", "12", "18"];

const usageKeys = ["aiInteractions", "pdfUploads", "voiceSessions"];

function toUsageIncrement(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function toUsageCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCurrentUsageWindow(date = new Date()) {
  const windowHour = Math.floor(date.getHours() / 6) * 6;
  const windowSlot = String(windowHour).padStart(2, "0");
  const windowStart = new Date(date);

  windowStart.setHours(windowHour, 0, 0, 0);

  return {
    dateKey: formatDateKey(windowStart),
    windowSlot,
    windowStart
  };
}

export function getCurrentWindowId(uid, date = new Date()) {
  if (!uid) return "";

  const { dateKey, windowSlot } = getCurrentUsageWindow(date);
  return `${uid}_${dateKey}_${windowSlot}`;
}

export function getMinutesUntilNextUsageReset(date = new Date()) {
  const nextReset = new Date(date);
  const nextResetHour = Math.floor(date.getHours() / 6) * 6 + 6;

  nextReset.setHours(nextResetHour, 0, 0, 0);

  return Math.max(0, Math.ceil((nextReset.getTime() - date.getTime()) / 60000));
}

function getUsageDocRef(uid, windowId = getCurrentWindowId(uid)) {
  return doc(getFirebaseDb(), COLLECTIONS.users, uid, "usage", windowId);
}

function normalizeUsageSnapshot(data = {}, uid = "", windowId = getCurrentWindowId(uid), date = new Date()) {
  const { windowSlot, windowStart } = getCurrentUsageWindow(date);

  return {
    uid,
    windowId,
    windowStart: data.windowStart || Timestamp.fromDate(windowStart),
    windowSlot: data.windowSlot || windowSlot,
    aiInteractions: toUsageCount(data.aiInteractions),
    pdfUploads: toUsageCount(data.pdfUploads),
    voiceSessions: toUsageCount(data.voiceSessions)
  };
}

function createUsageLimitError(kind, minutesUntilReset = getMinutesUntilNextUsageReset()) {
  const messages = {
    aiInteractions: `AI limit reached for this session. Resets in ${minutesUntilReset} minutes.`,
    pdfUploads: `PDF upload limit reached. Resets in ${minutesUntilReset} minutes.`,
    voiceSessions: `Voice session limit reached. Resets in ${minutesUntilReset} minutes.`
  };

  const error = new Error(messages[kind] || messages.aiInteractions);
  error.code = `synapse/${kind}-limit-reached`;
  error.limitKind = kind;
  error.minutesUntilReset = minutesUntilReset;
  return error;
}

export async function consumeSynapseUsage(uid, increments = {}) {
  const nextIncrements = {
    aiInteractions: toUsageIncrement(increments.aiInteractions),
    pdfUploads: toUsageIncrement(increments.pdfUploads),
    voiceSessions: toUsageIncrement(increments.voiceSessions)
  };
  const hasIncrement = usageKeys.some((key) => nextIncrements[key] > 0);

  if (!uid || !hasIncrement) {
    return null;
  }

  const now = new Date();
  const windowId = getCurrentWindowId(uid, now);
  const usageRef = getUsageDocRef(uid, windowId);
  const { windowSlot, windowStart } = getCurrentUsageWindow(now);
  const minutesUntilReset = getMinutesUntilNextUsageReset(now);

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const snapshot = await transaction.get(usageRef);
    const currentUsage = normalizeUsageSnapshot(
      snapshot.exists() ? snapshot.data() : {},
      uid,
      windowId,
      now
    );
    const nextUsage = {
      ...currentUsage,
      aiInteractions: currentUsage.aiInteractions + nextIncrements.aiInteractions,
      pdfUploads: currentUsage.pdfUploads + nextIncrements.pdfUploads,
      voiceSessions: currentUsage.voiceSessions + nextIncrements.voiceSessions
    };

    for (const key of usageKeys) {
      if (nextUsage[key] > SYNAPSE_FREE_PLAN_LIMITS[key]) {
        throw createUsageLimitError(key, minutesUntilReset);
      }
    }

    const payload = {
      uid,
      windowId,
      windowStart: Timestamp.fromDate(windowStart),
      windowSlot,
      aiInteractions: nextUsage.aiInteractions,
      pdfUploads: nextUsage.pdfUploads,
      voiceSessions: nextUsage.voiceSessions,
      updatedAt: serverTimestamp()
    };

    transaction.set(
      usageRef,
      snapshot.exists()
        ? payload
        : {
            ...payload,
            createdAt: serverTimestamp()
          },
      { merge: true }
    );

    return {
      ...nextUsage,
      windowStart: payload.windowStart,
      minutesUntilReset
    };
  });
}

export async function fetchCurrentUsage(uid) {
  const now = new Date();
  const windowId = getCurrentWindowId(uid, now);
  const minutesUntilReset = getMinutesUntilNextUsageReset(now);

  if (!uid) {
    const { windowStart } = getCurrentUsageWindow(now);

    return {
      aiInteractions: 0,
      pdfUploads: 0,
      voiceSessions: 0,
      windowStart: Timestamp.fromDate(windowStart),
      minutesUntilReset
    };
  }

  const snapshot = await getDoc(getUsageDocRef(uid, windowId));
  const usage = normalizeUsageSnapshot(snapshot.exists() ? snapshot.data() : {}, uid, windowId, now);

  return {
    aiInteractions: usage.aiInteractions,
    pdfUploads: usage.pdfUploads,
    voiceSessions: usage.voiceSessions,
    windowStart: usage.windowStart,
    minutesUntilReset
  };
}
