"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckSquare,
  Compass,
  FileStack,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Rocket,
  Settings,
  Sparkles,
  Target,
  WandSparkles
} from "lucide-react";
import NotificationCenter from "../../components/NotificationCenter";
import ProfileAvatarMenu from "../../components/ProfileAvatarMenu";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import { useSynapseTheme } from "../../hooks/useSynapseTheme";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "SYNAPSE AI", icon: Sparkles, href: "/synapse-ai" },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus" },
  { label: "To-Do List", icon: CheckSquare, href: "/todo" },
  { label: "Goals", icon: Target, href: "/goals" },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "Resources", icon: FolderOpen, href: "/resources", active: true },
  { label: "Settings", icon: Settings, href: "/settings" }
];

const resourcePreviewCards = [
  {
    title: "Study Packs",
    detail: "Chapter-wise notes, revision maps, and exam-ready summaries.",
    status: "Curating",
    icon: BookOpenCheck,
    tone: "var(--chart-pink)"
  },
  {
    title: "Focus Templates",
    detail: "Deep-work rituals, blocker lists, and sprint planners.",
    status: "Designing",
    icon: Compass,
    tone: "var(--chart-blue)"
  },
  {
    title: "AI Prompt Kits",
    detail: "Reusable prompts for practice, doubt solving, and recall.",
    status: "Training",
    icon: BrainCircuit,
    tone: "var(--chart-gold)"
  },
  {
    title: "Exam Playbooks",
    detail: "Roadmaps for boards, JEE, NEET, coding, and skill tracks.",
    status: "Mapping",
    icon: GraduationCap,
    tone: "var(--color-lime)"
  }
];

const resourceSignals = ["Notes", "Templates", "Prompt kits", "Roadmaps", "Practice sets", "Focus flows"];

function ResourcesSidebar({ open = false, onNavigate }) {
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

      <nav className="side-nav" aria-label="Resources sections">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <motion.div key={item.label} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
              <Link href={item.href} className={`nav-item ${item.active ? "is-active" : ""}`} onClick={onNavigate}>
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="side-footer">
        <button className="support-button" type="button">
          <HelpCircle size={18} />
          Help & Support
        </button>
      </div>
    </motion.aside>
  );
}

function ResourcePreviewCard({ item, index }) {
  const Icon = item.icon;

  return (
    <motion.article
      className="resource-preview-card"
      style={{ "--resource-card-tone": item.tone }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: 0.14 + index * 0.05 }}
      whileHover={{ y: -5 }}
    >
      <div className="resource-card-icon">
        <Icon size={21} />
      </div>
      <div>
        <span>{item.status}</span>
        <h3>{item.title}</h3>
        <p>{item.detail}</p>
      </div>
    </motion.article>
  );
}

function ResourceLabVisual() {
  return (
    <motion.div
      className="resource-lab-visual"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.42, delay: 0.12 }}
      aria-label="Resources vault preview"
    >
      <div className="resource-lab-header">
        <span>
          <FolderOpen size={16} />
          Resource vault
        </span>
        <strong>Opening soon</strong>
      </div>

      <div className="resource-vault-stack">
        <motion.div
          className="resource-vault-panel is-front"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="resource-logo-chip">
            <Image src="/assets/synapse-icon-transparent.png" alt="" width={54} height={54} />
          </div>
          <div className="resource-loader-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <b>COMING SOON</b>
          <p>Something smarter for your study flow is being assembled here.</p>
        </motion.div>

        <div className="resource-vault-panel is-back" aria-hidden="true" />
        <div className="resource-vault-panel is-shadow" aria-hidden="true" />
      </div>

      <div className="resource-signal-grid" aria-hidden="true">
        {resourceSignals.map((signal, index) => (
          <motion.span
            key={signal}
            initial={{ opacity: 0.42 }}
            animate={{ opacity: [0.42, 1, 0.42] }}
            transition={{ duration: 2.8, delay: index * 0.18, repeat: Infinity }}
          >
            {signal}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

function ResourcesWorkspace() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  useSynapseTheme();
  const { user, profile, setProfile, logout } = useAuth();
  const studentName = profile?.name || user?.displayName?.split(" ")[0] || "STUDENT";
  const handleLogout = async () => {
    try {
      setActionError("");
      await logout();
    } catch (error) {
      setActionError(error.message || "Logout failed. Please try again.");
    }
  };

  return (
    <main className="site-shell resources-shell">
      <div className="ambient-grid" aria-hidden="true" />

      <div className="dashboard-frame resources-dashboard-frame">
        <button
          className={`sidebar-scrim ${navigationOpen ? "is-visible" : ""}`}
          type="button"
          aria-label="Close navigation"
          onClick={() => setNavigationOpen(false)}
        />

        <ResourcesSidebar open={navigationOpen} onNavigate={() => setNavigationOpen(false)} />

        <section className="workspace resources-workspace">
          <header className="resources-topbar">
            <div className="resources-title-block">
              <button
                className="icon-button app-sidebar-toggle"
                type="button"
                aria-label="Open navigation"
                aria-expanded={navigationOpen}
                onClick={() => setNavigationOpen(true)}
              >
                <Menu size={22} />
              </button>
              <div>
                <motion.span
                  className="resources-eyebrow"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Rocket size={15} />
                  Coming soon
                </motion.span>
                <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
                  Wait here. Something useful is coming soon.
                </motion.h1>
              </div>
            </div>

            <div className="resources-top-actions">
              <ProfileAvatarMenu
                user={user}
                profile={profile}
                studentName={studentName}
                modeLabel="Resource Mode"
                onProfileUpdate={setProfile}
              />
              <NotificationCenter />
              <button className="logout-button" type="button" onClick={handleLogout}>
                <LogOut size={17} />
                <span>Logout</span>
              </button>
            </div>
          </header>

          {actionError ? (
            <motion.p
              className="topbar-error"
              role="alert"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {actionError}
            </motion.p>
          ) : null}

          <section className="resources-hero">
            <motion.div
              className="resources-hero-copy"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <span className="resources-status-pill">
                <WandSparkles size={16} />
                The resource vault is being crafted
              </span>
              <h2>Notes, prompts, templates, and exam maps will live here.</h2>
              <p>
                This space is being built as a clean library for the materials that help you move faster: study packs,
                focus systems, AI prompts, and roadmaps that fit your goals.
              </p>
              <div className="resources-hero-actions">
                <Link href="/synapse-ai">
                  <Sparkles size={18} />
                  Ask SYNAPSE AI
                </Link>
                <Link href="/goals">
                  <Target size={18} />
                  Plan Goals
                </Link>
              </div>
            </motion.div>

            <ResourceLabVisual />
          </section>

          <section className="resource-preview-grid" aria-label="Upcoming resource categories">
            {resourcePreviewCards.map((item, index) => (
              <ResourcePreviewCard key={item.title} item={item} index={index} />
            ))}
          </section>

          <motion.section
            className="resources-bottom-band"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: 0.28 }}
          >
            <div>
              <FileStack size={21} />
              <span>Next drop</span>
            </div>
            <strong>Curated learning material, not random links.</strong>
            <p>Resources will be organized around the way SYNAPSE already tracks focus, goals, todos, and AI study context.</p>
          </motion.section>
        </section>
      </div>
    </main>
  );
}

export default function ResourcesPage() {
  return (
    <ProtectedRoute>
      <ResourcesWorkspace />
    </ProtectedRoute>
  );
}
