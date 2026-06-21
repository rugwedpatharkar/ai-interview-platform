"use client";

import { ThemeToggle } from "@ip/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  APPEARANCE_QUERY_KEY,
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  type AppearancePrefs,
} from "../app/settings/appearance-client";

/**
 * Header light/dark toggle for the candidate app — the SINGLE source of truth is System B
 * (`aptura.appearance.v1`), the same store the pre-paint `appearanceScript` and the
 * Settings → Appearance tab read/write. `@ip/ui`'s `ThemeToggle` can't import the app, so we
 * wrap it and pass the resolved `isDark` + an `onToggle` that drives System B.
 *
 * Flip is binary by design: it never sets "system" (that mode stays available only in the
 * Settings tab). A "system"-resolved-dark click therefore lands on explicit "light", and
 * vice-versa — the resolved theme is what the user sees, so that's what we invert.
 */

function resolvedDark(prefs: AppearancePrefs): boolean {
  if (prefs.mode === "system") {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }
  return prefs.mode === "dark";
}

function readPrefs(): AppearancePrefs {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs>;
    return { ...DEFAULT_APPEARANCE, ...parsed };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function AppearanceToggle({ className }: { className?: string }) {
  const qc = useQueryClient();
  // SSR + first client render must agree; the pre-paint script already set the real <html>
  // class, so showing the default (light) icon for one frame is invisible. We adopt the real
  // value in the mount effect, mirroring @ip/ui's own `mounted` gate.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(resolvedDark(readPrefs()));
    // Keep in sync when the Settings tab (or another browser tab) writes the key.
    const onStorage = (e: StorageEvent) => {
      if (e.key === APPEARANCE_STORAGE_KEY) setIsDark(resolvedDark(readPrefs()));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onToggle = useCallback(() => {
    const prev = readPrefs();
    const next: AppearancePrefs = {
      ...prev,
      mode: resolvedDark(prev) ? "light" : "dark",
    };
    applyAppearance(next);
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private-mode browsers throw on setItem — the visual change already applied.
    }
    // Keep an open Settings → Appearance tab in lockstep within this tab (storage events
    // don't fire in the originating tab).
    qc.setQueryData(APPEARANCE_QUERY_KEY, next);
    setIsDark(next.mode === "dark");
  }, [qc]);

  return <ThemeToggle className={className} isDark={isDark} onToggle={onToggle} />;
}
