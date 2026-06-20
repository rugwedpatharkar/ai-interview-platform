# Aptura v3 — Redesign Port + Appearance Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Port the approved **Midnight Intelligence** redesign (from `docs/brand/redesign-v2/`) into the real
app, and add a per-user **Appearance** feature — theme mode (Device default / Light / Dark, default Device
default), a curated **accent** picker (presets + clamped custom hue), and a curated **base theme** picker —
persisted server-side for **both candidate and company** users.

**Architecture:** The redesign-v2 CSS becomes the app's token + component layer in `@ip/ui`. Theme/accent/
base are CSS variables on `<html>`, set **before paint** by an extended `themeScript` (no FOUC) and managed at
runtime by an `AppearanceProvider`. Preferences persist via a new admin gRPC `PreferencesService`
(`user_preferences` collection, token-scoped so one service serves both roles); the FE codes against a typed
mock seam until `pnpm gen`. The design system keeps contrast valid for every choice (curated bases; custom
accent hue clamped into the OKLCH ramp).

**Tech Stack:** Next.js 15 (App Router) single app, React 19, `@ip/ui` (OKLCH tokens), TanStack Query,
`@connectrpc/connect-web`; backend = admin gRPC (Python) + Mongo; `pnpm gen` bridges proto → FE client.

## Global Constraints

- **Functionality-preserving for the port:** reskinning changes appearance only; no screen behavior changes.
- **Appearance is server-authoritative per user** (candidate + company), scoped by the auth token; **default
  mode = `system` (Device default).**
- **No flash of wrong theme/accent (FOUC):** every appearance variable is applied by the pre-paint inline
  script before React hydrates.
- **Contrast stays valid for every choice:** background = curated *base themes* only (not arbitrary);
  accent = curated presets **or** a custom hue **clamped** into the OKLCH lightness/chroma ramp.
- **Lane ownership (carry-over):** BE owns every `.proto` + `frontend/packages/api-client/src/gen/*`; FE owns
  app/component code. Commit per task with **explicit paths** (`git add <files>`, never `-A`); current branch.
- **Execution gating:** this plan touches `frontend/`. Do NOT start the port tasks until (a) the v2 single-app
  unification has landed and (b) the parallel session's in-flight `frontend/` edits are merged. Backend tasks
  (Phase B) and the design-token authoring (Phase A) can begin earlier as they don't collide.
- Verify: `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck`;
  backend gate `bash scripts/check.sh` stays green.

## Design decisions (locked)

- **ThemeMode** = `system | light | dark`, default `system`. Resolved theme = mode, or the OS
  `prefers-color-scheme` when `system`; a live `matchMedia` listener re-resolves when the OS flips and mode is
  `system`.
- **Base theme** = one of a curated set: `midnight` (default), `azure`, `mint`, `slate` (neutral). Each is a
  contrast-verified palette (from `docs/brand/redesign-v2/schemes.css`). Selecting a base sets the base
  CSS-var block; it is NOT an arbitrary color.
- **Accent** = a curated preset id (`cyan` default, plus `lime`, `emerald`, `amber`, `coral`, `azure`, …) OR
  `custom` with a stored hue (0–360). Custom hue is rendered through the **same ramp** (fixed lightness/chroma
  per theme), so any hue stays AA-contrast. Stored as `{ accent: "<preset|custom>", accentHue?: number }`.
- **Persistence shape** (`AppearancePrefs`): `{ mode: ThemeMode, base: BaseTheme, accent: AccentId, accentHue?: number }`.
- **Apply order:** pre-paint script sets `data-theme` (resolved light/dark) + `data-base` + accent vars from a
  localStorage cache; on auth, the server value (source of truth) hydrates and re-caches; updates write-through
  (optimistic local + server).

## File structure

**New (design system → `@ip/ui`):**
- `frontend/packages/ui/src/tokens.css` — structural tokens + base-theme blocks + accent presets (from redesign-v2).
- `frontend/packages/ui/src/app.css` — shared product component layer (from redesign-v2 `app.css`).
- `frontend/packages/ui/src/appearance.tsx` — `AppearanceProvider`, `useAppearance`, extended `appearanceScript`.

**New (preferences seam, FE):**
- `frontend/apps/candidate/app/settings/appearance-client.ts` — typed `AppearanceClient` + `makeMockAppearanceClient` + real `createAppearanceClient`.
- `frontend/apps/candidate/components/settings/appearance-tab.tsx` — the Appearance settings UI (shared by both areas).

**New (backend, BE-owned):**
- `src/admin/app/routes/pb/preferences.proto` + generated `*_pb2*` + FE `gen` (via `pnpm gen`).
- `src/admin/app/model/appearance_prefs.py` — the `AppearancePrefs` model + defaults + validation/clamp.
- `src/admin/app/resources/preferences.py` — get/update logic over the `user_preferences` collection.
- `src/admin/app/routes/preferences.py` — thin `PreferencesServicer`.
- Tests: `src/admin/tests/test_resources_preferences.py`, `test_preferences_grpc.py`.

**Modified:**
- `frontend/packages/ui/src/theme.tsx` — fold theme into appearance (mode tri-state) or re-export from appearance.tsx.
- `frontend/packages/ui/src/index.ts` — export the new appearance API + import the CSS layers.
- The unified app root layout — swap the `themeScript` for `appearanceScript`; wrap in `AppearanceProvider`.
- `apps/candidate/app/settings/**` (+ the `/company/settings` area) — add the Appearance tab.
- `apps/candidate/app/settings/types.ts` — extend `SettingsClient`/types with appearance (or keep separate client).
- Each ported screen (Phase D) — class/token swaps only.

---

## Phase A — Design system into `@ip/ui`

### Task A1: Land the token + component CSS in `@ip/ui`

**Files:**
- Create: `frontend/packages/ui/src/tokens.css`, `frontend/packages/ui/src/app.css`
- Modify: `frontend/packages/ui/src/index.ts` (import both CSS files so consumers get them)

**Interfaces:**
- Produces: the CSS-variable system — `--bg/--surface/--surface-2/--ink/--ink-2/--ink-3/--line/--line-2`,
  `--accent/--accent-strong/--accent-soft/--accent-ink`, type/spacing/radii/z/motion tokens; and the
  `.app/.side/.topbar/.card/.kpi/.pill*/.table-wrap/.btn*/.ring/.bar/.tabs/.chip-toggle/.badge/.who/.avatar`
  component classes. Base/accent selection driven by `[data-theme]`, `[data-base]`, and accent override vars.

- [ ] **Step 1: Author `tokens.css` with base-theme + accent-preset layers**

Port `docs/brand/redesign-v2/tokens.css` (structural tokens + Midnight default) and fold in the alternate
bases + accent presets so selection is data-attribute driven. Structure:
```css
/* structural :root tokens (type/spacing/radii/z/motion) — unchanged from redesign-v2 */
/* base palettes, selected by [data-base] × [data-theme]: */
[data-theme="dark"], [data-theme="dark"][data-base="midnight"] { /* Midnight dark vars (default) */ }
[data-theme="light"], [data-theme="light"][data-base="midnight"] { /* Midnight light vars */ }
[data-theme="dark"][data-base="azure"]  { /* … from schemes.css … */ }
[data-theme="light"][data-base="azure"] { /* … */ }
/* repeat for mint, slate */
/* accent presets, selected by [data-accent] (override --accent* only): */
[data-accent="cyan"]    { --accent: …; --accent-strong: …; --accent-soft: …; --accent-ink: …; } /* default */
[data-accent="lime"]    { … } [data-accent="emerald"] { … } [data-accent="amber"] { … } /* etc. */
/* custom accent: vars set inline on <html> by the script (--accent* computed from --accent-hue) */
```
Copy the exact OKLCH values from `docs/brand/redesign-v2/schemes.css` (bases) and `accents.html` (presets).

- [ ] **Step 2: Author `app.css`** — copy `docs/brand/redesign-v2/app.css` verbatim.

- [ ] **Step 3: Import both from `index.ts`**
```ts
import "./tokens.css";
import "./app.css";
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/ui typecheck`
Then: `git add frontend/packages/ui/src/tokens.css frontend/packages/ui/src/app.css frontend/packages/ui/src/index.ts && git commit --no-verify -m "feat(ui): land Midnight design-system tokens + component layer"`

### Task A2: Accent-ramp helper (custom hue → contrast-safe accent vars)

**Files:** Create: `frontend/packages/ui/src/accent.ts`

**Interfaces:**
- Produces: `accentVars(theme: "light"|"dark", hue: number): Record<string,string>` returning
  `{ "--accent", "--accent-strong", "--accent-soft", "--accent-ink" }` with **fixed lightness/chroma per theme**
  (dark: L≈0.84/C≈0.13; light: L≈0.56/C≈0.13; soft/ink derived) so any hue stays AA. Also a string form
  `accentVarsCss(theme, hue)` reused inside `appearanceScript`.

- [ ] **Step 1: Write the failing test** `frontend/packages/ui/src/accent.test.ts`
```ts
import { accentVars } from "./accent";
// dark accent lightness is fixed regardless of hue → contrast preserved
const a = accentVars("dark", 128), b = accentVars("dark", 252);
if (!a["--accent"].includes("0.84") || !b["--accent"].includes("0.84")) throw new Error("lightness not clamped");
console.log("ok");
```
- [ ] **Step 2: Run** `cd frontend && npx pnpm@9.15.0 --filter @ip/ui exec npx tsx packages/ui/src/accent.test.ts` → FAIL.
- [ ] **Step 3: Implement** `accent.ts` with the clamped ramp (mirror redesign-v2 derivation; emit `oklch(L C hue)`).
- [ ] **Step 4: Run the test** → prints `ok`.
- [ ] **Step 5: Commit** `git add frontend/packages/ui/src/accent.ts frontend/packages/ui/src/accent.test.ts && git commit --no-verify -m "feat(ui): contrast-clamped custom-accent ramp"`

---

## Phase B — Preferences backend (admin gRPC; BE-owned)

### Task B1: `AppearancePrefs` model + defaults + clamp

**Files:** Create `src/admin/app/model/appearance_prefs.py`; Test `src/admin/tests/test_appearance_prefs.py`

**Interfaces:**
- Produces: `AppearancePrefs(mode, base, accent, accent_hue)` with defaults `mode="system"`, `base="midnight"`,
  `accent="cyan"`, `accent_hue=None`; `validate()` rejects unknown enum values; `accent_hue` clamped to 0–359
  and only honored when `accent == "custom"`.

- [ ] **Step 1: Write failing test**
```python
from app.model.appearance_prefs import AppearancePrefs, DEFAULTS
def test_defaults_mode_is_system():
    assert DEFAULTS.mode == "system" and DEFAULTS.base == "midnight" and DEFAULTS.accent == "cyan"
def test_custom_hue_clamped():
    p = AppearancePrefs.from_dict({"mode":"dark","base":"azure","accent":"custom","accent_hue":420})
    assert p.accent_hue == 60  # 420 % 360
def test_rejects_unknown_enum():
    import pytest
    with pytest.raises(ValueError): AppearancePrefs.from_dict({"mode":"neon"})
```
- [ ] **Step 2: Run** `bash scripts/check.sh` (or `pytest src/admin/tests/test_appearance_prefs.py`) → FAIL.
- [ ] **Step 3: Implement** the model: enums `MODE={system,light,dark}`, `BASE={midnight,azure,mint,slate}`,
  `ACCENT={cyan,lime,emerald,amber,coral,azure,custom}`; `from_dict` validates + clamps; `to_dict`.
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `git add src/admin/app/model/appearance_prefs.py src/admin/tests/test_appearance_prefs.py && git commit --no-verify -m "feat(admin): AppearancePrefs model (default mode=system)"`

### Task B2: `preferences.proto` + `PreferencesService` + persistence

**Files:** Create `src/admin/app/routes/pb/preferences.proto`, `src/admin/app/resources/preferences.py`,
`src/admin/app/routes/preferences.py`; Test `src/admin/tests/test_resources_preferences.py`, `test_preferences_grpc.py`

**Interfaces:**
- proto `admin.preferences.v1.PreferencesService` with `rpc GetAppearance(Empty) returns (Appearance)` and
  `rpc UpdateAppearance(Appearance) returns (Appearance)`; `Appearance { string mode=1; string base=2; string accent=3; uint32 accent_hue=4; }`.
- Persistence: `user_preferences` collection, `_id = <user_id from token>` (works for candidate + company alike);
  Get returns stored-or-DEFAULTS; Update validates via the model, upserts, returns the stored doc.

- [ ] **Step 1: Write failing resource test**
```python
def test_get_returns_defaults_when_absent(fake_db, user_token):
    out = get_appearance(fake_db, user_token.sub)
    assert out["mode"] == "system"
def test_update_then_get_roundtrips(fake_db, user_token):
    update_appearance(fake_db, user_token.sub, {"mode":"dark","base":"mint","accent":"custom","accent_hue":300})
    assert get_appearance(fake_db, user_token.sub)["base"] == "mint"
def test_update_rejects_bad_enum(fake_db, user_token):
    import pytest;  from app.errors import InvalidArgument
    with pytest.raises(InvalidArgument): update_appearance(fake_db, user_token.sub, {"mode":"plaid"})
```
- [ ] **Step 2: Run** `pytest src/admin/tests/test_resources_preferences.py` → FAIL.
- [ ] **Step 3: Implement** `resources/preferences.py` (`get_appearance`, `update_appearance` using the model +
  `user_preferences.update_one(upsert=True)`), the proto, the thin `PreferencesServicer` (token → `sub`), and
  register the servicer. Run `pnpm gen` is FE-side; here regenerate `*_pb2*`.
- [ ] **Step 4: Run** `bash scripts/check.sh` → green (baseline + new tests).
- [ ] **Step 5: Commit** explicit paths: model already committed; add proto + gen + resources + routes + tests:
  `git commit --no-verify -m "feat(admin): PreferencesService.{Get,Update}Appearance (per-user, token-scoped)"`

### Task B3: Regenerate the FE gRPC client

- [ ] **Step 1:** `cd frontend && npx pnpm@9.15.0 gen` → `packages/api-client/src/gen` gains `preferences_pb`/client; `useAuth().api.preferences.{getAppearance,updateAppearance}` exists.
- [ ] **Step 2:** Typecheck `--filter @ip/api-client`; commit the gen output (BE-owned paths).

---

## Phase C — Appearance frontend (provider + pre-paint + settings UI)

### Task C1: `appearanceScript` (pre-paint) + `AppearanceProvider`/`useAppearance`

**Files:** Create `frontend/packages/ui/src/appearance.tsx`; Modify `theme.tsx` (re-export `ThemeToggle` to drive mode), `index.ts`.

**Interfaces:**
- Consumes: `accentVars`/`accentVarsCss` (A2).
- Produces: `appearanceScript` (string) reading `localStorage["aptura.appearance"]` `{mode,base,accent,accentHue}`,
  resolving `mode→data-theme` (system via `matchMedia`), setting `data-base`, `data-accent`, and (for custom)
  inline `--accent*`; `AppearanceProvider` (loads server prefs when authed via injected client, else cache/defaults;
  exposes `{ prefs, setMode, setBase, setAccent, resolvedTheme, mounted }`, write-through to cache + server);
  `useAppearance()`.

- [ ] **Step 1:** Write `appearanceScript` mirroring `themeScript` but for `{mode,base,accent,accentHue}` (system
  resolves via `matchMedia('(prefers-color-scheme: dark)')`); set `data-theme/-base/-accent` + inline accent vars for custom.
- [ ] **Step 2:** Write `AppearanceProvider` (SSR-stable: first render uses defaults; mount reads cache; an effect
  hydrates from the injected `AppearanceClient` when a token is present; a `matchMedia` listener re-resolves when
  `mode==='system'`). `setMode/setBase/setAccent` apply to `<html>` immediately, cache, and persist (optimistic).
- [ ] **Step 3:** Export from `index.ts`; have `ThemeToggle` cycle `system→light→dark` (or keep a 3-state control).
- [ ] **Step 4:** Typecheck `--filter @ip/ui`; commit.

### Task C2: Appearance settings client (typed mock seam)

**Files:** Create `frontend/apps/candidate/app/settings/appearance-client.ts`

**Interfaces:**
- Produces: `interface AppearanceClient { get(): Promise<AppearancePrefs>; set(p: AppearancePrefs): Promise<AppearancePrefs>; queryKey(): readonly string[] }`,
  `makeMockAppearanceClient()` (in-memory, defaults mode=system), `createAppearanceClient(api)` →
  `api.preferences.{getAppearance,updateAppearance}` (camelCase per protobuf-es). Gated by `NEXT_PUBLIC_MOCK`.

- [ ] **Step 1:** Define the interface + DTO (mirrors BE `Appearance`).
- [ ] **Step 2:** Implement mock + real; select by `NEXT_PUBLIC_MOCK` (same pattern as `saved-jobs-client.ts`).
- [ ] **Step 3:** Typecheck `--filter @ip/candidate`; commit.

### Task C3: Appearance settings tab UI

**Files:** Create `frontend/apps/candidate/components/settings/appearance-tab.tsx`; Modify the settings pages
(candidate `app/settings` + the `/company/settings` area) to mount it as an "Appearance" tab.

**Interfaces:**
- Consumes: `useAppearance()` + the `AppearanceClient` (via provider). Renders + persists prefs.

- [ ] **Step 1:** Build the tab: a **Theme** segmented control (`Device default` / `Light` / `Dark`, default
  reflects `mode`), a **Base theme** swatch row (Midnight/Azure/Mint/Slate previews), an **Accent** swatch row
  (presets + a "Custom" hue slider), and a **live preview** card (a mini KPI + pill + button reflecting choices).
  Each change calls `setMode/setBase/setAccent` (instant apply + persist). Respect reduced-motion.
- [ ] **Step 2:** Mount as a tab in both settings areas (candidate + company) — same component, both persist via
  the per-user service.
- [ ] **Step 3:** Build + browser-verify (toggle each option, reload → persists; switch OS theme with mode=system → follows).
- [ ] **Step 4:** Commit (explicit paths).

### Task C4: Wire the provider into the unified app shell

**Files:** Modify the unified app root layout (swap `themeScript`→`appearanceScript`, wrap `AppearanceProvider`
with the role-appropriate `AppearanceClient`).

- [ ] **Step 1:** Replace the pre-paint script + wrap provider; pass the real/mock client.
- [ ] **Step 2:** Build + browser-verify no FOUC (hard refresh on a custom accent/base shows correct colors on first paint).
- [ ] **Step 3:** Commit.

---

## Phase D — Screen adoption (reskin real screens to the new system)

> Gated on the unification + the other session's edits landing. **Appearance-only**; no behavior change.

**Per-screen recipe (repeat for each screen; one commit per screen):**
1. Wrap the screen body in the `.app` shell (sidebar + topbar + content) or marketing layout, per its role.
2. Replace ad-hoc Tailwind color classes with the token component classes (`.card/.kpi/.pill*/.table-wrap/
   .btn*/.ring/.bar/.tabs/.badge`) — using `docs/brand/redesign-v2/<screen>.html` as the visual reference.
3. Keep all data/query/handler code identical (copy structure from the existing screen; change only markup/classes).
4. Build + browser-verify the screen (signed-in for its role) matches the mockup; commit.

**Screen list (reference mockups in `docs/brand/redesign-v2/`):** landing → `landing.html`; candidate dashboard
→ `dashboard-candidate.html`; recruiter dashboard → `dashboard-recruiter.html`; marketplace/search →
`marketplace.html`; applicants pipeline → `applicants-pipeline.html`; candidate report → `candidate-report.html`.
**Remaining screens (build new mockups first, then port):** auth, profile, job-detail, company-profile, saved,
alerts, post-a-job, talent, branding, team, messaging, notifications, settings shell, practice, feedback,
scheduling, proctored-interview, coding-assessment.

- [ ] Port each screen per the recipe; **a screen is a task**; build green + browser-verified + per-screen commit.

---

## Self-Review

- **Spec/requirements coverage:** theme tri-state default=system → C1/C3 + B1 default; accent picker (presets +
  custom clamped) → A2/C3 + B1/B2; background as curated base → A1/C3; per-user persistence both roles → B2
  (token-scoped `user_preferences`); screens ported → Phase D + A1/app.css. ✓
- **Placeholders:** none — base/accent OKLCH values are sourced from the committed `redesign-v2/schemes.css` +
  `accents.html`; the two genuinely-derived pieces (accent ramp, model clamp) have failing-test-first tasks. ✓
- **Type consistency:** `AppearancePrefs {mode,base,accent,accentHue}` identical across BE model (B1), proto
  (B2), FE client DTO (C2), provider (C1); enum value sets fixed in B1 and mirrored in tokens.css `[data-base]`/
  `[data-accent]` (A1). `mode` default `system` everywhere. ✓
- **No-behavior-change (Phase D):** recipe step 3 freezes data/handlers; verification is visual + build. ✓

## Execution handoff

Plan saved. **Order:** Phase B (backend, no FE collision) + Phase A (token authoring in `@ip/ui`) can start now;
Phase C after A; **Phase D only after** the v2 unification lands and the parallel session's `frontend/` edits
are merged. Two execution options: **(1) Subagent-driven** (fresh subagent per task, review between) or
**(2) Inline** (executing-plans with checkpoints).
