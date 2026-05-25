"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  BrainCircuit,
  Check,
  CheckSquare,
  ChevronDown,
  Flame,
  FolderOpen,
  HelpCircle,
  ImagePlus,
  Instagram,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  Trophy,
  Twitter,
  X,
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
import { useMonthlyGoals } from "../hooks/useMonthlyGoals";
import { useSynapseFocus } from "../hooks/useSynapseFocus";
import { useUserStats } from "../hooks/useUserStats";
import { updateUserPersonalization } from "../services/firestore";
import {
  formatDeadlineStatus,
  getCurrentGoalMonth
} from "../services/monthlyGoals";
import { carryForwardPastTodos, formatDateKey, listenToUserTodos, lockPastTodos } from "../services/todos";

const todoAppUrl = "/todo";
const goalsAppUrl = "/goals";
const synapseAiUrl = "/synapse-ai";

const themes = [
  { id: "obsidian", name: "Obsidian Neon", tone: "Default OS" },
  { id: "midnight", name: "Midnight Tech", tone: "Deep Focus" },
  { id: "inferno", name: "Inferno Focus", tone: "Exam Sprint" },
  { id: "pink", name: "Pink Aura", tone: "Dark Bloom" }
];

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", active: true },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus" },
  { label: "To-Do List", icon: CheckSquare, href: todoAppUrl },
  { label: "Goals", icon: Target, href: goalsAppUrl },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "SYNAPSE AI", icon: Sparkles, href: synapseAiUrl },
  { label: "Resources", icon: FolderOpen, href: "#" },
  { label: "Settings", icon: Settings, href: "/settings" }
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

const goalAccents = ["var(--chart-pink)", "var(--chart-blue)", "var(--chart-gold)"];
const focusLockEmptyMessage = "Get extension from Focus Lock";

const cardMotion = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 }
};

const avatarFileTypes = ["image/png", "image/jpeg"];

function formatFocusDuration(totalSeconds = 0) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read profile image."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load profile image."));
    image.src = src;
  });
}

async function createAvatarDataUrl(file) {
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const size = 320;
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const sx = Math.max(0, (image.naturalWidth - side) / 2);
  const sy = Math.max(0, (image.naturalHeight - side) / 2);
  const context = canvas.getContext("2d");

  canvas.width = size;
  canvas.height = size;
  context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  return canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.86);
}

function getDistractionIcon(name = "") {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("youtube")) return Youtube;
  if (lowerName.includes("instagram")) return Instagram;
  if (lowerName.includes("twitter") || lowerName.includes("x ")) return Twitter;
  return MoreHorizontal;
}

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

function MomentumTimeline({ days = [] }) {
  const completedCount = days.filter((day) => day.completed).length;

  return (
    <motion.section
      className="momentum-timeline"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38 }}
      aria-label="Weekly SYNAPSE Momentum"
    >
      <div className="momentum-timeline-brand" aria-hidden="true">
        <BrainCircuit size={38} />
      </div>
      <div className="momentum-timeline-copy">
        <strong>Your Daily Momentum</strong>
        <span>Stay consistent. Build unstoppable.</span>
      </div>
      <div className="momentum-track" role="list">
        {days.map((day, index) => {
          const nextDay = days[index + 1];
          const lineActive = Boolean(day.completed && nextDay?.completed);
          const linePrimed = Boolean(day.completed && nextDay?.isCurrent);

          return (
            <div
              className={`momentum-day is-${day.state} ${day.isCurrent ? "is-current-day" : ""}`}
              key={day.dateKey}
              role="listitem"
              title={`${day.label}: ${day.completed ? "productive day complete" : day.isFuture ? "future day" : day.isCurrent ? "in progress" : "missed"}`}
            >
              <span className="momentum-node">
                {day.completed ? <Check size={13} /> : null}
                {!day.completed && index === 6 ? <Sparkles size={13} /> : null}
              </span>
              {index < days.length - 1 ? (
                <span
                  className={`momentum-connector ${lineActive ? "is-active" : ""} ${linePrimed ? "is-primed" : ""}`}
                  aria-hidden="true"
                />
              ) : null}
              <small>{day.label}</small>
            </div>
          );
        })}
      </div>
      <span className="momentum-week-count">{completedCount}/7 productive days</span>
    </motion.section>
  );
}

function MomentumExplainerModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="momentum-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.article
            className="momentum-modal"
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="momentum-modal-title"
          >
            <button className="momentum-modal-close" type="button" onClick={onClose} aria-label="Close Momentum details">
              <X size={18} />
            </button>
            <div className="momentum-modal-icon">
              <Flame size={22} />
            </div>
            <h2 id="momentum-modal-title">How SYNAPSE Momentum Works</h2>
            <p>🔥 Momentum grows when you complete a full productive day.</p>
            <span>To maintain Momentum daily:</span>
            <ul>
              <li>Complete a 15+ min focus session</li>
              <li>Finish at least 1 task</li>
              <li>Update a goal</li>
              <li>Use SYNAPSE AI meaningfully</li>
            </ul>
            <p className="momentum-reset-line">Miss even one pillar: → Momentum resets.</p>
            <strong>Consistency builds discipline.</strong>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ProfileAvatarMenu({ user, profile, studentName, onProfileUpdate }) {
  const [open, setOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [saving, setSaving] = useState(false);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const avatarSrc = profile?.avatarDataUrl || profile?.photoURL || user?.photoURL || "/assets/synapse-icon-cropped.png";
  const displayName = profile?.name || profile?.displayName || user?.displayName || studentName || "Student";

  useEffect(() => {
    if (!open) return undefined;

    const closeProfileMenu = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", closeProfileMenu);
    return () => window.removeEventListener("pointerdown", closeProfileMenu);
  }, [open]);

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const extensionOk = /\.(png|jpe?g)$/i.test(file.name);
    if (!avatarFileTypes.includes(file.type) && !extensionOk) {
      setUploadError("Use a PNG, JPEG, or JPG image.");
      return;
    }

    try {
      setSaving(true);
      setUploadError("");
      const avatarDataUrl = await createAvatarDataUrl(file);
      const nextProfile = await updateUserPersonalization(user.uid, {
        avatarDataUrl,
        photoURL: avatarDataUrl,
        name: profile?.name || user?.displayName?.split(" ")[0] || "Student"
      });
      onProfileUpdate(nextProfile);
    } catch (error) {
      setUploadError(error.message || "Could not update profile image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-avatar-menu" ref={menuRef}>
      <motion.button
        className="profile-avatar-trigger"
        type="button"
        aria-label="Open profile menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        whileHover={{ y: -2, scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
      >
        <img src={avatarSrc} alt="" />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="profile-avatar-card"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
          >
            <div className="profile-avatar-preview">
              <img src={avatarSrc} alt="" />
              <button
                type="button"
                aria-label="Change profile picture"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="profile-avatar-copy">
              <strong>{displayName}</strong>
              <span>Focus Mode</span>
            </div>
            <button
              className="profile-avatar-upload"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={saving}
            >
              <ImagePlus size={15} />
              <span>{saving ? "Updating..." : "Edit photo"}</span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              onChange={handleAvatarFile}
            />
            {uploadError ? <p className="profile-avatar-error">{uploadError}</p> : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [theme, setTheme] = useState("obsidian");
  const [mounted, setMounted] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [dashboardTodos, setDashboardTodos] = useState([]);
  const [dashboardTodoLoading, setDashboardTodoLoading] = useState(true);
  const [dashboardTodoError, setDashboardTodoError] = useState("");
  const [momentumModalOpen, setMomentumModalOpen] = useState(false);
  const { user, logout, profile, setProfile } = useAuth();
  const currentGoalMonth = useMemo(() => getCurrentGoalMonth(), []);
  const {
    selectedGoals: dashboardGoals,
    monthStats: dashboardGoalStats,
    loading: dashboardGoalLoading,
    error: dashboardGoalError
  } = useMonthlyGoals(currentGoalMonth.month, currentGoalMonth.year);
  const {
    stats: userStats,
    weeklyProgress,
    loading: userStatsLoading,
    error: userStatsError
  } = useUserStats();
  const {
    summary: focusSummary,
    loading: focusLoading,
    error: focusError,
    bridgeStatus: focusBridgeStatus
  } = useSynapseFocus(user);

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

  useEffect(() => {
    if (!momentumModalOpen) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setMomentumModalOpen(false);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [momentumModalOpen]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const studentName = profile?.name || user?.displayName?.split(" ")[0] || "STUDENT";
  const mainGoalText = Array.isArray(profile?.mainGoal)
    ? profile.mainGoal.slice(0, 2).join(" + ")
    : profile?.mainGoal;

  useEffect(() => {
    if (!user?.uid) {
      setDashboardTodos([]);
      setDashboardTodoLoading(false);
      return undefined;
    }

    setDashboardTodoLoading(true);

    return listenToUserTodos(
      user.uid,
      async (nextTodos) => {
        setDashboardTodos(nextTodos);
        setDashboardTodoError("");
        setDashboardTodoLoading(false);

        try {
          await lockPastTodos(nextTodos);
          await carryForwardPastTodos(user.uid, nextTodos);
        } catch (todoSyncError) {
          setDashboardTodoError(todoSyncError.message || "Unable to sync pending tasks.");
        }
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
        .filter((item) => !item.completed && item.status !== "carried" && item.selectedDate <= formatDateKey())
        .sort((a, b) => String(a.selectedDate).localeCompare(String(b.selectedDate))),
    [dashboardTodos]
  );

  const dashboardTodayComplete = useMemo(() => {
    const todayTodos = dashboardTodos.filter((item) => item.selectedDate === formatDateKey());
    return todayTodos.length > 0 && todayTodos.every((item) => item.completed);
  }, [dashboardTodos]);

  const dashboardGoalItems = useMemo(
    () =>
      dashboardGoals
        .slice()
        .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
        .slice(0, 3)
        .map((goal, index) => ({
          id: goal.id,
          label: goal.title,
          progress: Number(goal.progress) || 0,
          deadlineText: formatDeadlineStatus(goal.deadlineDate || goal.deadline),
          accent: goalAccents[index] || "var(--chart-purple)"
        })),
    [dashboardGoals]
  );

  const currentGoalStats = dashboardGoalStats.get(`${currentGoalMonth.year}-${currentGoalMonth.month}`) || {
    total: 0,
    completed: 0,
    averageProgress: 0
  };
  const hasFocusLockActivity = Boolean(
    (focusSummary.recentSessions?.length || 0) ||
    focusSummary.totalFocusSeconds ||
    focusSummary.sessionsCompleted ||
    focusSummary.blockedDistractions ||
    focusSummary.blockedDistractionsToday ||
    focusSummary.topDistractions?.length
  );

  const openGoalsPage = () => {
    router.push(goalsAppUrl);
  };

  const handleGoalsCardKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openGoalsPage();
    }
  };

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

    return baseStatCards.map((card) => {
      if (card.label === "Focus Time Today") {
        return {
          ...card,
          value: focusLoading ? "Syncing" : formatFocusDuration(focusSummary.focusSecondsToday),
          meta: focusError
            ? "Focus Lock sync unavailable"
            : focusBridgeStatus === "connected"
            ? "Live from Focus Lock"
            : hasFocusLockActivity
            ? "Open extension to sync"
            : focusLockEmptyMessage
        };
      }

      if (card.label === "Tasks Completed") {
        return {
          ...card,
          value: dashboardTodoLoading ? "... / ..." : `${completedToday} / ${todayTodos.length}`,
          meta: todoMeta
        };
      }

      if (card.label === "Focus Score") {
        return {
          ...card,
          value: focusLoading ? "--" : `${focusSummary.productivityScore || 0}%`,
          meta: hasFocusLockActivity
            ? focusSummary.currentStreak > 0
              ? `${focusSummary.currentStreak}-day focus rhythm`
              : "No focus score yet"
            : focusLockEmptyMessage
        };
      }

      if (card.label === "Blocked Distractions") {
        return {
          ...card,
          value: focusLoading ? "--" : String(focusSummary.blockedDistractionsToday),
          meta: focusSummary.blockedDistractionsToday > 0 ? "Protected by Focus Lock" : "No attempts today"
        };
      }

      return card;
    });
  }, [
    dashboardTodoError,
    dashboardTodoLoading,
    dashboardTodos,
    focusBridgeStatus,
    focusError,
    hasFocusLockActivity,
    focusLoading,
    focusSummary
  ]);

  const handleLogout = async () => {
    try {
      setLogoutError("");
      await logout();
    } catch (error) {
      setLogoutError(error.message || "Logout failed. Please try again.");
    }
  };

  const focusChartData = hasFocusLockActivity ? focusSummary.weeklyData || [] : [];
  const dashboardDistractions = focusSummary.topDistractions?.length
    ? focusSummary.topDistractions.map((item, index, list) => {
        const Icon = getDistractionIcon(item.name);
        const maxCount = Math.max(...list.map((entry) => entry.count), 1);
        const tones = ["var(--chart-red)", "var(--chart-pink)", "var(--chart-orange)", "var(--chart-blue)", "var(--color-muted)"];

        return {
          name: item.name,
          time: `${item.count} blocked`,
          value: Math.max(14, Math.round((item.count / maxCount) * 100)),
          icon: Icon,
          tone: tones[index] || "var(--color-muted)"
        };
      })
    : [];

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
            <motion.button
              className="momentum-card"
              type="button"
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMomentumModalOpen(true)}
            >
              <span>SYNAPSE Momentum</span>
              <strong>
                <Flame size={34} />
                <b>{userStatsLoading ? "--" : userStats.currentMomentum || 0}</b>
              </strong>
              <p>{userStatsError ? "Momentum sync unavailable" : "Consistency compounds."}</p>
              <em>Longest: {userStatsLoading ? "--" : userStats.longestMomentum || 0} days</em>
            </motion.button>

            <button className="support-button">
              <HelpCircle size={18} />
              Help & Support
            </button>
          </div>
        </motion.aside>

        <section className="workspace">
          <header className="topbar">
            <MomentumTimeline days={weeklyProgress} />

            <div className="top-actions">
              <ThemeSwitcher theme={theme} onChange={applyTheme} />
              <button className="icon-button notification" aria-label="Notifications">
                <Bell size={20} />
                <span>3</span>
              </button>
              <ProfileAvatarMenu
                user={user}
                profile={profile}
                studentName={studentName}
                onProfileUpdate={setProfile}
              />
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
                  <h1>{greeting}, {studentName}!</h1>
                  <p>
                    {mainGoalText
                      ? `Your workspace is tuned for ${mainGoalText}.`
                      : "Focus. Learn. Achieve. Repeat."}
                  </p>
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
                    {focusLoading || !mounted ? (
                      <div className="chart-placeholder" />
                    ) : hasFocusLockActivity ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={focusChartData} margin={{ left: -12, right: 4, top: 8, bottom: 0 }}>
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
                      <Link className="dashboard-focus-empty dashboard-focus-empty-link" href="/focus">
                        <ShieldCheck size={18} />
                        <span>{focusLockEmptyMessage}</span>
                      </Link>
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
                    {focusLoading ? (
                      <div className="dashboard-focus-empty">Syncing Focus Lock...</div>
                    ) : dashboardDistractions.length ? (
                      dashboardDistractions.map((item) => {
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
                      })
                    ) : hasFocusLockActivity ? (
                      <div className="dashboard-focus-empty">No distractions blocked yet.</div>
                    ) : (
                      <Link className="dashboard-focus-empty dashboard-focus-empty-link" href="/focus">
                        <ShieldCheck size={18} />
                        <span>{focusLockEmptyMessage}</span>
                      </Link>
                    )}
                  </div>
                </motion.article>
              </section>

            </div>

            <motion.aside
              className="dashboard-side-column"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              <motion.article
                className="panel todo-panel dashboard-side-panel"
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
                      {dashboardTodayComplete
                        ? "Hooray, you completed all your tasks today."
                        : "No pending tasks. Add a clean plan for today."}
                    </Link>
                  )}
                </div>
              </motion.article>

              <motion.article
                className="panel goals-panel dashboard-side-panel is-clickable"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.34 }}
                whileHover={{ y: -6, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                role="link"
                tabIndex={0}
                onClick={openGoalsPage}
                onKeyDown={handleGoalsCardKeyDown}
              >
                <div className="panel-header">
                  <h2>Monthly Goal Progress</h2>
                  <span className="panel-action-text">{currentGoalStats.averageProgress}% synced</span>
                </div>
                <div className="goal-list">
                  {dashboardGoalLoading ? (
                    <div className="dashboard-goals-empty">Syncing monthly goals...</div>
                  ) : dashboardGoalError ? (
                    <div className="dashboard-goals-empty">{dashboardGoalError}</div>
                  ) : dashboardGoalItems.length ? (
                    dashboardGoalItems.map((goal) => (
                      <div className="goal-item" key={goal.id}>
                        <span className="goal-icon" style={{ "--goal-tone": goal.accent }}>
                          <Trophy size={17} />
                        </span>
                        <div>
                          <p>{goal.label}</p>
                          <div className="meter goal-meter">
                            <i style={{ width: `${goal.progress}%`, "--meter": goal.accent }} />
                          </div>
                          <small>{goal.deadlineText}</small>
                        </div>
                        <strong>{goal.progress}%</strong>
                      </div>
                    ))
                  ) : (
                    <div className="dashboard-goals-empty">No goals for this month yet.</div>
                  )}
                </div>
              </motion.article>
            </motion.aside>
          </div>
        </section>
      </div>
      <MomentumExplainerModal open={momentumModalOpen} onClose={() => setMomentumModalOpen(false)} />
      </main>
    </ProtectedRoute>
  );
}
