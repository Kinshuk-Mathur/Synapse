"use client";

import { useEffect, useState } from "react";

export function useSynapseTheme() {
  const [theme, setTheme] = useState("obsidian");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("synapse-theme") || "obsidian";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const applyTheme = (nextTheme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("synapse-theme", nextTheme);
  };

  return {
    theme,
    applyTheme
  };
}
