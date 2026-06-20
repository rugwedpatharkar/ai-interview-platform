# Screen: Settings (role-aware) — v3 Midnight FE plan

> Part of the [v3 per-page plans](../_index.md) (#24, Wave "settings + appearance").
> **Goal:** Port the role-aware Settings module to the **Midnight Intelligence** design system **and add the NEW
> Appearance tab** — the headline v3 feature (per-user theme mode / base theme / accent, persisted server-side).
> Reskin is **appearance-only** for the four existing tabs (Account · Security · Notifications · Privacy); the
> fifth tab (**Appearance**) is genuinely new and wires `useAppearance()` + an `AppearanceClient`.

- **Unified route(s) + role:** `/settings` (candidate) and `/company/settings` (company) — **same components**,
  role differs only in shell (`CandidateShell` vs `CompanyShell`) and the Account tab (company = read-only
  identity, no `/profile` link). Both are `"use client"`, authed-gRPC, never SSR/public.
- **Mockup:** ✗ none exists → **Task 0 builds** `docs/brand/redesign-v2/settings.html`.
- **Existing code it reskins** (real paths, both apps — `{app}` ∈ {candidate, company}):
  - `frontend/apps/{app}/app/settings/page.tsx` — tabbed shell (`SettingsTabs`, `?tab=` deep-link, `Suspense`).
  - `frontend/apps/{app}/app/settings/types.ts` — `SettingsClient` + DTOs (extend with Appearance, or keep a
    separate `AppearanceClient` per umbrella Phase C — **keep separate**, see Data wiring).
  - `frontend/apps/{app}/app/settings/settings-client.ts` — `makeSettingsClient()` mock + `createSettingsClient(api)`.
  - `frontend/apps/{app}/components/settings/{account-tab,security-tab,notifications-tab,privacy-tab,
    session-list,totp-setup-dialog,change-email-dialog}.tsx`.
- **Backend contract:** [`backend_settings.md`](./backend_settings.md) — Part 1 EXISTING `admin.settings.v1`
  (reuse), Part 2 NEW `admin.preferences.v1.PreferencesService` (Appearance persistence).
- **Cross-ref:** umbrella [v3 redesign + appearance plan](../../2026-06-20-v3-redesign-and-appearance.md) —
  **Phase A** (tokens/app.css in `@ip/ui`), **Phase C** (`AppearanceProvider`, `appearanceScript`, the
  `appearance-tab.tsx` + `appearance-client.ts` seam). This screen is the **adoption site** for Phase C's tab.

---

## Layout & components

**Shell:** the `.app` product shell (sidebar + topbar + content) per role — `.app · .side · .navitem · .main ·
.topbar · .content · .page-head`. Settings renders inside `<{Candidate|Company}Shell>` (already does); v3 swaps
the shell's internal markup to the token classes (that's the shell's own port — this screen consumes it).

**Page body → `@ip/ui` classes (reference `_index.md`; do NOT redefine):**

| Region | v3 mapping |
|---|---|
| Page title row | `.page-head` (`h2` display + `.sub`) — replaces `PageHeader` ad-hoc styling |
| Tab strip (5 tabs) | `.tabs` (segmented `button[aria-selected]`) — `Tabs/TabsList/TabsTrigger` reskinned to it |
| Each tab panel section | `.card` (+ `.card.tight` for sub-cards) with `.card-head` |
| Form fields | `.input`, labels via `.k-label`/`.navlabel` rhythm; buttons `.btn .btn-primary` / `.btn-ghost .btn-sm` |
| Status chips (2FA on/off, verified email, "This device") | `.pill .pill-good/-warn/-neutral/-accent` |
| Session table | `.table-wrap > table.data`, `.tnum` for IPs/timestamps |
| Toggles (email cats, sms) | reuse `@ip/ui` `Checkbox`; **no `.switch` in the system** |
| Destructive (revoke-all, disable-2FA, erase) | `.btn .btn-ghost` + `ConfirmDialog`, `.pill-bad` framing |
| **Appearance — Theme control** | segmented `.tabs`-style or `.chip-toggle` group (3 options) |
| **Appearance — Base/Accent swatches** | `.chip-toggle[aria-pressed]` swatch row (new `.swatch` markup, see Task 0) |
| **Appearance — live preview** | a mini `.card` with one `.kpi`, one `.pill-accent`, one `.btn-primary` |

**New vs reused components:**
- **Reused (reskin only, handlers frozen):** `SessionList`, `TotpSetupDialog`, `ChangeEmailDialog`, the 4 tabs.
- **New:** `components/settings/appearance-tab.tsx` (umbrella Phase C, Task C3) + `appearance-client.ts`
  (Phase C, Task C2). A small `Swatch`/`SegmentedControl` may be inlined in the tab (single-use) — do not extract.

---

## Data wiring (kept identical for the 4 existing tabs; NEW seam for Appearance)

- **Existing tabs:** call `makeSettingsClient()` (mock) / `createSettingsClient(api)` over `api.settings.*`.
  TanStack keys unchanged: `["settings","sessions"]`, `["settings","prefs"]`. Fields consumed are exactly today's
  (`SessionDTO`, `NotificationPrefs`, `SetupTotpResult`, `VerifyTotpResult` from `types.ts`) — **only markup/classes
  change.** See [`backend_settings.md`](./backend_settings.md) Part 1.
- **Appearance tab (NEW):** does **not** go through `SettingsClient`. It consumes **`useAppearance()`** (from
  `@ip/ui`, umbrella Phase C-1) for instant apply + the injected **`AppearanceClient`** (Phase C-2,
  `frontend/apps/{app}/app/settings/appearance-client.ts`) for persistence. Query key: `["preferences","appearance"]`
  (the client's `queryKey()` helper). DTO `AppearancePrefs { mode, base, accent, accentHue? }` — see
  [`backend_settings.md`](./backend_settings.md) Part 2. **Keep this separate from `SettingsClient`** (umbrella
  decision: one per-user `PreferencesService`, not folded into settings) so the provider owns write-through.

---

## Tasks (bite-sized; reskin = appearance-only, handlers frozen)

### Task 0 — Build the mockup `redesign-v2/settings.html`

- [ ] **Step 1:** Create `docs/brand/redesign-v2/settings.html` against `tokens.css` + `app.css`. Structure:
  - The `.app` shell (`.side` with brand + nav, `.topbar` with title, `.content`).
  - A `.page-head` ("Settings" + sub).
  - A `.tabs` strip with **5** buttons: Account · Security · Notifications · Privacy · **Appearance**.
  - **Account panel:** a `.card` with email + a `.pill-good` "Verified" + a Change-email `.btn-ghost`; a second
    `.card` with the 3 password `.input`s + a `.btn-primary` "Update password".
  - **Security panel:** a `.card` with a 2FA status `.pill` (`.pill-good` on / `.pill-warn` off) + a `.btn-primary`
    "Set up 2FA"; below, a `.card` with the **session table** (`.table-wrap > table.data`, a "This device"
    `.pill-accent`, per-row `.btn-ghost .btn-sm` "Revoke", a footer `.btn-ghost` "Sign out other sessions").
  - **Notifications panel:** a `.card` with 4 email-category rows (label + `Checkbox`-style box), an SMS row, a
    digest segmented group, and quiet-hours time inputs.
  - **Privacy panel:** a `.card` with the consent list + an `.pill-bad`-framed "Erase my account" `.btn-ghost`.
  - **Appearance panel (the showcase):**
    - **Theme** — a segmented control (`.tabs` look) with 3 options: **Device default** (selected by default),
      **Light**, **Dark**.
    - **Base theme** — a `.swatch` row of 4 `.chip-toggle[aria-pressed]` chips: **Midnight** (default), **Azure**,
      **Mint**, **Slate** — each shows a 2-dot mini-palette preview (bg + accent).
    - **Accent** — a `.swatch` row of preset chips (cyan default, lime, emerald, amber, coral, azure) **plus** a
      **Custom** chip that reveals a **hue slider** (`<input type="range" min=0 max=360>`) with a live swatch.
    - **Live preview** — a `.card` containing one `.kpi` (label + value), one `.pill-accent`, and one
      `.btn-primary`, so changing base/accent visibly re-tints the preview (drive via inline `--accent*`/`data-base`
      on the preview container for the static mockup).
  - Add the minimal `.swatch`/`.swatch-dot` CSS in the mockup's `<style>` (it graduates into `app.css`/the tab at
    build time; the shared classes stay token-driven).
- [ ] **Step 2:** Browser-verify on the `:4173` preview (dark + light): all 5 tabs visible, Appearance controls
  render, the preview re-tints when you click a base/accent chip. Screenshot.
- [ ] **Step 3:** Commit `git add docs/brand/redesign-v2/settings.html && git commit --no-verify -m "design(v3): settings.html mockup incl. Appearance tab"`.

### Task 1 — Reskin the tabbed page shell + 5th tab slot (both apps)

- [ ] **Step 1:** In `app/settings/page.tsx`, wrap the body in the `.app`/`.content` regions per the mockup, swap
  `PageHeader` → `.page-head` markup, and reskin `Tabs/TabsList/TabsTrigger` to the `.tabs` segmented look. **Add a
  5th `TabsTrigger value="appearance"` + `TabsContent`** mounting `<AppearanceTab />`. Extend `TABS` to include
  `"appearance"` so `?tab=appearance` deep-links. Keep `Suspense`, `useRequireAuth`, `useMemo` client, and the
  `?tab=` logic **identical**.
- [ ] **Step 2:** Build + browser-verify (mock): 5 tabs, `?tab=appearance` opens Appearance. Per-app explicit-path commit.

### Task 2 — Reskin Account tab (handlers frozen)

- [ ] Swap ad-hoc Tailwind colors → `.card`/`.input`/`.btn*`/`.pill-good` per mockup. Keep `changePassword`,
  `requestEmailChange`, the `passwordChangeError` guard, `ChangeEmailDialog`, and (candidate-only) the `/profile`
  link **identical**. Company Account stays read-only identity (role + company), no `/profile`. Build + verify + commit.

### Task 3 — Reskin Security tab + SessionList + TotpSetupDialog

- [ ] Reskin the 2FA status `.pill`, the session `table.data` (`.table-wrap`, "This device" `.pill-accent`, per-row
  `.btn-ghost .btn-sm` Revoke, footer revoke-all `ConfirmDialog`), and the TOTP dialog's 3 states (QR/secret →
  6-digit `.input` → recovery codes once, `Alert tone="warning"`). Keep `setupTotp/verifyTotp/disableTotp/
  listSessions/revokeSession/revokeAllSessions` + query keys **identical**. Build + verify + commit.

### Task 4 — Reskin Notifications tab (handlers frozen)

- [ ] Reskin to `.card`: 4 email-category `Checkbox` rows, the SMS-critical row, the digest `RadioGroup`
  (off/daily/weekly) segmented, quiet-hours `type="time"` + tz `Select`, the "in-app always on" `Alert`. Keep the
  **optimistic** `setPrefs` mutation (`onMutate`/`onError` rollback/`invalidateQueries`) + `["settings","prefs"]`
  key **identical**. Build + verify + commit.

### Task 5 — Reskin Privacy tab (handlers frozen)

- [ ] Reskin the consent list + the `tone="danger"` erase `ConfirmDialog` (`api.compliance.*` calls unchanged) to
  `.card` + `.pill-bad`. **No call changes** — only host markup. Build + verify + commit.

### Task 6 — NEW Appearance tab: client seam (`appearance-client.ts`)

> Mirrors umbrella **Phase C, Task C2**. Same `NEXT_PUBLIC_MOCK` pattern as `settings-client.ts`/`saved-jobs-client.ts`.

- [ ] **Step 1:** Create `app/settings/appearance-client.ts`:
  ```ts
  export type ThemeMode = "system" | "light" | "dark";
  export type BaseTheme = "midnight" | "azure" | "mint" | "slate";
  export type AccentId = "cyan" | "lime" | "emerald" | "amber" | "coral" | "azure" | "custom";
  export interface AppearancePrefs { mode: ThemeMode; base: BaseTheme; accent: AccentId; accentHue?: number }
  export interface AppearanceClient {
    get(): Promise<AppearancePrefs>;
    set(p: AppearancePrefs): Promise<AppearancePrefs>;
    queryKey(): readonly string[];
  }
  export const APPEARANCE_DEFAULTS: AppearancePrefs = { mode: "system", base: "midnight", accent: "cyan" };
  ```
  `makeMockAppearanceClient()` (in-memory, starts at `APPEARANCE_DEFAULTS`) + `createAppearanceClient(api)` →
  `api.preferences.{getAppearance,updateAppearance}` (camelCase: `accentHue`). Select by `NEXT_PUBLIC_MOCK`.
- [ ] **Step 2:** `--filter @ip/{app} typecheck` clean; commit.

### Task 7 — NEW Appearance tab: UI (`appearance-tab.tsx`) wiring `useAppearance()`

> Mirrors umbrella **Phase C, Task C3**. The component is **shared** by both areas (same file pattern per app).

- [ ] **Step 1:** Create `components/settings/appearance-tab.tsx` consuming `useAppearance()` (`{ prefs, setMode,
  setBase, setAccent, resolvedTheme, mounted }`) + the `AppearanceClient` via the provider:
  - **Theme** segmented control (`Device default` / `Light` / `Dark`) bound to `prefs.mode`; default reflects
    `system`. `onChange → setMode(...)` (instant apply + persist).
  - **Base theme** swatch row (Midnight/Azure/Mint/Slate) → `setBase(...)`; `aria-pressed` marks current.
  - **Accent** swatch row (presets) + a **Custom** chip toggling a hue `range` slider → `setAccent("custom",
    hue)`; clamped contrast comes from `@ip/ui` `accentVars` (umbrella A2) — the tab just passes the hue.
  - **Live preview** `.card` (mini KPI + `.pill-accent` + `.btn-primary`) reflecting choices automatically (it
    reads `--accent*`/`data-base` set on `<html>` by the provider — no extra wiring).
  - Respect `prefers-reduced-motion`; each control is a real `RadioGroup`/`button[aria-pressed]` with a label.
- [ ] **Step 2:** Render via `mounted` guard to avoid SSR/first-paint mismatch (provider is SSR-stable). Until
  `mounted`, show the defaults (no flicker because `appearanceScript` already set `<html>`).
- [ ] **Step 3:** Build + browser-verify: toggle each option (instant re-tint), reload → persists (mock store /
  real `PreferencesService`); set mode=Device default + flip OS theme → resolved theme follows. Commit.

### Task 8 — Port the Appearance tab to the second app + verify role parity

- [ ] Duplicate `appearance-client.ts` + mount `<AppearanceTab />` in the other app's settings (candidate ↔
  company), since the persistence is **per-user token-scoped** (one `PreferencesService` serves both). Build both
  apps + `--filter @ip/{ui,shared,api-client} typecheck` green. Commit per app.

---

## States & a11y (per tab)

- **Loading / saving / error (every tab):** queries → `LoadingState`/skeleton then `ErrorState` + retry; mutations
  → optimistic where present (Notifications, Appearance) with rollback on error + `toast.error(errorMessage(e))`.
  Saving state: disable the active control + show a spinner on the `.btn-primary`.
- **Appearance specifics:** `mounted=false` → render defaults (no FOUC — `appearanceScript` pre-painted `<html>`);
  a write that fails rolls the chip back (optimistic local) and toasts; the Custom hue slider is debounced for
  persistence but applies instantly to `<html>`.
- **Empty:** sessions never truly empty (current device always lists); prefs/appearance fall back to defaults.
- **Dark + light:** every control reads `--accent`/base vars via the token classes — **no hardcoded colors**; the
  4 bases × {light,dark} all stay AA (curated palettes); custom accent clamped into the OKLCH ramp.
- **A11y:** each tab is a labelled `Tabs` panel; the Theme control is a `RadioGroup` (or `role="radiogroup"`); base/
  accent chips are `button[aria-pressed]` with `aria-label` (e.g. "Base theme: Midnight"); the hue slider has a
  `<label>` + `aria-valuetext`; focus rings via `:focus-visible` (`--accent-strong`); contrast ≥ 4.5:1; 6-digit
  TOTP input `inputMode="numeric"`; destructive actions use `ConfirmDialog`.
- **Responsive:** session `table` scrolls/stacks under `md:`; the 5-tab strip wraps; swatch rows wrap; forms
  single-column on mobile.

## Acceptance

- Matches `redesign-v2/settings.html` (5 tabs incl. Appearance with theme/base/accent + live preview).
- `--filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`
  all green.
- **Zero functional diff** for the 4 existing tabs — same clients, query keys, handlers, `?tab=` deep-link; only
  markup/classes changed. Mock→real path unchanged (`NEXT_PUBLIC_MOCK`).
- Appearance: toggling persists per-user (both roles), survives reload, and `mode=system` follows the OS; no FOUC
  on hard refresh of a custom accent/base (umbrella Phase C-4 provides the pre-paint guarantee).
