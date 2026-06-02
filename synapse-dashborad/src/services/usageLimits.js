import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";
import { formatDateKey } from "./todos";

export const SYNAPSE_FREE_PLAN_LIMITS = {
  aiInteractions: 100,
  pdfUploads: 10
};

export function formatSynapseUsageDateKey(date = new Date()) {
  return formatDateKey(date);
}

function getLocalTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function clampUsageCount(value, limit) {
  return Math.min(limit, Math.max(0, Math.floor(Number(value) || 0)));
}

export function normalizeSynapseUsage(usage = {}, dateKey = formatSynapseUsageDateKey()) {
  if (!usage || usage.date !== dateKey) {
    return {
      date: dateKey,
      aiInteractions: 0,
      pdfUploads: 0,
      timezone: getLocalTimezone()
    };
  }

  return {
    date: dateKey,
    aiInteractions: clampUsageCount(usage.aiInteractions, SYNAPSE_FREE_PLAN_LIMITS.aiInteractions),
    pdfUploads: clampUsageCount(usage.pdfUploads, SYNAPSE_FREE_PLAN_LIMITS.pdfUploads),
    timezone: usage.timezone || getLocalTimezone()
  };
}

export function getSecondsUntilNextLocalMidnight(date = new Date()) {
  const nextMidnight = new Date(date);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(0, Math.ceil((nextMidnight.getTime() - date.getTime()) / 1000));
}

function createUsageLimitError(kind) {
  const isAiLimit = kind === "aiInteractions";
  const error = new Error(
    isAiLimit
      ? "Daily AI limit reached. Resets at midnight."
      : "Daily PDF upload limit reached. Resets at midnight."
  );

  error.code = isAiLimit ? "synapse/ai-limit-reached" : "synapse/pdf-limit-reached";
  error.limitKind = kind;
  return error;
}

function getUserRef(uid) {
  return doc(getFirebaseDb(), COLLECTIONS.users, uid);
}

export function listenToTodaySynapseUsage(uid, onNext, onError, dateKey = formatSynapseUsageDateKey()) {
  if (!uid) {
    onNext?.(normalizeSynapseUsage({}, dateKey));
    return () => {};
  }

  const userRef = getUserRef(uid);

  return onSnapshot(
    userRef,
    (snapshot) => {
      const userData = snapshot.exists() ? snapshot.data() : {};
      const normalizedUsage = normalizeSynapseUsage(userData?.usage, dateKey);
      onNext?.(normalizedUsage);

      if (userData?.usage?.date !== dateKey) {
        setDoc(
          userRef,
          {
            usage: {
              ...normalizedUsage,
              updatedAt: serverTimestamp()
            }
          },
          { merge: true }
        ).catch((error) => {
          onError?.(error);
        });
      }
    },
    onError
  );
}

export async function consumeSynapseUsage(uid, increments = {}) {
  const aiIncrement = Math.max(0, Math.floor(Number(increments.aiInteractions) || 0));
  const pdfIncrement = Math.max(0, Math.floor(Number(increments.pdfUploads) || 0));

  if (!uid || (!aiIncrement && !pdfIncrement)) {
    return null;
  }

  const dateKey = formatSynapseUsageDateKey();
  const userRef = getUserRef(uid);

  return runTransaction(getFirebaseDb(), async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const currentUsage = normalizeSynapseUsage(snapshot.exists() ? snapshot.data()?.usage : {}, dateKey);
    const nextAiInteractions = currentUsage.aiInteractions + aiIncrement;
    const nextPdfUploads = currentUsage.pdfUploads + pdfIncrement;

    if (nextAiInteractions > SYNAPSE_FREE_PLAN_LIMITS.aiInteractions) {
      throw createUsageLimitError("aiInteractions");
    }

    if (nextPdfUploads > SYNAPSE_FREE_PLAN_LIMITS.pdfUploads) {
      throw createUsageLimitError("pdfUploads");
    }

    const nextUsage = {
      ...currentUsage,
      aiInteractions: nextAiInteractions,
      pdfUploads: nextPdfUploads,
      timezone: getLocalTimezone()
    };

    transaction.set(
      userRef,
      {
        usage: {
          ...nextUsage,
          updatedAt: serverTimestamp()
        }
      },
      { merge: true }
    );

    return nextUsage;
  });
}
