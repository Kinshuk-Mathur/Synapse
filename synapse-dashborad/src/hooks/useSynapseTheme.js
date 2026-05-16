"use client";

import { useEffect, useState } from "react";

export function useSynapseTheme(defaultTheme = "obsidian") {
  const [theme, setTheme] = useState(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("synapse-theme") || defaultTheme;
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setMounted(true);
  }, [defaultTheme]);

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("synapse-theme", nextTheme);
  };

  return {
    theme,
    mounted,
    applyTheme
  };
}
