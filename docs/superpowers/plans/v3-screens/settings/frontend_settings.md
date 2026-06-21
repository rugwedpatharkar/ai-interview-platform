# Settings — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Replace the existing v2/Midnight `Settings` module — for **both** roles (`/settings` candidate and `/company/settings` company) — with an Aperture-Pro tabbed surface: `.app` shell + a 5-tab `.tabs` strip (Account · Security · Notifications · Privacy · **Appearance**) + `.cell` cards per tab. The four existing tabs preserve every existing client + query + handler verbatim; the fifth tab (**Appearance**) is the v3 personalization feature — per-user `mode` / `base` / `accent` / `accentHue` via the `PreferencesService` (lifted from the umbrella v3 plan). Both roles consume identical components — role differs only in shell choice (`CandidateShell` vs `CompanyShell`) and the Account tab's identity card.

Critically, settings is the **single surface where the per-user Appearance choice is set**, and the choice powers every other screen — `_design-language.md` §"Per-user Appearance — accent + base" maps the choices to `--teal` (the resolved accent) and the base palette. The Appearance tab IS the one chrome where the user can change the theme; there is no quick-switcher elsewhere in the app.

## Route + role

- `/settings` · **candidate** (signed-in; `useRequireAuth` + `useRequireRole(["candidate"])`), inside `CandidateShell` (`.app` shell).
- `/company/settings` · **company** (recruiter / company_admin; `useRequireRole(["recruiter","company_admin"])`), inside `CompanyShell` (`.app` shell).

Same components, same route file pattern (`app/settings/page.tsx`) in both apps; the role-conditional content lives in the Account tab only.

## Approved mockup (build to this exactly)

- **Live demo (primitives):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — `.cell` cards, `.tabs` segmented controls (the demo's `.tabs` block lives in the audience-switch in `MegaNav` and is used here as the tab strip primitive), `.pill.pill-good/.warn/.neutral/.teal` for status, `.input` for fields, `.btn.btn-primary` / `.btn.btn-ghost` for actions, `.bigfoot`-grade tabular `<table class="data">` for the session list.
- **Per-screen mockup:** ✗ none yet → **Task 0 builds** `docs/brand/redesign-v3/screens/settings.html` against the design-language tokens + primitives: `.app` shell, `.page-head` "Settings", a 5-tab `.tabs` strip (Account · Security · Notifications · Privacy · **Appearance**), and the per-tab body (described in the Layout table). The **Appearance** tab is the showcase — it gets a Theme segmented control, a Base swatch row, an Accent swatch row (presets + Custom hue slider), and a live preview `.cell.tight` (a mini KPI + a `.pill.pill-teal` + a `.btn.btn-primary`).

The implemented page MUST look 1:1 like the Task 0 mockup. Side-by-side screenshot proof is part of the acceptance criteria.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan, for **both** apps `{app} ∈ {candidate, company}`):

- `frontend/apps/{app}/app/settings/page.tsx` — tabbed shell + `?tab=` deep-link. Rebuild against `.tabs` + add `appearance` to the tab list.
- `frontend/apps/{app}/components/settings/account-tab.tsx` — rebuild as a `.cell` per sub-section (email card, password card, identity card on company).
- `frontend/apps/{app}/components/settings/security-tab.tsx` — rebuild as a 2FA `.cell` + a sessions `.cell` wrapping the existing `SessionList`.
- `frontend/apps/{app}/components/settings/notifications-tab.tsx` — rebuild as a single `.cell` with the email-category checklist + SMS row + digest segmented control + quiet hours fields.
- `frontend/apps/{app}/components/settings/privacy-tab.tsx` — rebuild as a `.cell` with the consent list + an erase-account `.btn.btn-ghost` with a danger-tone `ConfirmDialog`.
- `frontend/apps/{app}/components/settings/session-list.tsx` — rebuild as a semantic `<table class="data">` inside `.table-wrap`.
- `frontend/apps/{app}/components/settings/totp-setup-dialog.tsx` + `change-email-dialog.tsx` — rebuild as token-styled dialogs (modal `.cell` + form rows).

The following are **frozen — do not modify** (data seam / type contract are reused as-is):

- `frontend/apps/{app}/app/settings/types.ts` — `SettingsClient` + DTOs (`SessionDTO`, `NotificationPrefs`, `SetupTotpResult`, `VerifyTotpResult`).
- `frontend/apps/{app}/app/settings/settings-client.ts` — `makeSettingsClient()` (mock) + `createSettingsClient(api)`.

**New files (Appearance tab is genuinely new):**

- `frontend/apps/{app}/app/settings/appearance-client.ts` — `AppearanceClient` seam (mock + real), `AppearancePrefs` DTO, `APPEARANCE_DEFAULTS`, `queryKey()`. Type-identical to the umbrella v3 plan Phase C-2.
- `frontend/apps/{app}/components/settings/appearance-tab.tsx` — the Appearance UI; consumes `useAppearance()` from `@ip/ui` + the `AppearanceClient` via the provider.

## Layout & components

**Shell:** `.app` (sidebar + topbar) from `@ip/ui`, mounted by the per-role shell. The sidebar's footer group highlights `Settings` via `aria-current="page"`. The topbar carries the crumb `Home / Settings` (candidate) or `Company / Settings` (company).

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| **Page header** | `.page-head` (`h2` "Settings" + `.sub` "Account, security, and preferences.") | Single line; no toolbar at the page-head level. |
| **Tab strip** | `.tabs` segmented control (5 tabs) | `button[role="tab"][aria-selected]` per tab: **Account** · **Security** · **Notifications** · **Privacy** · **Appearance**. The active tab carries `.tabs button.active` (the design-language pattern); `?tab=appearance` deep-links via `useSearchParams`. |
| **Account tab — email card** | `.cell` | Email row: `.k-label` "Email" + `--ink` value + a `.pill.pill-good` "Verified" + a `.btn.btn-ghost.btn-sm` "Change email" → opens the change-email dialog. |
| **Account tab — password card** | `.cell` | Three `.input` rows (current, new, confirm) + a `.btn.btn-primary` "Update password". The existing `passwordChangeError` guard surfaces as a warn-tone inline alert above the button. |
| **Account tab — identity card (company only)** | `.cell` (read-only) | `.k-label` "Role" / "Company" rows; no edit affordance — company identity edits live on `/company/branding` (not this page). |
| **Account tab — profile link (candidate only)** | `.toolbar` + `.btn.btn-ghost` | Single text-link "Edit candidate profile" → `/profile`. |
| **Security tab — 2FA card** | `.cell` | `.k-label` "Two-factor authentication" + a `.pill.pill-good` "On" (or `.pill.pill-warn` "Off") + a `.btn.btn-primary` "Set up 2FA" (when off) or `.btn.btn-ghost` "Disable 2FA" (when on, opens a confirm with a TOTP/recovery code input). |
| **Security tab — sessions card** | `.cell` wrapping a `.table-wrap > table.data` | Columns: **Device** (UA short label) · **IP** (`.tnum` mono) · **Last seen** (`<time>` relative + `<time>` ISO tooltip in mono) · per-row `.btn.btn-ghost.btn-sm` "Revoke" (disabled on the current jti, which carries a `.pill.pill-teal` "This device" instead). Footer: `.btn.btn-ghost` "Sign out other sessions" with a confirm dialog. |
| **Notifications tab — all in one card** | `.cell` | (1) Email categories: a vertical checklist of 4 rows (each row = `.k-label` + `<Checkbox>`); (2) SMS-critical row (one `.k-label` + `<Checkbox>`); (3) Digest cadence: a segmented `.tabs`-style control (Off / Daily / Weekly); (4) Quiet hours: two `<input type="time">` styled to `.input` + a tz `<Select>`; (5) A `.k-meta` "In-app notifications are always on for important events." Optimistic `setPrefs` mutation with on-error rollback + toast. |
| **Privacy tab — consents + erase card** | `.cell` | A list of consent rows (each a `.k-label` + `.pill.pill-good/.warn` status + a `.btn.btn-ghost.btn-sm` "Revoke" / "Grant"); separator; a danger-tone block at the bottom — "Erase my account" `.btn.btn-ghost` (NOT primary — destructive actions never carry the primary teal) with a danger-tone `ConfirmDialog` ("Type ERASE to confirm"). |
| **Appearance tab — Theme card** | `.cell` | A segmented `.tabs`-style control with 3 options: **Device default** (`mode: "system"`, default), **Light** (`mode: "light"`), **Dark** (`mode: "dark"`). Bound to `prefs.mode` via `useAppearance().setMode`. Instant-apply: the chosen mode writes `<html data-theme>` immediately (the pre-paint script preserves the choice on hard refresh). |
| **Appearance tab — Base palette card** | `.cell` | A swatch row of 4 `button[aria-pressed]` chips: **Aperture** (default — the design-language tokens above), **Azure**, **Mint**, **Slate**. Each chip shows a 2-dot mini-palette preview (bg dot + accent dot). Bound to `prefs.base` via `setBase`. |
| **Appearance tab — Accent card** | `.cell` | A swatch row of preset chips (**Teal** default + Cyan / Lime / Emerald / Amber / Coral / Azure) + a **Custom** chip that reveals a `<input type="range" min=0 max=359 step=1>` hue slider. Bound to `prefs.accent` (+ `prefs.accentHue` when accent = `custom`) via `setAccent`. The `@ip/ui` `accentVars` helper clamps the hue to an OKLCH L/C ramp so AA contrast is guaranteed — the tab just passes the raw hue. |
| **Appearance tab — Live preview card** | `.cell.tight` | Three sample elements inside the card: one `.kpi` (label + value + `.k-delta.up`), one `.pill.pill-teal` "Preview", one `.btn.btn-primary` "Sample action". The preview automatically re-tints because it consumes `--teal` (the resolved accent) and `--surface` (the resolved base) — no extra wiring. |
| **States — loading / error per tab** | `.cell.tight` | Loading: skeleton bars in `--surface-2`. Error: warn-tone leading icon + Retry `.btn.btn-ghost`. |

**No mute / cam-off toggle anywhere.** Per `_design-language.md` §"Mandatory revamp rule" item 5 and the proctored-interview invariants, the product does NOT expose a mute / camera-off control on any screen — including settings. There is no "default mic muted on join" preference, no "camera off in practice" preference, no quick toggle. The Appearance tab is purely theming.

**No new logic components beyond the Appearance tab.** `SessionList`, `TotpSetupDialog`, `ChangeEmailDialog` are reused (rebuilt visually only; their handlers stay frozen).

## Data wiring / seam

### Existing tabs (Account / Security / Notifications / Privacy) — preserved verbatim

- **Client / seam:** `makeSettingsClient()` (mock) / `createSettingsClient(api)` over `api.settings.*`. **Unchanged.**
- **Query keys (unchanged):**
  - `["settings","sessions"]` — `listSessions` for the Security tab.
  - `["settings","prefs"]` — `getNotificationPrefs` for the Notifications tab; the `setNotificationPrefs` mutation is **optimistic** with `onMutate` / `onError` rollback / `invalidateQueries`.
- **Fields consumed** (unchanged DTOs from `types.ts`):
  - `SessionDTO { jti, ip, userAgent, createdAt, lastSeenAt, current }`.
  - `NotificationPrefs { emailCategories: Map<string,bool>, smsCritical, digest, quietHours: { start, end, tz } }`.
  - `SetupTotpResult { provisioningUri, secret }` (shown once on setup).
  - `VerifyTotpResult { enabled, recoveryCodes }` (shown once on first enable).
- **Privacy tab:** consents + erase call `api.compliance.*` — unchanged.

### Appearance tab (NEW) — `PreferencesService` seam

- **Client / seam:** **`AppearanceClient`** in `app/settings/appearance-client.ts` (separate from `SettingsClient` — umbrella decision: one per-user `PreferencesService`, not folded into `admin.settings.v1`). Mock + real selected by `NEXT_PUBLIC_MOCK`. The provider mounts an `AppearanceProvider` at the root layout that owns write-through (instant apply to `<html>` + persistence to `PreferencesService`).
- **Query key:** `["preferences","appearance"]` (the client's `queryKey()` helper).
- **DTO** (preserved exactly from the existing v3 plan + the umbrella):
  ```ts
  export type ThemeMode = "system" | "light" | "dark";
  export type BaseTheme = "aperture" | "azure" | "mint" | "slate";
  export type AccentId  = "teal" | "cyan" | "lime" | "emerald" | "amber" | "coral" | "azure" | "custom";
  export interface AppearancePrefs { mode: ThemeMode; base: BaseTheme; accent: AccentId; accentHue?: number }
  export const APPEARANCE_DEFAULTS: AppearancePrefs = { mode: "system", base: "aperture", accent: "teal" };
  export interface AppearanceClient {
    get(): Promise<AppearancePrefs>;
    set(p: AppearancePrefs): Promise<AppearancePrefs>;
    queryKey(): readonly string[];   // ["preferences","appearance"]
  }
  ```
- **Hook:** `useAppearance()` from `@ip/ui` returns `{ prefs, setMode, setBase, setAccent, resolvedTheme, mounted }`. The tab consumes only this hook + a single `AppearanceClient` instance for persistence. **`mode = "system"` follows the OS** — `resolvedTheme` is the OS theme when `mode === "system"`, otherwise the user's choice.
- **Defaults** (mirror of `_design-language.md` §"Per-user Appearance — accent + base"): `mode: system`, `base: aperture`, `accent: teal`, `accentHue: undefined`.

See [`backend_settings.md`](./backend_settings.md) Part 2 for the gRPC contract.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Build the screen mockup.**

- **Task 0 — Mockup.** Build `docs/brand/redesign-v3/screens/settings.html` against the design-language tokens + primitives: `.app` shell (per-role sidebar), `.page-head`, the 5-tab `.tabs` strip, and the per-tab body per the Layout table — most importantly the **Appearance** tab (Theme segmented control, Base swatch row of 4 chips, Accent swatch row of presets + a Custom hue slider, live preview `.cell.tight` re-tinting from `--teal` / `--surface`). Verify in both themes on the `:4173` preview. Commit `docs/brand/redesign-v3/screens/settings.html`.

> Tasks 1–8 run for **both** `{app} ∈ {candidate, company}`; commit per-app with explicit paths.

- **Task 1 — Rebuild the tabbed shell + 5th tab slot.** New `app/settings/page.tsx`: wrap body in `.app .content`, swap to `.page-head`, render the 5-tab `.tabs` strip (Account · Security · Notifications · Privacy · **Appearance**). Wire `?tab=appearance` deep-link via `useSearchParams`. Keep `Suspense`, `useRequireAuth`, `useMemo` client, the existing `TABS` array extended with `"appearance"`. Browser-verify (mock): all 5 tabs visible, `?tab=appearance` opens Appearance. Per-app commit.
- **Task 2 — Rebuild Account tab.** Email card + password card + (company) identity card / (candidate) profile link. **Keep `changePassword`, `requestEmailChange`, `passwordChangeError` guard, `ChangeEmailDialog`, and the `/profile` link identical.** Browser-verify both roles. Per-app commit.
- **Task 3 — Rebuild Security tab + SessionList + TotpSetupDialog.** 2FA card + sessions `.cell` wrapping a `<table class="data">`. **Keep `setupTotp` / `verifyTotp` / `disableTotp` / `listSessions` / `revokeSession` / `revokeAllSessions` + query keys identical.** The TOTP dialog's 3-state flow (QR/secret → 6-digit `.input` → recovery codes shown once with a warn-tone alert) preserved verbatim. Browser-verify both roles. Per-app commit.
- **Task 4 — Rebuild Notifications tab.** Single `.cell` per the Layout table; bound to the existing optimistic `setPrefs` mutation. **Keep `onMutate` / `onError` rollback / `invalidateQueries` + the `["settings","prefs"]` key identical.** Browser-verify the optimistic flip + rollback on a forced error (mock). Per-app commit.
- **Task 5 — Rebuild Privacy tab.** Consents list + danger-tone erase block; `api.compliance.*` calls unchanged. Browser-verify the confirm flow. Per-app commit.
- **Task 6 — Appearance client seam (`appearance-client.ts`).** New per-app file; mock + real selected by `NEXT_PUBLIC_MOCK`. Mock starts at `APPEARANCE_DEFAULTS`, in-memory, immediately resolves. Real binds `api.preferences.{getAppearance,updateAppearance}` (camelCase protobuf-es: `accentHue`). Type-check clean. Per-app commit.
- **Task 7 — Appearance tab UI (`appearance-tab.tsx`).** Consume `useAppearance()` + the `AppearanceClient` via the provider. Build the 4 cards per the Layout table. Respect `prefers-reduced-motion`. Each control is a real `<RadioGroup>` or `<button aria-pressed>` with a label. Render via `mounted` guard to avoid SSR / first-paint mismatch (the pre-paint script already painted `<html>`; the tab just renders the visible state). Browser-verify: toggle each option (instant re-tint of the live preview + the rest of the app), reload → persists (mock first, then real once `PreferencesService` is live); set `mode = "system"` + flip OS theme → resolved theme follows. Per-app commit.
- **Task 8 — Port the Appearance tab to the second app + verify role parity.** Duplicate `appearance-client.ts` + mount `<AppearanceTab />` in the other app's settings (candidate ↔ company). Persistence is **per-user token-scoped** — one `PreferencesService` serves both roles. Build both apps + `--filter @ip/{ui,shared,api-client} typecheck` green. Per-app commit.
- **Task 9 — Verify against the mockup.**
  1. Build both apps + typecheck across `@ip/ui`/`@ip/shared`/`@ip/api-client` is green; no console errors / warnings.
  2. Navigate `/settings` (candidate) and `/company/settings` (company), screenshot all 5 tabs in both themes.
  3. **Side-by-side fidelity check** against `docs/brand/redesign-v3/screens/settings.html`. Iterate until 1:1.
  4. **No mute / cam-off audit** — grep the settings tree for `mute`, `cameraOff`, `videoOff`, `defaultMic`, `defaultCam`. **Zero hits.** Per the design language, no quick-toggle for mic / camera exists on any screen.

## States & a11y

- **Loading / saving / error (every tab).** Queries → `.cell.tight` skeleton then warn-tone `.cell` + Retry. Mutations → optimistic where present (Notifications, Appearance) with rollback on error + `toast.error(errorMessage(e))`. The active control is disabled + shows a spinner on the `.btn.btn-primary` during save.
- **Appearance specifics.** `mounted = false` → render defaults (no FOUC — the pre-paint script already painted `<html>`); a write that fails rolls the chip back (optimistic local) and toasts; the Custom hue slider is debounced for persistence but applies instantly to `<html>`.
- **Empty.** Sessions never truly empty (the current device always lists); prefs / appearance fall back to defaults.
- **Dark + light.** Every control reads `--teal` (the resolved accent) + base vars via the token classes — **no hardcoded colors**; the 4 bases × {light, dark} all stay AA (curated palettes); custom accent clamped into the OKLCH ramp.
- **A11y.** Each tab is a labelled `<TabsPanel>`; the Theme control is `role="radiogroup"`; base / accent chips are `<button aria-pressed>` with `aria-label` (e.g. `"Base palette: Aperture"`, `"Accent: Teal"`); the hue slider has a `<label>` + `aria-valuetext` (the OKLCH value); focus rings via `:focus-visible` (`--teal` 2px / 4px halo); contrast ≥ 4.5:1; 6-digit TOTP input `inputMode="numeric"`; destructive actions use `ConfirmDialog` with `tone="danger"`.
- **Responsive.** Session `<table>` scrolls horizontally inside `.table-wrap` under `<= 760px`; the 5-tab strip wraps to two rows (`flex-wrap` natural); swatch rows wrap; forms single-column on mobile.

## Acceptance

- Looks 1:1 like `docs/brand/redesign-v3/screens/settings.html` (the Task 0 mockup): `.app` shell, `.page-head`, 5-tab `.tabs`, per-tab `.cell` bodies, and the **Appearance** showcase (Theme / Base / Accent / live preview). Side-by-side screenshot proof committed under `docs/brand/redesign-v3/verify/settings-{candidate,company}-{light,dark}-{account,security,notifications,privacy,appearance}.jpeg`.
- `--filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green.
- **Zero functional diff for the 4 existing tabs.** Same `SettingsClient`, same `["settings","sessions"]` / `["settings","prefs"]` query keys, same `setPrefs` optimistic rollback, same `?tab=` deep-link, same `Suspense` + `useRequireAuth` / `useRequireRole` gates. Markup/classes only changed.
- **Appearance lives.** Toggling persists per-user (both roles), survives reload, `mode = "system"` follows the OS, no FOUC on hard refresh of a custom accent / base (the pre-paint script handles it).
- **No mute / cam-off anywhere.** Grep audit passes; the settings surface contains no microphone or camera default-state preference.
- Mock→real path unchanged (`NEXT_PUBLIC_MOCK`): mock `AppearanceClient` starts at `APPEARANCE_DEFAULTS`; real `api.preferences.*` binds the same way once `PreferencesService` lands.
