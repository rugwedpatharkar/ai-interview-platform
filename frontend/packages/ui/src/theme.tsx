"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { cn } from "./cn.js";

function SunIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon(props: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

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
 *
 * By default it drives the local {@link ThemeProvider} (System A — localStorage key
 * `"theme"`), which the company app uses. Apps that own a different source of truth
 * (the candidate app's `aptura.appearance.v1` system) pass `isDark` + `onToggle` to
 * drive their store instead — `@ip/ui` stays app-agnostic and never imports the app.
 * When the props are supplied the toggle is treated as mounted (the caller owns
 * hydration), so the icon reflects `isDark` immediately.
 */
export function ThemeToggle({
  className,
  isDark: isDarkProp,
  onToggle,
}: {
  className?: string;
  isDark?: boolean;
  onToggle?: () => void;
}) {
  const ctx = useContext(ThemeContext);
  const controlled = onToggle !== undefined;
  // Controlled (candidate) path owns its own mount/hydration; uncontrolled (company)
  // path reads the provider. Don't call useTheme() — controlled callers may mount
  // outside a ThemeProvider.
  const mounted = controlled ? true : (ctx?.mounted ?? false);
  const isDark = controlled ? Boolean(isDarkProp) : ctx?.theme === "dark";
  const toggle = controlled ? onToggle : ctx?.toggleTheme;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mounted && isDark ? (
        <SunIcon className="size-4" aria-hidden />
      ) : (
        <MoonIcon className="size-4" aria-hidden />
      )}
    </button>
  );
}
