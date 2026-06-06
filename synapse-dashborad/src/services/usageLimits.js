import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";

export const SYNAPSE_FREE_PLAN_LIMITS = {
  aiInteractions: 25,
  pdfUploads: 3,
  voiceSessions: 10
};

const usageKeys = ["aiInteractions", "pdfUploads", "voiceSessions"];
const rollingWindowMs = 6 * 60 * 60 * 1000;

function toUsageIncrement(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function toUsageCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function getUsageCollectionRef(uid) {
  return collection(getFirebaseDb(), COLLECTIONS.users, uid, "usage");
}

function getUsageDocRef(uid, windowId) {
  return doc(getFirebaseDb(), COLLECTIONS.users, uid, "usage", windowId);
}

function getRollingWindowId(uid, windowStart) {
  return `${uid}_${Math.floor(windowStart.getTime() / 1000)}`;
}

function normalizeActiveWindow(snapshot, now = new Date()) {
  if (!snapshot?.exists()) return null;

  const data = snapshot.data();
  const windowExpiry = toDate(data.windowExpiry);

  if (!windowExpiry || windowExpiry <= now) {
    return null;
  }

  return {
    id: snapshot.id,
    uid: data.uid || "",
    windowId: data.windowId || snapshot.id,
    windowStart: toDate(data.windowStart),
    windowExpiry,
    aiInteractions: toUsageCount(data.aiInteractions),
    pdfUploads: toUsageCount(data.pdfUploads),
    voiceSessions: toUsageCount(data.voiceSessions)
  };
}

export function getMinutesUntilWindowReset(windowExpiry, date = new Date()) {
  const expiryDate = toDate(windowExpiry);

  if (!expiryDate) return 0;

  return Math.max(0, Math.ceil((expiryDate.getTime() - date.getTime()) / 60000));
}

export function formatUsageResetTime(totalMinutes = 0) {
  const safeMinutes = Math.max(0, Math.ceil(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (!hours) {
    return `${safeMinutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function createUsageLimitError(kind, windowExpiry, now = new Date()) {
  const timeUntilReset = formatUsageResetTime(getMinutesUntilWindowReset(windowExpiry, now));
  const messages = {
    aiInteractions: `AI limit reached. Resets in ${timeUntilReset}.`,
    pdfUploads: `PDF limit reached. Resets in ${timeUntilReset}.`,
    voiceSessions: `Voice limit reached. Resets in ${timeUntilReset}.`
  };

  const error = new Error(messages[kind] || messages.aiInteractions);
  error.code = `synapse/${kind}-limit-reached`;
  error.limitKind = kind;
  error.minutesUntilReset = getMinutesUntilWindowReset(windowExpiry, now);
  return error;
}

function resolveUsageArguments(idTokenOrIncrements, maybeIncrements) {
  if (maybeIncrements && typeof maybeIncrements === "object") {
    return maybeIncrements;
  }

  return idTokenOrIncrements && typeof idTokenOrIncrements === "object" ? idTokenOrIncrements : {};
}

export async function getActiveWindow(uid, _idToken) {
  if (!uid) return null;

  const now = new Date();
  const activeWindowQuery = query(
    getUsageCollectionRef(uid),
    where("windowExpiry", ">", Timestamp.fromDate(now)),
    orderBy("windowExpiry", "desc"),
    limit(1)
  );
  const snapshot = await getDocs(activeWindowQuery);
  const activeWindow = snapshot.docs[0] ? normalizeActiveWindow(snapshot.docs[0], now) : null;

  return activeWindow;
}

export async function consumeSynapseUsage(uid, idTokenOrIncrements = {}, maybeIncrements) {
  const idToken = typeof idTokenOrIncrements === "string" ? idTokenOrIncrements : null;
  const increments = resolveUsageArguments(idTokenOrIncrements, maybeIncrements);
  const nextIncrements = {
    aiInteractions: toUsageIncrement(increments.aiInteractions),
    pdfUploads: toUsageIncrement(increments.pdfUploads),
    voiceSessions: toUsageIncrement(increments.voiceSessions)
  };
  const hasIncrement = usageKeys.some((key) => nextIncrements[key] > 0);

  if (!uid || !hasIncrement) {
    return null;
  }

  const activeWindow = await getActiveWindow(uid, idToken);

  if (activeWindow) {
    const usageRef = getUsageDocRef(uid, activeWindow.windowId);

    return runTransaction(getFirebaseDb(), async (transaction) => {
      const now = new Date();
      const snapshot = await transaction.get(usageRef);
      const currentWindow = normalizeActiveWindow(snapshot, now);

      if (!currentWindow) {
        return createRollingWindow(uid, nextIncrements, now, transaction);
      }

      const nextUsage = {
        ...currentWindow,
        aiInteractions: currentWindow.aiInteractions + nextIncrements.aiInteractions,
        pdfUploads: currentWindow.pdfUploads + nextIncrements.pdfUploads,
        voiceSessions: currentWindow.voiceSessions + nextIncrements.voiceSessions
      };

      for (const key of usageKeys) {
        if (nextUsage[key] > SYNAPSE_FREE_PLAN_LIMITS[key]) {
          throw createUsageLimitError(key, currentWindow.windowExpiry, now);
        }
      }

      transaction.set(
        usageRef,
        {
          aiInteractions: nextUsage.aiInteractions,
          pdfUploads: nextUsage.pdfUploads,
          voiceSessions: nextUsage.voiceSessions,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      return {
        ...nextUsage,
        minutesUntilReset: getMinutesUntilWindowReset(currentWindow.windowExpiry, now),
        hasActiveWindow: true
      };
    });
  }

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const now = new Date();
    return createRollingWindow(uid, nextIncrements, now, transaction);
  });
}

function createRollingWindow(uid, increments, now, transaction) {
  const windowStart = now;
  const windowExpiry = new Date(windowStart.getTime() + rollingWindowMs);
  const windowId = getRollingWindowId(uid, windowStart);
  const usageRef = getUsageDocRef(uid, windowId);
  const payload = {
    uid,
    windowId,
    windowStart: Timestamp.fromDate(windowStart),
    windowExpiry: Timestamp.fromDate(windowExpiry),
    aiInteractions: increments.aiInteractions,
    pdfUploads: increments.pdfUploads,
    voiceSessions: increments.voiceSessions,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now)
  };

  transaction.set(usageRef, payload, { merge: true });

  return {
    uid,
    windowId,
    windowStart,
    windowExpiry,
    aiInteractions: payload.aiInteractions,
    pdfUploads: payload.pdfUploads,
    voiceSessions: payload.voiceSessions,
    minutesUntilReset: getMinutesUntilWindowReset(windowExpiry, now),
    hasActiveWindow: true
  };
}

export async function fetchCurrentUsage(uid, idToken) {
  const activeWindow = await getActiveWindow(uid, idToken);
  const now = new Date();

  if (!activeWindow) {
    return {
      aiInteractions: 0,
      pdfUploads: 0,
      voiceSessions: 0,
      windowStart: null,
      windowExpiry: null,
      minutesUntilReset: 0,
      hasActiveWindow: false,
      windowId: ""
    };
  }

  return {
    aiInteractions: activeWindow.aiInteractions,
    pdfUploads: activeWindow.pdfUploads,
    voiceSessions: activeWindow.voiceSessions,
    windowStart: activeWindow.windowStart,
    windowExpiry: activeWindow.windowExpiry,
    minutesUntilReset: getMinutesUntilWindowReset(activeWindow.windowExpiry, now),
    hasActiveWindow: true,
    windowId: activeWindow.windowId
  };
}
