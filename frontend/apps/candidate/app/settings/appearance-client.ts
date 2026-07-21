// Typed seam for per-user appearance (theme mode + base palette + accent). Wired 2026-06-21 to
// `admin.preferences.v1.PreferencesService.{GetAppearance, UpdateAppearance}` on the admin
// transport. The shape on the wire is camelCase via protobuf-es (`accentHue`); the FE keeps the
// same field names. NEXT_PUBLIC_MOCK=1 falls back to a localStorage-only client for offline dev.

import { useMemo } from "react";
import type { AdminClients } from "@ip/api-client";
import { useAuth } from "../../lib/auth";

export type ThemeMode = "system" | "light" | "dark";
/** Backend enum (wire): `midnight | azure | mint | slate`. User-facing label for `midnight` is
 *  "Aperture" — the v3 brand name. We keep the wire name so the seam is direct. */
export type BaseTheme = "midnight" | "azure" | "mint" | "slate";
/** Backend enum (wire): `cyan | lime | emerald | amber | coral | azure | custom`. */
export type AccentPreset =
  | "cyan"
  | "lime"
  | "emerald"
  | "amber"
  | "coral"
  | "azure"
  | "custom";

export interface AppearancePrefs {
  mode: ThemeMode;
  base: BaseTheme;
  accent: AccentPreset;
  /** Hue in degrees (0–359). Meaningful only when accent === "custom"; backend sends 0 otherwise. */
  accentHue: number;
}

/** The seam both the mock and the real client satisfy. `queryKey` is exposed so React Query
 *  cache reads + invalidations stay co-located with the client (one source of truth). */
export interface AppearanceClient {
  get(): Promise<AppearancePrefs>;
  set(next: AppearancePrefs): Promise<AppearancePrefs>;
  queryKey(): readonly string[];
}

export const APPEARANCE_QUERY_KEY = ["preferences", "appearance"] as const;
export const APPEARANCE_STORAGE_KEY = "aptura.appearance.v1";

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  // Light-only (2026-07-10): the app is locked to light; `mode` is retained on the wire
  // (PreferencesService enum still has system|light|dark) but has no visual effect.
  mode: "light",
  base: "midnight",
  accent: "cyan",
  accentHue: 0,
};

/** Catalog used by the swatches in the UI. The hex/oklch values are presentational only —
 *  the actual theme tokens are wired in globals.css via `[data-base="…"]` / `[data-accent="…"]`
 *  selectors. The user-facing label for "midnight" is "Aperture" — the v3 brand name. */
export const BASE_THEMES: {
  value: BaseTheme;
  label: string;
  surface: string;
  ink: string;
}[] = [
  {
    value: "midnight",
    label: "Aperture",
    surface: "oklch(0.985 0.003 215)",
    ink: "oklch(0.22 0.022 230)",
  },
  {
    value: "azure",
    label: "Azure",
    surface: "oklch(0.97 0.015 245)",
    ink: "oklch(0.22 0.05 250)",
  },
  {
    value: "mint",
    label: "Mint",
    surface: "oklch(0.985 0.015 160)",
    ink: "oklch(0.22 0.03 160)",
  },
  {
    value: "slate",
    label: "Slate",
    surface: "oklch(0.97 0.004 230)",
    ink: "oklch(0.20 0.012 230)",
  },
];

export const ACCENT_PRESETS: { value: AccentPreset; swatch: string }[] = [
  { value: "cyan", swatch: "oklch(0.55 0.12 195)" },
  { value: "lime", swatch: "oklch(0.78 0.18 125)" },
  { value: "emerald", swatch: "oklch(0.62 0.14 155)" },
  { value: "amber", swatch: "oklch(0.75 0.15 75)" },
  { value: "coral", swatch: "oklch(0.66 0.17 32)" },
  { value: "azure", swatch: "oklch(0.62 0.16 260)" },
  { value: "custom", swatch: "" },
];

const ACCENT_HUES: Record<Exclude<AccentPreset, "custom">, number> = {
  cyan: 195,
  lime: 125,
  emerald: 155,
  amber: 75,
  coral: 32,
  azure: 260,
};

/** Persist + paint. The localStorage write is best-effort (private-mode browsers throw on
 *  `setItem`) — failing storage must never block the visual update, so the throw is silenced. */
function persistLocal(prefs: AppearancePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Private-browsing mode — ignore.
  }
}

function readLocal(): AppearancePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppearancePrefs> & { customHue?: number };
    return {
      mode: (parsed.mode ?? DEFAULT_APPEARANCE.mode) as ThemeMode,
      base: (parsed.base ?? DEFAULT_APPEARANCE.base) as BaseTheme,
      accent: (parsed.accent ?? DEFAULT_APPEARANCE.accent) as AccentPreset,
      accentHue:
        typeof parsed.accentHue === "number"
          ? parsed.accentHue
          : typeof parsed.customHue === "number"
            ? parsed.customHue
            : DEFAULT_APPEARANCE.accentHue,
    };
  } catch {
    return null;
  }
}

/** Toggle <html> attributes so the token blocks in globals.css (and any future
 *  `[data-base]` / `[data-accent]` blocks) can swap palettes without a JS-driven inline style.
 *  Also writes a CSS custom property for the accent hue (preset OR custom). */
export function applyAppearance(prefs: AppearancePrefs): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // Light-only: never add the `dark` class. Clear any stale one and pin data-theme to light so
  // the token blocks resolve to the single light palette regardless of the saved `mode`.
  root.classList.remove("dark");
  root.dataset.theme = "light";

  root.dataset.base = prefs.base;
  root.dataset.accent = prefs.accent;

  // Derive the brand palette from the selected hue so every brand-tokened surface
  // (buttons, pills, accents) re-tints uniformly without per-class rewrites.
  const hue =
    prefs.accent === "custom"
      ? prefs.accentHue
      : ACCENT_HUES[prefs.accent];
  root.style.setProperty("--brand", `oklch(0.55 0.12 ${hue})`);
  root.style.setProperty("--brand-strong", `oklch(0.48 0.12 ${hue})`);
  root.style.setProperty("--brand-soft", `oklch(0.55 0.12 ${hue} / 0.12)`);
}

/** Local-only mock: persists in localStorage and re-paints on every set. Mirrors the live RPC's
 *  resolve-on-success contract so the React Query lifecycle is identical at runtime. */
export function makeMockAppearanceClient(): AppearanceClient {
  let prefs: AppearancePrefs = readLocal() ?? DEFAULT_APPEARANCE;
  return {
    get: async () => prefs,
    set: async (next) => {
      prefs = next;
      persistLocal(next);
      applyAppearance(next);
      return prefs;
    },
    queryKey: () => APPEARANCE_QUERY_KEY,
  };
}

/** Real client backed by `admin.preferences.v1.PreferencesService`. The shape on the wire is a
 *  flat `Appearance{mode, base, accent, accentHue}` — direct pass-through, no field mapping. */
export function makeApiAppearanceClient(api: AdminClients): AppearanceClient {
  return {
    get: async () => {
      const a = await api.preferences.getAppearance({});
      const prefs: AppearancePrefs = {
        mode: (a.mode || DEFAULT_APPEARANCE.mode) as ThemeMode,
        base: (a.base || DEFAULT_APPEARANCE.base) as BaseTheme,
        accent: (a.accent || DEFAULT_APPEARANCE.accent) as AccentPreset,
        accentHue: a.accentHue,
      };
      // Mirror to localStorage so the pre-paint script picks it up next load.
      persistLocal(prefs);
      return prefs;
    },
    set: async (next) => {
      const a = await api.preferences.updateAppearance({
        mode: next.mode,
        base: next.base,
        accent: next.accent,
        // Backend ignores hue unless accent === "custom"; safe to always send the FE value.
        accentHue: next.accentHue,
      });
      const prefs: AppearancePrefs = {
        mode: (a.mode || next.mode) as ThemeMode,
        base: (a.base || next.base) as BaseTheme,
        accent: (a.accent || next.accent) as AccentPreset,
        accentHue: a.accentHue,
      };
      persistLocal(prefs);
      applyAppearance(prefs);
      return prefs;
    },
    queryKey: () => APPEARANCE_QUERY_KEY,
  };
}

/** Hook: returns the live appearance client. */
export function useAppearanceClient(): AppearanceClient {
  const { api } = useAuth();
  return useMemo(() => makeApiAppearanceClient(api), [api]);
}

/** No-arg factory for tests / Storybook. */
export function makeAppearanceClient(): AppearanceClient {
  return makeMockAppearanceClient();
}

/**
 * Pre-paint inline script — light-only. If mounted in <head> before hydration it only ever
 * ensures light (clears any stale `dark` class, pins colorScheme/data-theme to light) and paints
 * the base/accent palette from APPEARANCE_STORAGE_KEY. Retained as a stable export; currently
 * unmounted (layout.tsx no longer injects it), so it is effectively a no-op safeguard.
 */
export const appearanceScript = `(function(){try{
var raw=localStorage.getItem(${JSON.stringify(APPEARANCE_STORAGE_KEY)});
var p=${JSON.stringify(DEFAULT_APPEARANCE)};
if(raw){try{var j=JSON.parse(raw);if(j&&typeof j==='object'){p=Object.assign(p,j);if(typeof j.customHue==='number'&&typeof j.accentHue!=='number')p.accentHue=j.customHue;}}catch(_){}}
var r=document.documentElement;
r.classList.remove('dark');
r.dataset.theme='light';
r.style.colorScheme='light';
r.dataset.base=p.base;
r.dataset.accent=p.accent;
var hueMap={cyan:195,lime:125,emerald:155,amber:75,coral:32,azure:260};
var h=p.accent==='custom'?p.accentHue:hueMap[p.accent];if(typeof h!=='number')h=195;
r.style.setProperty('--brand','oklch(0.55 0.12 '+h+')');
r.style.setProperty('--brand-strong','oklch(0.48 0.12 '+h+')');
r.style.setProperty('--brand-soft','oklch(0.55 0.12 '+h+' / 0.12)');
}catch(_){}})();`;
