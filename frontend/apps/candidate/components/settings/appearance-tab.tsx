"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import {
  BASE_THEMES,
  DEFAULT_APPEARANCE,
  applyAppearance,
  useAppearanceClient,
  type AccentPreset,
  type AppearanceClient,
  type AppearancePrefs,
  type BaseTheme,
  type ThemeMode,
} from "../../app/settings/appearance-client";

/** Shared Appearance subsection — mounted by both the candidate and company settings pages.
 *  Persists to localStorage so the choice survives a refresh before the backend RPC lands,
 *  and applies the chosen tokens to <html> via data-theme / data-base so the
 *  global token blocks can swap. The seam (AppearanceClient) is a typed interface; the real
 *  RPC (`admin.preferences.v1.PreferencesService.{GetAppearance, UpdateAppearance}`) drops in
 *  by swapping the factory — no component edits. */
export function AppearanceTab({
  client: providedClient,
}: {
  client?: AppearanceClient;
} = {}) {
  const qc = useQueryClient();
  // The hook returns the live (or mock) client; `providedClient` lets tests inject a fake.
  const liveClient = useAppearanceClient();
  const client = useMemo(() => providedClient ?? liveClient, [providedClient, liveClient]);
  const key = client.queryKey();

  const q = useQuery({
    queryKey: key,
    queryFn: () => client.get(),
    // Sensible local default so first paint matches the user's previous choice.
    initialData: DEFAULT_APPEARANCE,
    staleTime: Infinity,
  });
  const prefs = q.data ?? DEFAULT_APPEARANCE;

  // Re-apply on every prefs change so the page reflects the live preview as the user clicks.
  useEffect(() => {
    applyAppearance(prefs);
  }, [prefs]);

  const save = useMutation({
    mutationFn: (next: AppearancePrefs) => client.set(next),
    onMutate: async (next) => {
      // Optimistic: paint immediately, roll back on error.
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<AppearancePrefs>(key);
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (err, _n, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(errorMessage(err));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const patch = (delta: Partial<AppearancePrefs>) => save.mutate({ ...prefs, ...delta });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Base theme</CardTitle>
          <CardDescription>
            The neutral palette anchoring surfaces, ink, and lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BASE_THEMES.map((b) => (
              <BaseSwatch
                key={b.value}
                base={b}
                selected={prefs.base === b.value}
                onSelect={() => patch({ base: b.value })}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <CardDescription>
            A few components rendered with the tokens you just chose.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="ap-cell">
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="ap-stat-n">
                  86<span className="ap-stat-unit">%</span>
                </p>
                <p className="ap-stat-l">Sample integrity score</p>
              </div>
              <span className="ap-pill ap-pill--teal">Accent pill</span>
              <button type="button" className="ap-btn ap-btn-primary ap-btn-sm">
                Primary button
              </button>
            </div>
          </div>
          <p className="mt-3 text-[0.78rem] text-ink-3">
            Synced to your account and applied on every device you sign in to.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/** Single base-theme swatch with two-dot mini palette (surface + ink). */
function BaseSwatch({
  base,
  selected,
  onSelect,
}: {
  base: (typeof BASE_THEMES)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Base theme ${base.label}`}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        selected
          ? "border-primary bg-primary/5"
          : "border-line bg-surface hover:bg-surface-2",
      )}
    >
      <div className="flex gap-1">
        <span
          aria-hidden
          className="size-5 rounded-full border border-line"
          style={{ background: base.surface }}
        />
        <span
          aria-hidden
          className="size-5 rounded-full border border-line"
          style={{ background: base.ink }}
        />
      </div>
      <span className="text-sm font-medium text-ink-deep">{base.label}</span>
      {base.value === "midnight" && (
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-3">
          default
        </span>
      )}
    </button>
  );
}

// Re-export the public types so consumers can satisfy the optional client prop.
export type {
  AccentPreset,
  AppearanceClient,
  AppearancePrefs,
  BaseTheme,
  ThemeMode,
};
