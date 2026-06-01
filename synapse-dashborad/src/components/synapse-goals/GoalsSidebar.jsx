"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  LockKeyhole,
  Settings,
  Sparkles,
  Target
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "SYNAPSE AI", icon: Sparkles, href: "/synapse-ai" },
  { label: "Focus Lock", icon: LockKeyhole, href: "/focus" },
  { label: "To-Do List", icon: CheckSquare, href: "/todo" },
  { label: "Goals", icon: Target, href: "/goals", active: true },
  { label: "Analytics", icon: BarChart3, href: "/analytics" },
  { label: "Resources", icon: FolderOpen, href: "/resources" },
  { label: "Settings", icon: Settings, href: "/settings" }
];

export default function GoalsSidebar({ open = false, onNavigate }) {
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

      <nav className="side-nav" aria-label="Goals sections">
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
        <button className="support-button" type="button">
          <HelpCircle size={18} />
          Help & Support
        </button>
      </div>
    </motion.aside>
  );
}
