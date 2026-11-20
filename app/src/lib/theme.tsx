import { useCallback, useEffect, useState } from "react";

/**
 * Light / dark theme toggle.
 *
 * The inline script in index.html picks the starting theme before first paint (saved choice,
 * else the device setting; /embed/* always stays light) and sets the .dark class on <html>.
 * This hook starts from that class, so the rule lives in one place. Here we only handle the
 * header toggle and follow device changes until the visitor has picked a theme.
 */
export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "jj-theme"; // also read by the inline script in index.html
const THEME_COLOR: Record<Theme, string> = { light: "#ffffff", dark: "#020817" };

function hasStoredChoice(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    return false; // storage blocked (private mode): keep following the device
  }
}

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light");

  useEffect(() => apply(theme), [theme]);

  useEffect(() => {
    const q = darkQuery();
    const onChange = () => {
      if (!hasStoredChoice()) setTheme(q.matches ? "dark" : "light");
    };
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch { /* not remembered, still switches for this visit */ }
      return next;
    });
  }, []);

  return { theme, toggle };
}
