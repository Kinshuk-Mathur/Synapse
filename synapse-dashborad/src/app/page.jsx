"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Command,
  Flame,
  FolderOpen,
  HelpCircle,
  Instagram,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Twitter,
  Youtube,
  Zap
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import ProtectedRoute from "../components/ProtectedRoute";
import { useAuth } from "../context/AuthContext";
import { formatDateKey, listenToUserTodos } from "../services/todos";

const todoAppUrl = "/todo";

const themes = [
  { id: "obsidian", name: "Obsidian Neon", tone: "Default OS" },
  { id: "midnight", name: "Midnight Tech", tone: "Deep Focus" },
  { id: "inferno", name: "Inferno Focus", tone: "Exam Sprint" },
  { id: "pink", name: "Pink Aura", tone: "Dark Bloom" }
];

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", active: true },
  { label: "FocusLock", icon: LockKeyhole, href: "#" },
  { label: "To-Do List", icon: CheckSquare, href: todoAppUrl },
  { label: "Goals", icon: Target, href: "#" },
  { label: "Focus Sessions", icon: Timer, href: "#" },
  { label: "Analytics", icon: BarChart3, href: "#" },
  { label: "AI Assistant", icon: Sparkles, href: "#" },
  { label: "Calendar", icon: CalendarDays, href: "#" },
  { label: "Resources", icon: FolderOpen, href: "#" },
  { label: "Settings", icon: Settings, href: "#" }
];

const sparkData = [
  { value: 18 },
  { value: 24 },
  { value: 20 },
  { value: 34 },
  { value: 28 },
  { value: 42 },
  { value: 24 },
  { value: 31 },
  { value: 44 },
  { value: 27 },
  { value: 50 },
  { value: 39 },
  { value: 56 }
];

const baseStatCards = [
  {
    label: "Focus Time Today",
    value: "4h 32m",
    meta: "+18% from yesterday",
    icon: Timer,
    chart: "var(--chart-purple)",
    glow: "var(--glow-purple)"
  },
  {
    label: "Tasks Completed",
    value: "0 / 0",
    meta: "Syncing todos...",
    icon: Check,
    chart: "var(--chart-pink)",
    glow: "var(--glow-pink)"
  },
  {
    label: "Focus Score",
    value: "87%",
    meta: "Excellent Focus",
    icon: Star,
    chart: "var(--chart-gold)",
    glow: "var(--glow-gold)"
  },
  {
    label: "Blocked Distractions",
    value: "24",
    meta: "+12% from yesterday",
    icon: ShieldCheck,
    chart: "var(--chart-blue)",
    glow: "var(--glow-blue)"
  }
];

const focusData = [
  { day: "Mon", hours: 4.2 },
  { day: "Tue", hours: 5.1 },
  { day: "Wed", hours: 4.1 },
  { day: "Thu", hours: 5.7 },
  { day: "Fri", hours: 5.1 },
  { day: "Sat", hours: 3.0 },
  { day: "Sun", hours: 4.4 }
];

const distractions = [
  { name: "YouTube", time: "1h 32m", value: 82, icon: Youtube, tone: "var(--chart-red)" },
  { name: "Instagram", time: "58m", value: 58, icon: Instagram, tone: "var(--chart-pink)" },
  { name: "Reddit", time: "32m", value: 32, icon: MoreHorizontal, tone: "var(--chart-orange)" },
  { name: "Twitter", time: "18m", value: 21, icon: Twitter, tone: "var(--chart-blue)" },
  { name: "Other", time: "12m", value: 14, icon: MoreHorizontal, tone: "var(--color-muted)" }
];

const goals = [
  { label: "Finish Calculus Syllabus", progress: 72, accent: "var(--chart-pink)" },
  { label: "Study 120 Hours", progress: 58, accent: "var(--chart-blue)" },
  { label: "Complete 15 Mock Tests", progress: 40, accent: "var(--chart-gold)" }
];

const messages = [
  { side: "user", text: "Hi SYNAPSE, add today's todo list", time: "7:30 PM" },
  {
    side: "ai",
    text: "Sure, I'll help you create today's todo list. Tell me your tasks one by one and I'll add them for you.",
    time: "7:31 PM"
  },
  { side: "user", text: "1. Complete Physics Numericals", time: "7:31 PM" },
  { side: "ai", text: "Added: Complete Physics Numericals", time: "7:31 PM", checked: true },
  { side: "user", text: "2. Watch Calculus Lecture", time: "7:32 PM" },
  { side: "ai", text: "Added: Watch Calculus Lecture", time: "7:32 PM", checked: true }
];

const cardMotion = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 }
};

function MiniLine({ color, ready }) {
  if (!ready) {
    return <div className="sparkline-placeholder" />;
  }

  return (
    <ResponsiveContainer width="100%" height={34}>
      <LineChart data={sparkData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ThemeSwitcher({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const current = themes.find((item) => item.id === theme) ?? themes[0];

  return (
    <div className="theme-switcher">
      <motion.button
        className="theme-trigger"
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen((value) => !value)}
        aria-label="Select SYNAPSE theme"
      >
        <span className="theme-orb" aria-hidden="true" />
        <span className="theme-label">{current.name.split(" ")[0]}</span>
        <ChevronDown size={16} />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="theme-menu"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            {themes.map((item) => (
              <button
                key={item.id}
                className={`theme-option ${theme === item.id ? "is-active" : ""}`}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
              >
                <span className="theme-copy">
                  <strong>{item.name}</strong>
                  <small>{item.tone}</small>
                </span>
                <span className="theme-preview" aria-hidden="true">
                  {[1, 2, 3, 4].map((index) => (
                    <span
                      key={index}
                      style={{ "--swatch": `var(--theme-${item.id}-${index})` }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const [theme, setTheme] = useState("obsidian");
  const [mounted, setMounted] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [dashboardTodos, setDashboardTodos] = useState([]);
  const [dashboardTodoLoading, setDashboardTodoLoading] = useState(true);
  const [dashboardTodoError, setDashboardTodoError] = useState("");
  const { user, logout } = useAuth();

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("synapse-theme") || "obsidian";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setMounted(true);
  }, []);

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("synapse-theme", nextTheme);
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const studentName = user?.displayName?.split(" ")[0] || "STUDENT";

  useEffect(() => {
    if (!user?.uid) {
      setDashboardTodos([]);
      setDashboardTodoLoading(false);
      return undefined;
    }

    setDashboardTodoLoading(true);

    return listenToUserTodos(
      user.uid,
      (nextTodos) => {
        setDashboardTodos(nextTodos);
        setDashboardTodoError("");
        setDashboardTodoLoading(false);
      },
      (todoError) => {
        setDashboardTodoError(todoError.message || "Unable to load pending tasks.");
        setDashboardTodoLoading(false);
      }
    );
  }, [user?.uid]);

  const dashboardPendingTodos = useMemo(
    () =>
      dashboardTodos
        .filter((item) => !item.completed && item.selectedDate <= formatDateKey())
        .sort((a, b) => String(a.selectedDate).localeCompare(String(b.selectedDate)))
        .slice(0, 4),
    [dashboardTodos]
  );

  const statCards = useMemo(() => {
    const todayKey = formatDateKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = formatDateKey(yesterday);
    const todayTodos = dashboardTodos.filter((item) => item.selectedDate === todayKey);
    const yesterdayTodos = dashboardTodos.filter((item) => item.selectedDate === yesterdayKey);
    const completedToday = todayTodos.filter((item) => item.completed).length;
    const completedYesterday = yesterdayTodos.filter((item) => item.completed).length;
    const pendingToday = todayTodos.length - completedToday;

    let todoMeta = "No tasks planned today";

    if (dashboardTodoLoading) {
      todoMeta = "Syncing todos...";
    } else if (dashboardTodoError) {
      todoMeta = "Todo sync unavailable";
    } else if (todayTodos.length > 0 && yesterdayTodos.length > 0) {
      const delta = completedToday - completedYesterday;
      todoMeta =
        delta === 0
          ? "Same as yesterday"
          : `${delta > 0 ? "+" : ""}${delta} from yesterday`;
    } else if (todayTodos.length > 0) {
      todoMeta = pendingToday === 0 ? "All tasks complete" : `${pendingToday} pending today`;
    }

    return baseStatCards.map((card) =>
      card.label === "Tasks Completed"
        ? {
            ...card,
            value: dashboardTodoLoading ? "... / ..." : `${completedToday} / ${todayTodos.length}`,
            meta: todoMeta
          }
        : card
    );
  }, [dashboardTodoError, dashboardTodoLoading, dashboardTodos]);

  const handleLogout = async () => {
    try {
      setLogoutError("");
      await logout();
    } catch (error) {
      setLogoutError(error.message || "Logout failed. Please try again.");
    }
  };

  return (
    <ProtectedRoute>
      <main className="site-shell">
      <div className="ambient-grid" aria-hidden="true" />

      <div className="dashboard-frame">
        <motion.aside
          className="sidebar"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="brand-lockup">
            <Image
              src="/assets/main-logo.jpeg"
              alt="SYNAPSE logo"
              width={186}
              height={74}
              className="brand-wordmark"
              priority
            />
          </div>

          <nav className="side-nav" aria-label="Dashboard sections">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.label}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link href={item.href} className={`nav-item ${item.active ? "is-active" : ""}`}>
                    <Icon size={20} />
                    <span>{item.label}</span>
                  </Link>
                </motion.div>
              );
            })}
          </nav>

          <div className="side-footer">
            <motion.div className="streak-card" whileHover={{ y: -4 }}>
              <span>Current Streak</span>
              <strong>
                <Flame size={34} />
                12 <small>days</small>
              </strong>
              <p>Keep it up!</p>
            </motion.div>

            <button className="support-button">
              <HelpCircle size={18} />
              Help & Support
            </button>
          </div>
        </motion.aside>

        <section className="workspace">
          <header className="topbar">
            <button className="icon-button menu-button" aria-label="Open navigation">
              <Menu size={22} />
            </button>

            <label className="search-box">
              <Search size={18} />
              <input aria-label="Search dashboard" placeholder="Search anything..." />
              <span>
                <Command size={13} />K
              </span>
            </label>

            <div className="top-actions">
              <ThemeSwitcher theme={theme} onChange={applyTheme} />
              <button className="icon-button notification" aria-label="Notifications">
                <Bell size={20} />
                <span>3</span>
              </button>
              <div className="profile-chip">
                <Image
                  src="/assets/synapse-icon-cropped.png"
                  alt="Student profile"
                  width={36}
                  height={36}
                />
                <div>
                  <strong>{studentName}</strong>
                  <small>Focus Mode</small>
                </div>
                <ChevronDown size={14} />
              </div>
              <button className="logout-button" type="button" onClick={handleLogout}>
                <LogOut size={17} />
                <span>Logout</span>
              </button>
            </div>
          </header>
          {logoutError ? (
            <p className="topbar-error" role="alert">
              {logoutError}
            </p>
          ) : null}

          <div className="content-grid">
            <div className="primary-column">
              <motion.section
                className="hero-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55 }}
              >
                <div className="hero-icon">
                  <Zap size={34} />
                </div>
                <div className="hero-copy">
                  <h1>{greeting}!</h1>
                  <p>Focus. Learn. Achieve. Repeat.</p>
                </div>
                <div className="brain-system" aria-hidden="true">
                  <div className="signal-ring" />
                  <BrainCircuit size={112} />
                </div>
              </motion.section>

              <section className="stats-grid">
                {statCards.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <motion.article
                      key={card.label}
                      className="stat-card"
                      variants={cardMotion}
                      initial="hidden"
                      animate="visible"
                      transition={{ duration: 0.42, delay: index * 0.07 }}
                      whileHover={{ y: -6 }}
                      style={{ "--card-chart": card.chart, "--card-glow": card.glow }}
                    >
                      <div className="stat-topline">
                        <span className="stat-icon">
                          <Icon size={22} />
                        </span>
                        <span>{card.label}</span>
                      </div>
                      <strong>{card.value}</strong>
                      <small>{card.meta}</small>
                      <div className="sparkline">
                        <MiniLine color={card.chart} ready={mounted} />
                      </div>
                    </motion.article>
                  );
                })}
              </section>

              <section className="analytics-row">
                <motion.article
                  className="panel focus-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.15 }}
                >
                  <div className="panel-header">
                    <h2>Focus Overview</h2>
                    <button>
                      This Week
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <div className="chart-wrap">
                    {mounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={focusData} margin={{ left: -12, right: 4, top: 8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="focusBar" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--chart-purple)" stopOpacity={1} />
                              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.5} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="var(--grid-line)" vertical={false} />
                          <XAxis
                            dataKey="day"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                            tickFormatter={(value) => `${value}h`}
                          />
                          <Tooltip
                            cursor={{ fill: "var(--hover-layer)" }}
                            contentStyle={{
                              background: "var(--panel-strong)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              color: "var(--color-text)"
                            }}
                          />
                          <Bar dataKey="hours" fill="url(#focusBar)" radius={[6, 6, 2, 2]} barSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="chart-placeholder" />
                    )}
                  </div>
                </motion.article>

                <motion.article
                  className="panel distractions-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.22 }}
                >
                  <div className="panel-header">
                    <h2>Top Distractions</h2>
                    <button>View All</button>
                  </div>
                  <div className="distraction-list">
                    {distractions.map((item) => {
                      const Icon = item.icon;
                      return (
                        <div className="distraction-item" key={item.name}>
                          <span className="app-icon" style={{ "--app-tone": item.tone }}>
                            <Icon size={16} />
                          </span>
                          <div>
                            <span>{item.name}</span>
                            <div className="meter">
                              <i style={{ width: `${item.value}%`, "--meter": item.tone }} />
                            </div>
                          </div>
                          <small>{item.time}</small>
                        </div>
                      );
                    })}
                  </div>
                </motion.article>
              </section>

              <section className="bottom-row">
                <motion.article
                  className="panel todo-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.28 }}
                >
                  <div className="panel-header">
                    <h2>Pending Tasks</h2>
                    <Link className="add-button add-task-link" href={todoAppUrl}>
                      <Plus size={14} />
                      Open Todo
                    </Link>
                  </div>
                  <div className="todo-list">
                    {dashboardTodoLoading ? (
                      <div className="todo-empty-row">Syncing pending tasks...</div>
                    ) : dashboardTodoError ? (
                      <div className="todo-empty-row">{dashboardTodoError}</div>
                    ) : dashboardPendingTodos.length ? (
                      dashboardPendingTodos.map((item) => (
                        <Link className="todo-item dashboard-pending-item" key={item.id} href={todoAppUrl}>
                          <span className="check-box" />
                          <p>{item.task}</p>
                          <em className={`priority priority-${String(item.priority).toLowerCase()}`}>
                            {item.priority || "Medium"}
                          </em>
                          <small>{item.selectedDate === formatDateKey() ? "Today" : item.selectedDate}</small>
                        </Link>
                      ))
                    ) : (
                      <Link className="todo-empty-row todo-empty-link" href={todoAppUrl}>
                        No pending tasks. Add a clean plan for today.
                      </Link>
                    )}
                  </div>
                </motion.article>

                <motion.article
                  className="panel goals-panel"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.34 }}
                >
                  <div className="panel-header">
                    <h2>Monthly Goal Progress</h2>
                    <button>View All</button>
                  </div>
                  <div className="goal-list">
                    {goals.map((goal) => (
                      <div className="goal-item" key={goal.label}>
                        <span className="goal-icon" style={{ "--goal-tone": goal.accent }}>
                          <Trophy size={17} />
                        </span>
                        <div>
                          <p>{goal.label}</p>
                          <div className="meter goal-meter">
                            <i style={{ width: `${goal.progress}%`, "--meter": goal.accent }} />
                          </div>
                          <small>14 days left</small>
                        </div>
                        <strong>{goal.progress}%</strong>
                      </div>
                    ))}
                  </div>
                </motion.article>
              </section>
            </div>

            <motion.aside
              className="ai-panel"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <div className="ai-header">
                <div>
                  <Sparkles size={24} />
                  <h2>SYNAPSE AI</h2>
                </div>
                <ChevronUp size={18} />
              </div>

              <div className="chat-stream">
                {messages.map((message, index) => (
                  <motion.div
                    key={`${message.text}-${index}`}
                    className={`message ${message.side === "user" ? "from-user" : "from-ai"}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 + index * 0.06 }}
                  >
                    <p>
                      {message.checked ? (
                        <span className="inline-check">
                          <Check size={13} />
                        </span>
                      ) : null}
                      {message.text}
                    </p>
                    <small>{message.time}</small>
                  </motion.div>
                ))}
              </div>

              <div className="quick-actions">
                <button>
                  <CheckSquare size={15} />
                  Show today's tasks
                </button>
                <button>
                  <BarChart3 size={15} />
                  My progress
                </button>
              </div>

              <label className="composer">
                <Bot size={18} />
                <input aria-label="Ask SYNAPSE AI" placeholder="Ask me anything..." />
                <button aria-label="Send message">
                  <Send size={20} />
                </button>
              </label>
              <small className="ai-note">SYNAPSE AI can make mistakes. Verify important info.</small>
            </motion.aside>
          </div>
        </section>
      </div>
      </main>
    </ProtectedRoute>
  );
}
