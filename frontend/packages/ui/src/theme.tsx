"use client";

import { Moon, Sun } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { cn } from "./cn.js";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  /** The active theme. During SSR / before mount this is the provider default. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  /** False until the client has mounted and read localStorage. */
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script string for the document <head>. Apps drop this in a
 * `<script dangerouslySetInnerHTML>` BEFORE paint so the persisted theme class
 * is on <html> before React hydrates — no flash of the wrong theme.
 * Mirrors the resolution order used by ThemeProvider (localStorage → media query).
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var e=document.documentElement;e.classList.toggle('dark',t==='dark');e.style.colorScheme=t;}catch(_){}})();`;

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.style.colorScheme = theme;
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  // SSR and the first client render both use defaultTheme so the markup matches;
  // the real (possibly dark) theme is adopted in the mount effect below. The
  // pre-paint script has already set the <html> class, so there's no visual flash —
  // this only gates React state to keep hydration stable.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme());
    setMounted(true);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private-mode / disabled storage: theme still applies for this session.
    }
  }, []);

  const toggleTheme = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * Icon button that flips light/dark. Renders a stable placeholder until mounted
 * so SSR markup matches the first client render.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mounted && isDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  );
}
