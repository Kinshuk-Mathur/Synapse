"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildAiInsights,
  buildDailyAnalyticsFromSources,
  buildWeeklyReport,
  buildWeeklyWins,
  fillAnalyticsRange,
  listenToAllDailyAnalytics,
  listenToAnalyticsSources,
  listenToWeeklyReport,
  summarizeAnalytics,
  syncDailyAnalytics,
  syncWeeklyReport
} from "../services/analytics";
import { formatDateKey } from "../services/todos";

function monthRange(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

  return {
    startDateKey: formatDateKey(start),
    endDateKey: formatDateKey(end)
  };
}

export function useAnalyticsDashboard({
  uid,
  selectedWeek,
  selectedMonthDate,
  userStats,
  studentName
}) {
  const [dailyByDate, setDailyByDate] = useState({});
  const [sources, setSources] = useState(null);
  const [storedReport, setStoredReport] = useState(null);
  const [dailyLoaded, setDailyLoaded] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) {
      setDailyByDate({});
      setDailyLoaded(false);
      return undefined;
    }

    setDailyLoaded(false);

    return listenToAllDailyAnalytics(
      uid,
      (nextDaily) => {
        setDailyByDate(nextDaily);
        setDailyLoaded(true);
        setError("");
      },
      (analyticsError) => {
        setError(analyticsError.message || "Unable to load analytics.");
        setDailyLoaded(true);
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSources(null);
      setSourcesLoaded(false);
      return undefined;
    }

    setSourcesLoaded(false);

    return listenToAnalyticsSources(
      uid,
      (nextSources) => {
        setSources(nextSources);
        setSourcesLoaded(true);
        setError("");
      },
      (analyticsError) => {
        setError(analyticsError.message || "Unable to sync realtime analytics.");
        setSourcesLoaded(true);
      }
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !sourcesLoaded || !dailyLoaded || !sources) return;

    let cancelled = false;
    const aggregates = buildDailyAnalyticsFromSources(sources, {
      includeDateKeys: Object.keys(dailyByDate)
    });

    syncDailyAnalytics(uid, aggregates, dailyByDate).catch((syncError) => {
      if (!cancelled) {
        setError(syncError.message || "Unable to update analytics aggregates.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dailyByDate, dailyLoaded, sources, sourcesLoaded, uid]);

  const week = useMemo(() => {
    if (!selectedWeek) return null;

    return {
      ...selectedWeek,
      weekKey: `${selectedWeek.startDateKey}_${selectedWeek.endDateKey}`
    };
  }, [selectedWeek]);

  const weekDays = useMemo(() => {
    if (!week) return [];
    return fillAnalyticsRange(dailyByDate, week.startDateKey, week.endDateKey);
  }, [dailyByDate, week]);

  const monthDays = useMemo(() => {
    if (!selectedMonthDate) return [];
    const range = monthRange(selectedMonthDate);
    return fillAnalyticsRange(dailyByDate, range.startDateKey, range.endDateKey);
  }, [dailyByDate, selectedMonthDate]);

  const weeklySummary = useMemo(
    () => summarizeAnalytics(weekDays, userStats),
    [userStats, weekDays]
  );

  const monthSummary = useMemo(
    () => summarizeAnalytics(monthDays, userStats),
    [monthDays, userStats]
  );

  const derivedReport = useMemo(
    () =>
      buildWeeklyReport({
        week,
        days: weekDays,
        userStats,
        studentName
      }),
    [studentName, userStats, week, weekDays]
  );

  useEffect(() => {
    if (!uid || !week?.weekKey) {
      setStoredReport(null);
      return undefined;
    }

    return listenToWeeklyReport(
      uid,
      week.weekKey,
      (nextReport) => {
        setStoredReport(nextReport);
        setError("");
      },
      (reportError) => {
        setError(reportError.message || "Unable to load weekly report.");
      }
    );
  }, [uid, week?.weekKey]);

  useEffect(() => {
    if (!uid || !week?.weekKey || !dailyLoaded || !derivedReport?.signature) return;

    let cancelled = false;

    syncWeeklyReport(uid, derivedReport).catch((reportError) => {
      if (!cancelled) {
        setError(reportError.message || "Unable to save weekly report.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dailyLoaded, derivedReport, uid, week?.weekKey]);

  const report = storedReport?.signature === derivedReport.signature ? storedReport : derivedReport;
  const insights = useMemo(() => buildAiInsights(weekDays), [weekDays]);
  const wins = useMemo(() => buildWeeklyWins(weekDays), [weekDays]);

  return {
    loading: !dailyLoaded || !sourcesLoaded,
    error,
    dailyByDate,
    weekDays,
    monthDays,
    weeklySummary,
    monthSummary,
    report,
    insights,
    wins
  };
}
