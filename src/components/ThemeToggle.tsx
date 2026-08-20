import { useState, useEffect } from "react";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      className="btn"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 50 }}
    >
      {theme === "dark" ? "light" : "dark"}
    </button>
  );
}
