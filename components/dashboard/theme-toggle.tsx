"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("flighttracker_theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("flighttracker_theme");
    const initial: Theme = stored === "light" || stored === "dark" ? stored : "light";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className="ghost-btn theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
    >
      {theme === "dark" ? "☀️ Claro" : "🌙 Oscuro"}
    </button>
  );
}
