"use client";

import { useEffect } from "react";

const CUSTOM_CURSOR_DELAY_MS = 600;

export default function CustomCursor() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) {
      return undefined;
    }

    const root = document.documentElement;
    const timer = window.setTimeout(() => {
      root.classList.add("synapse-custom-cursor");
    }, CUSTOM_CURSOR_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      root.classList.remove("synapse-custom-cursor");
    };
  }, []);

  return null;
}
