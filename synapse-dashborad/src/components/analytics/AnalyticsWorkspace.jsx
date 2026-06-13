"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import CalendarHeatmap from "react-calendar-heatmap";
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Flame,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Target,
  Trophy,
  Zap
} from "lucide-react";
import {
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  Bar as RechartsBar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Line as RechartsLine,
  LineChart as RechartsLineChart,
  Pie as RechartsPie,
  PieChart as RechartsPieChart,
  ResponsiveContainer as RechartsResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { useAnalyticsDashboard } from "../../hooks/useAnalyticsDashboard";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";
import { useUserStats } from "../../hooks/useUserStats";
import {
  buildAvailableAnalyticsMonths,
  buildUserAnchoredMonthWeeks,
  getUserAnalyticsStartDate
} from "../../services/analytics";
import { formatDateKey, parseDateKey } from "../../services/todos";
import NotificationCenter from "../NotificationCenter";
import ProfileAvatarMenu from "../ProfileAvatarMenu";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "SYNAPSE AI", icon: Sparkles, href: "/synapse-ai" },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus" },
  { label: "To-Do List", icon: CheckSquare, href: "/todo" },
  { label: "Goals", icon: Target, href: "/goals" },
  { label: "Analytics", icon: BarChart3, href: "/analytics", active: true },
  { label: "Resources", icon: FolderOpen, href: "/resources" },
  { label: "Settings", icon: Settings, href: "/settings" }
];

const chartColors = {
  pink: "var(--chart-pink)",
  purple: "var(--chart-purple)",
  blue: "var(--chart-blue)",
  gold: "var(--chart-gold)"
};

function parseMonthValue(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatDayName(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString("en-US", { weekday: "short" });
}

function formatFullDay(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function getCurrentWeekIndex(weeks, todayKey = formatDateKey()) {
  const index = weeks.findIndex((week) => week.startDateKey <= todayKey && week.endDateKey >= todayKey);
  return index >= 0 ? index : 0;
}

function EmptyMetric({ children }) {
  return (
    <div className="analytics-empty-inline">
      <Sparkles size={16} />
      <span>{children}</span>
    </div>
  );
}

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="analytics-chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey || item.name}>
          {item.name}: {item.value}
        </span>
      ))}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone = "pink", delay = 0 }) {
  return (
    <motion.article
      className="analytics-stat-card"
      style={{ "--analytics-tone": chartColors[tone] || chartColors.pink }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, delay }}
      whileHover={{ y: -5 }}
    >
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <motion.strong initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        {value}
      </motion.strong>
      <small>{detail}</small>
    </motion.article>
  );
}

function AnalyticsSidebar({ userStats, loading, open = false, onNavigate }) {
  return (
    <motion.aside
      className={`sidebar ${open ? "is-mobile-open" : ""}`}
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="brand-lockup">
        <Link href="/" className="brand-home-link" aria-label="Go to SYNAPSE dashboard" onClick={onNavigate}>
          <Image
            src="/assets/main-logo.jpeg"
            alt="SYNAPSE logo"
            width={186}
            height={74}
            className="brand-wordmark"
            priority
          />
        </Link>
      </div>

      <nav className="side-nav" aria-label="Analytics sections">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <motion.div key={item.label} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={item.href}
                className={`nav-item ${item.active ? "is-active" : ""}`}
                onClick={onNavigate}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="side-footer">
        <motion.div className="momentum-card analytics-momentum-card" whileHover={{ y: -4 }}>
          <span>Current Momentum</span>
          <strong>
            <Flame size={34} />
            <b>{loading ? "--" : userStats.currentMomentum || 0}</b>
          </strong>
          <p>Day Momentum</p>
          <em>Longest: {loading ? "--" : userStats.longestMomentum || 0} days</em>
        </motion.div>

        <button className="support-button" type="button">
          <HelpCircle size={18} />
          Help & Support
        </button>
      </div>
    </motion.aside>
  );
}

function ReportHero({ report, summary, hasActivity }) {
  return (
    <motion.section
      className="analytics-report-card"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48 }}
    >
      <div className="analytics-report-visual" aria-hidden="true">
        <span className="analytics-ai-badge">AI</span>
        <span className="brain-mark analytics-brain-mark" />
      </div>
      <div className="analytics-report-copy">
        <span className="analytics-kicker">
          <Sparkles size={16} />
          AI Weekly Report
        </span>
        <h2>{report.title}</h2>
        <p>{report.body}</p>
        <div className="analytics-report-pills">
          {hasActivity ? (
            report.highlights.map((item) => <span key={item}>{item}</span>)
          ) : (
            <span>Real data only</span>
          )}
        </div>
      </div>
      <div className="analytics-score-orbit">
        <strong>{summary.productivityScore}</strong>
        <span>/100</span>
      </div>
    </motion.section>
  );
}

function ChartPanel({ title, subtitle, icon: Icon, children, empty }) {
  return (
    <motion.article
      className="analytics-panel"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42 }}
      whileHover={{ y: -3 }}
    >
      <div className="analytics-panel-header">
        <div>
          <span>
            <Icon size={18} />
          </span>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="analytics-chart-body">
        {empty ? <EmptyMetric>Start your work to unlock this chart.</EmptyMetric> : children}
      </div>
    </motion.article>
  );
}

function GoalPie({ summary }) {
  const data = [
    { name: "Completed", value: summary.goalsCompleted, color: "var(--chart-pink)" },
    { name: "In Progress", value: summary.goalsInProgress, color: "var(--chart-purple)" },
    { name: "Not Started", value: summary.goalsNotStarted, color: "var(--chart-blue)" }
  ].filter((item) => item.value > 0);

  if (!summary.goalsTotal || !data.length) {
    return <EmptyMetric>Add or update goals to see real progress.</EmptyMetric>;
  }

  return (
    <div className="analytics-goal-pie">
      <RechartsResponsiveContainer width="58%" height={230}>
        <RechartsPieChart>
          <RechartsPie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={3}
            isAnimationActive
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </RechartsPie>
          <Tooltip content={<AnalyticsTooltip />} />
        </RechartsPieChart>
      </RechartsResponsiveContainer>
      <div className="analytics-goal-pie-center">
        <strong>{summary.goalProgressAverage}%</strong>
        <span>Completed</span>
      </div>
      <div className="analytics-goal-legend">
        {data.map((item) => (
          <span key={item.name}>
            <i style={{ "--legend-color": item.color }} />
            {item.name}
            <b>{item.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsWorkspace() {
  const { user, profile, setProfile, logout } = useAuth();
  useSynapseTheme();
  const { stats: userStats, loading: statsLoading } = useUserStats();
  const startDate = useMemo(() => getUserAnalyticsStartDate(profile, user), [profile, user]);
  const monthOptions = useMemo(() => buildAvailableAnalyticsMonths(startDate), [startDate]);
  const [selectedMonthValue, setSelectedMonthValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [navigationOpen, setNavigationOpen] = useState(false);
  const selectedMonthDate = useMemo(() => parseMonthValue(selectedMonthValue), [selectedMonthValue]);
  const weeks = useMemo(
    () => buildUserAnchoredMonthWeeks(selectedMonthDate, startDate),
    [selectedMonthDate, startDate]
  );
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const selectedWeek = weeks[Math.min(selectedWeekIndex, Math.max(0, weeks.length - 1))] || null;
  const studentName = profile?.name || user?.displayName?.split(" ")[0] || "Student";

  useEffect(() => {
    setSelectedWeekIndex(getCurrentWeekIndex(weeks));
  }, [selectedMonthValue, weeks]);

  const {
    loading,
    error,
    weekDays,
    monthDays,
    weeklySummary,
    report,
    insights,
    wins
  } = useAnalyticsDashboard({
    uid: user?.uid,
    selectedWeek,
    selectedMonthDate,
    userStats,
    studentName
  });

  const hasActivity = weeklySummary.activeDays > 0;
  const selectedMonthLabel =
    monthOptions.find((item) => item.value === selectedMonthValue)?.label ||
    selectedMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const chartData = useMemo(
    () =>
      weekDays.map((day) => ({
        day: formatDayName(day.dateKey),
        label: formatFullDay(day.dateKey),
        focusHours: Number((day.focusMinutes / 60).toFixed(2)),
        taskRate: day.tasksTotal > 0 ? day.taskCompletionRate : 0,
        momentum: day.momentumCompleted ? 1 : 0,
        score: day.productivityScore
      })),
    [weekDays]
  );

  const heatmapValues = useMemo(
    () =>
      monthDays.map((day) => ({
        date: day.dateKey,
        count: day.productivityScore
      })),
    [monthDays]
  );

  const monthStart = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth(), 1);
  const monthEnd = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <main className="site-shell">
      <div className="ambient-grid" aria-hidden="true" />

      <div className="dashboard-frame analytics-dashboard-frame">
        <button
          className={`sidebar-scrim ${navigationOpen ? "is-visible" : ""}`}
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />

        <AnalyticsSidebar
          userStats={userStats}
          loading={statsLoading}
          open={navigationOpen}
          onNavigate={() => setNavigationOpen(false)}
        />

        <section className="workspace analytics-workspace">
          <header className="analytics-topbar">
            <div className="analytics-title-block">
              <button
                className="icon-button app-sidebar-toggle"
                type="button"
                aria-label="Open navigation"
                aria-expanded={navigationOpen}
                onClick={() => setNavigationOpen(true)}
              >
                <Menu size={22} />
              </button>
              <span className="analytics-title-icon">
                <Zap size={30} />
              </span>
              <div>
                <h1>Analytics</h1>
                <p>Understand your productivity. Improve every day.</p>
              </div>
            </div>

            <div className="analytics-top-actions">
              <ProfileAvatarMenu
                user={user}
                profile={profile}
                studentName={studentName}
                modeLabel="Focus Mode"
                onProfileUpdate={setProfile}
              />
              <NotificationCenter />
              <button className="logout-button" type="button" onClick={handleLogout}>
                <LogOut size={17} />
                <span>Logout</span>
              </button>
            </div>
          </header>

          {error ? (
            <motion.p className="topbar-error" role="alert" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              {error}
            </motion.p>
          ) : null}

          <section className="analytics-controls" aria-label="Analytics period controls">
            <label className="analytics-select-shell">
              <CalendarDays size={18} />
              <select value={selectedMonthValue} onChange={(event) => setSelectedMonthValue(event.target.value)}>
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>

            <div className="analytics-week-tabs">
              {weeks.length ? (
                weeks.map((week, index) => (
                  <button
                    key={week.startDateKey}
                    type="button"
                    className={index === selectedWeekIndex ? "is-active" : ""}
                    onClick={() => setSelectedWeekIndex(index)}
                  >
                    <span>{week.label}</span>
                    <small>{week.rangeLabel}</small>
                  </button>
                ))
              ) : (
                <span className="analytics-no-weeks">Start date is after {selectedMonthLabel}</span>
              )}
            </div>
          </section>

          <ReportHero report={report} summary={weeklySummary} hasActivity={hasActivity} />

          <section className="analytics-stats-grid" aria-label="Analytics summary">
            <StatCard
              icon={Sparkles}
              label="Productivity Score"
              value={loading ? "--" : `${weeklySummary.productivityScore}/100`}
              detail={hasActivity ? "Weighted from focus, tasks, goals, momentum, and AI" : "Start your work"}
              tone="pink"
            />
            <StatCard
              icon={Flame}
              label="Total Focus Time"
              value={loading ? "--" : weeklySummary.focusLabel}
              detail={`${weeklySummary.averageSessionMinutes || 0}m average session`}
              tone="purple"
              delay={0.05}
            />
            <StatCard
              icon={CheckCircle2}
              label="Tasks Completed"
              value={loading ? "--" : `${weeklySummary.tasksCompleted}/${weeklySummary.tasksTotal}`}
              detail={`${weeklySummary.taskCompletionRate}% completion rate`}
              tone="blue"
              delay={0.1}
            />
            <StatCard
              icon={Target}
              label="Goals Progress"
              value={loading ? "--" : `${weeklySummary.goalProgressAverage}%`}
              detail={`${weeklySummary.goalsCompleted}/${weeklySummary.goalsTotal} goals completed`}
              tone="gold"
              delay={0.15}
            />
          </section>

          <section className="analytics-graphs-grid" aria-label="Realtime analytics graphs">
            <ChartPanel
              title="Focus Time Trend"
              subtitle="Daily focus hours"
              icon={Flame}
              empty={!weekDays.some((day) => day.focusMinutes > 0)}
            >
              <RechartsResponsiveContainer width="100%" height={260}>
                <RechartsAreaChart data={chartData} margin={{ left: -16, right: 10, top: 16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsFocusArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-pink)" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="var(--chart-purple)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} tickFormatter={(value) => `${value}h`} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <RechartsArea
                    type="monotone"
                    dataKey="focusHours"
                    name="Focus hours"
                    stroke="var(--chart-pink)"
                    fill="url(#analyticsFocusArea)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "var(--chart-pink)", strokeWidth: 2, stroke: "var(--color-text)" }}
                    isAnimationActive
                  />
                </RechartsAreaChart>
              </RechartsResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Task Completion Trend"
              subtitle="Daily completion percentage"
              icon={CheckSquare}
              empty={!weekDays.some((day) => day.tasksTotal > 0)}
            >
              <RechartsResponsiveContainer width="100%" height={260}>
                <RechartsBarChart data={chartData} margin={{ left: -16, right: 10, top: 16, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} domain={[0, 100]} tick={{ fill: "var(--color-muted)", fontSize: 12 }} tickFormatter={(value) => `${value}%`} />
                  <Tooltip content={<AnalyticsTooltip />} />
                  <RechartsBar dataKey="taskRate" name="Completion" fill="var(--chart-purple)" radius={[7, 7, 2, 2]} barSize={28} isAnimationActive />
                </RechartsBarChart>
              </RechartsResponsiveContainer>
            </ChartPanel>

            <ChartPanel
              title="Goal Progress"
              subtitle="Overall progress of your goals"
              icon={Target}
              empty={false}
            >
              <GoalPie summary={weeklySummary} />
            </ChartPanel>

            <ChartPanel
              title="Momentum Consistency"
              subtitle="Completed productivity days"
              icon={Flame}
              empty={!weekDays.some((day) => day.momentumCompleted || day.momentumPillarsCompleted > 0)}
            >
              <div className="analytics-momentum-consistency">
                <div>
                  <strong>{weeklySummary.momentumDays}/7</strong>
                  <span>Productive Days</span>
                </div>
                <RechartsResponsiveContainer width="100%" height={84}>
                  <RechartsLineChart data={chartData} margin={{ left: -20, right: 12, top: 22, bottom: 0 }}>
                    <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} domain={[0, 1]} hide />
                    <Tooltip content={<AnalyticsTooltip />} />
                    <RechartsLine
                      type="monotone"
                      dataKey="momentum"
                      name="Momentum day"
                      stroke="var(--chart-blue)"
                      strokeWidth={3}
                      dot={{ r: 6, fill: "var(--chart-blue)", stroke: "var(--color-text)", strokeWidth: 2 }}
                      isAnimationActive
                    />
                  </RechartsLineChart>
                </RechartsResponsiveContainer>
              </div>
            </ChartPanel>

            <motion.article
              className="analytics-panel analytics-heatmap-panel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42 }}
            >
              <div className="analytics-panel-header">
                <div>
                  <span>
                    <Zap size={18} />
                  </span>
                  <div>
                    <h3>Productivity Heatmap</h3>
                    <p>Daily productivity intensity</p>
                  </div>
                </div>
                <strong>{selectedMonthLabel}</strong>
              </div>
              <div className="analytics-heatmap-wrap">
                <CalendarHeatmap
                  startDate={monthStart}
                  endDate={monthEnd}
                  values={heatmapValues}
                  gutterSize={2}
                  showMonthLabels={false}
                  showWeekdayLabels={false}
                  classForValue={(value) => {
                    if (!value || !value.count) return "heatmap-empty";
                    if (value.count >= 80) return "heatmap-level-4";
                    if (value.count >= 60) return "heatmap-level-3";
                    if (value.count >= 35) return "heatmap-level-2";
                    return "heatmap-level-1";
                  }}
                  titleForValue={(value) =>
                    value?.date ? `${value.date}: ${value.count || 0}/100 productivity score` : "No analytics data"
                  }
                />
                <div className="analytics-heatmap-legend">
                  <span>Low</span>
                  {[1, 2, 3, 4].map((level) => (
                    <i key={level} className={`heatmap-level-${level}`} />
                  ))}
                  <span>High</span>
                </div>
              </div>
            </motion.article>
          </section>

          <section className="analytics-bottom-grid">
            <motion.article
              className="analytics-panel analytics-insights-panel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42 }}
            >
              <div className="analytics-panel-header">
                <div>
                  <span>
                    <Lightbulb size={18} />
                  </span>
                  <div>
                    <h3>AI Insights</h3>
                    <p>Smart insights based on your data</p>
                  </div>
                </div>
              </div>
              <div className="analytics-insight-grid">
                {insights.length ? (
                  insights.map((insight) => (
                    <motion.div
                      className={`analytics-insight-card tone-${insight.tone}`}
                      key={insight.title}
                      whileHover={{ y: -4 }}
                    >
                      <Sparkles size={24} />
                      <strong>{insight.title}</strong>
                      <p>{insight.body}</p>
                    </motion.div>
                  ))
                ) : (
                  <EmptyMetric>Start your work. SYNAPSE will only show insights backed by real activity.</EmptyMetric>
                )}
              </div>
            </motion.article>

            <motion.article
              className="analytics-panel analytics-wins-panel"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.05 }}
            >
              <div className="analytics-panel-header">
                <div>
                  <span>
                    <Trophy size={18} />
                  </span>
                  <div>
                    <h3>Weekly Wins</h3>
                    <p>Minimal wins from this week</p>
                  </div>
                </div>
              </div>
              <div className="analytics-win-list">
                {wins.map((win, index) => (
                  <div className="analytics-win-row" key={win.label}>
                    <span>
                      {index === 0 ? <Trophy size={18} /> : index === 1 ? <Flame size={18} /> : index === 2 ? <Zap size={18} /> : <Check size={18} />}
                    </span>
                    <div>
                      <strong>{win.label}</strong>
                      <small>{win.detail}</small>
                    </div>
                    <b>{win.value}</b>
                  </div>
                ))}
              </div>
            </motion.article>
          </section>
        </section>
      </div>
    </main>
  );
}
