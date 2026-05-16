"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

const themes = [
  { id: "obsidian", name: "Obsidian Neon", tone: "Default OS" },
  { id: "midnight", name: "Midnight Tech", tone: "Deep Focus" },
  { id: "inferno", name: "Inferno Focus", tone: "Exam Sprint" },
  { id: "pink", name: "Pink Aura", tone: "Dark Bloom" }
];

export default function TodoThemeSwitcher({ theme, onChange }) {
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
        type="button"
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
                type="button"
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
