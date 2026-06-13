"use client";

import { useEffect, useState } from "react";

const themeAliases = {
  "obsidian-neon": "obsidian",
  "midnight-tech": "midnight",
  "inferno-focus": "inferno",
  "pink-aura": "pink"
};

function normalizeTheme(theme, fallback = "obsidian") {
  return themeAliases[theme] || theme || fallback;
}

export function useSynapseTheme(defaultTheme = "obsidian") {
  const [theme, setTheme] = useState(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = normalizeTheme(window.localStorage.getItem("synapse-theme"), defaultTheme);
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    window.localStorage.setItem("synapse-theme", savedTheme);
    setMounted(true);
  }, [defaultTheme]);

  const applyTheme = (nextTheme) => {
    const normalizedTheme = normalizeTheme(nextTheme, defaultTheme);
    setTheme(normalizedTheme);
    document.documentElement.dataset.theme = normalizedTheme;
    window.localStorage.setItem("synapse-theme", normalizedTheme);
    window.dispatchEvent(new CustomEvent("synapse-theme-change", { detail: { theme: normalizedTheme } }));
  };

  return {
    theme,
    mounted,
    applyTheme
  };
}
