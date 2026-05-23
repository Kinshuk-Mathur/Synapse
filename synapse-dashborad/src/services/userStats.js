import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "firebase/firestore";
import { getFirebaseDb } from "../lib/firebase";
import { COLLECTIONS } from "./firestore";
import { formatDateKey, parseDateKey } from "./todos";

export const emptyUserStats = {
  streak: 0,
  lastActiveDate: null,
  lastActiveDateKey: ""
};

function addDays(date, amount) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function dateKeyFromTimestamp(value) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return formatDateKey(value);
  if (typeof value.toDate === "function") return formatDateKey(value.toDate());
  return "";
}

export function listenToUserStats(uid, onNext, onError) {
  if (!uid) return () => {};

  const db = getFirebaseDb();

  return onSnapshot(
    doc(db, COLLECTIONS.users, uid),
    (snapshot) => {
      const stats = snapshot.exists() ? snapshot.data()?.stats : null;

      onNext({
        ...emptyUserStats,
        ...(stats || {}),
        streak: Math.max(0, Number(stats?.streak) || 0),
        lastActiveDateKey: stats?.lastActiveDateKey || dateKeyFromTimestamp(stats?.lastActiveDate)
      });
    },
    onError
  );
}

export async function recordUserActivity(uid, source = "app") {
  if (!uid) return null;

  const db = getFirebaseDb();
  const userRef = doc(db, COLLECTIONS.users, uid);
  const todayKey = formatDateKey();
  const yesterdayKey = formatDateKey(addDays(parseDateKey(todayKey), -1));

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const previousStats = snapshot.exists() ? snapshot.data()?.stats || {} : {};
    const lastActiveDateKey =
      previousStats.lastActiveDateKey || dateKeyFromTimestamp(previousStats.lastActiveDate);
    const previousStreak = Math.max(0, Number(previousStats.streak) || 0);

    let nextStreak = 1;

    if (lastActiveDateKey === todayKey) {
      nextStreak = previousStreak || 1;
    } else if (lastActiveDateKey === yesterdayKey) {
      nextStreak = previousStreak + 1;
    }

    transaction.set(
      userRef,
      {
        stats: {
          streak: nextStreak,
          lastActiveDate: serverTimestamp(),
          lastActiveDateKey: todayKey,
          lastActivitySource: source,
          updatedAt: serverTimestamp()
        }
      },
      { merge: true }
    );

    return nextStreak;
  });
}
