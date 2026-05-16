"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Flame,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  Sparkles,
  Target,
  Timer
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "FocusLock", icon: LockKeyhole, href: "#" },
  { label: "To-Do List", icon: CheckSquare, href: "/todo", active: true },
  { label: "Goals", icon: Target, href: "#" },
  { label: "Focus Sessions", icon: Timer, href: "#" },
  { label: "Analytics", icon: BarChart3, href: "#" },
  { label: "AI Assistant", icon: Sparkles, href: "#" },
  { label: "Calendar", icon: CalendarDays, href: "#" },
  { label: "Resources", icon: FolderOpen, href: "#" },
  { label: "Settings", icon: Settings, href: "#" }
];

export default function TodoSidebar() {
  return (
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

      <nav className="side-nav" aria-label="Todo sections">
        {navItems.map((item) => {
          const Icon = item.icon;

          return (
            <motion.div key={item.label} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}>
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

        <button className="support-button" type="button">
          <HelpCircle size={18} />
          Help & Support
        </button>
      </div>
    </motion.aside>
  );
}
