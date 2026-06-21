# Company branding — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the company branding editor at `/company/branding` from scratch in the Aperture Pro design
language. The page is a two-column workspace: a **branding form** on the left (logo upload,
display name, about, website, industry, locations, size) and a **live preview card** on the right
that mirrors how the company will read on the public marketplace `/companies/[id]` and on every
job-detail page. The backend stays frozen — `CompanyProfileService.GetCompanyProfile`,
`UpsertCompanyProfile`, and `PresignLogoUpload` are reused verbatim, only the UI is new.

The preview is **a presentational mirror of the form's own state** — never a second fetch,
never a stale snapshot. Every edit re-renders the right column immediately so the recruiter sees
exactly what a candidate would see before they click Save.

## Route + role

`/company/branding` (`apps/company/app/branding/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`; do not
re-implement). Non-managers are redirected by the shell before this page renders.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — the `.app` company shell, `.cell` bento, form `.input` / `.textarea` tokens, `.btn-primary` /
  `.btn-ghost` buttons, `.avatar` logo treatment, `.pill`/`.badge` chips, `.tag` mono micro-labels.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design-language demo IS the reference. Task 0 below
captures the screen-specific composition (form column + live preview column) as a standalone HTML
preview; the React build mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/branding/page.tsx` — page body (form composition + save handler)
- `frontend/apps/company/components/logo-upload.tsx` — logo picker (replaced with a new
  `.avatar` + `.btn-ghost` upload chip + drop zone matching the design language)
- Any local rendering helpers under `apps/company/app/branding/` that emit the v2/Midnight markup

What is **NOT** touched: `apps/company/app/branding/branding-client.ts` (the mock seam +
`makeMockBrandingClient` / `realBrandingClient` swap), `apps/company/app/branding/branding-types.ts`
(`CompanyProfileDTO`, `BrandingForm`, `LOGO_ACCEPTED_MIME`, `LOGO_MAX_BYTES`),
`apps/company/components/company-shell.tsx` (the `.app` shell + role gate), the
`uploadViaPresign()` helper, or any `*.proto` / generated `@ip/api-client` types.

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/branding/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Branding** entry carries `aria-current="page"`. Topbar crumb = `<Company> / Branding`. |
| 1 | Page head | `<BrandingHead />` | h1.display "Company branding" + `.sub` ("How your company appears to candidates in the marketplace and on every role you post."). Trailing **Save changes** `.btn.btn-primary` (sticky on scroll under 760px). |
| 2 | Form column | `<BrandingForm />` | Left column (`span 7` ≥1100px, full width ≤760px). One `.cell` containing the logo row (`<LogoUpload />`), then `Field`-wrapped `.input`s in this order: display name · website · industry (select with curated list) · about (`.textarea`, 4 rows) · locations (comma-separated `.input`) · size (select). Validation messages render as inline `.sub` lines under the field; the Save button is duplicated at the bottom for long-form discoverability. |
| 3 | Logo row | `<LogoUpload />` | Inside the form `.cell`. Left = `.avatar` (96×96, rounded `--radius-lg`) showing the current `logoUrl` (presigned GET) or a teal-gradient placeholder with the brand initial. Right = stacked **Upload logo** `.btn.btn-ghost` (opens `sr-only` file input) + a mono `.sub` listing the constraints ("PNG / JPEG / WebP · up to 2 MB"). On busy → button shows an inline spinner; on validation error → a `.pill-warn` chip below; on success → `.avatar` re-renders the new key. |
| 4 | Preview column | `<BrandPreview />` | Right column (`span 5` ≥1100px, full width ≤760px). One `.cell.tight` mounted **sticky** at the top of its column (`top: 88px`) carrying a `.tag` mono ("PREVIEW · MARKETPLACE CARD"), then the marketplace company snippet: `.avatar` (mirrors the form's logo state) + display name (Schibsted 700) + an industry/size `.pill` row + a location `.badge` chip cloud + a 3-line clamp of the About. **Reads the same `form` state and preview URL the editor already holds** — no new query, no separate fetch. |

Bento collapse rules (already in the design language): the 7+5 layout stacks at the mid
breakpoint (form first, then preview) and full-bleeds ≤760px. The sticky-preview behavior degrades
to inline rendering on stack.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.btn.btn-primary` | typography + button tokens |
| Form card | `.cell` with `Field` + `.input` / `.textarea` / `select.input` | `--surface`, `--line`, `--ink`; input focus uses `--teal` 2px halo |
| Logo avatar | `.avatar` (96×96, `--radius-lg`) | gradient fallback uses `linear-gradient(135deg, var(--teal), var(--teal-strong))` |
| Upload button | `.btn.btn-ghost` + `sr-only` `<input type="file">` | 46px height, 12px radius |
| Validation chip | `.pill-warn` (size + MIME guard messages) | `--warn` token |
| Preview card | `.cell.tight` (sticky in its column) | `--surface`, `--line`; teal-tinted background optional via `color-mix(in oklch, var(--teal) 6%, var(--surface))` |
| Pills / badges | `.pill` (industry, size), `.badge` (locations) | semantic tokens — never raw color |
| Save CTA | `.btn.btn-primary` (header + bottom of form) | 46px height |

All new primitives live in `@ip/ui/src/app.css` (one shared file). No new tokens — everything
resolves through the resolved accent (`--teal`) and the resolved base palette. **No
side-stripe borders** on the preview; use the full surface + border via `--line`.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| Form seed | `useAuthedQuery(token, …, () => brandingClient.getProfile())` (`brandingClient = USE_MOCK_BRANDING ? makeMockBrandingClient() : realBrandingClient(api)`) → seeds `form` state via `useEffect` | `["company-profile"]` | `CompanyProfileService.GetCompanyProfile` (mock today, real after `pnpm gen`) |
| Save | `useMutation(() => brandingClient.upsertProfile(form))` → on success `qc.invalidateQueries(["company-profile"])` + `toast.success("Branding updated")` | n/a | `CompanyProfileService.UpsertCompanyProfile` |
| Logo presign | `await brandingClient.presignLogo({ contentType, size })` → `{ url, logoKey }` → `uploadViaPresign(url, file)` (plain `fetch`, no bearer; the presign carries its own auth) → set `form.logoKey` + bump the preview URL | n/a | `CompanyProfileService.PresignLogoUpload` |
| Preview | render-only over `form` state + the resolved `logoUrl` (either the seed's `logoUrl` or a `blob:` URL from the just-uploaded file for instant feedback before save) | n/a | derived |

**Anti-fiction guard.** The preview renders only what the recruiter has typed; never invent a
fallback name, fake locations, or a placeholder industry. On first-run (no profile yet, `Upsert`
creates the row), the preview shows truthful empties — "Add a display name to preview" /
"Add locations to preview" — never a fabricated "Sample company" card.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/company-branding.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from the
> design language; build the 7+5 (form + preview) composition with a clearly-labelled "Sample
> company" filled in. Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + page head + form scaffolding.** Mount the page under `CompanyShell`; render
  `<BrandingHead />` and the empty `<BrandingForm />` card with all fields wired to local `form`
  state seeded from `["company-profile"]`. Save is disabled until at least the display name is
  present. Verify the form collapses cleanly on mobile and the page head's CTA is sticky on
  scroll under 760px. Commit `apps/company/app/branding/page.tsx`,
  `apps/company/components/branding/{branding-head.tsx,branding-form.tsx}`.

- **Task 2 — Logo upload row.** Build `<LogoUpload />` with the `.avatar` + `.btn-ghost` + mono
  `.sub` constraints chip. Wire the `sr-only` file input through `brandingClient.presignLogo` +
  `uploadViaPresign`. Enforce the MIME allowlist (`LOGO_ACCEPTED_MIME`) and the 2 MB cap
  (`LOGO_MAX_BYTES`) **client-side** with `.pill-warn` validation chips; the server is the real
  guard. On success, bump the preview to a `blob:` URL for instant feedback and set `form.logoKey`.
  Verify pick → preview swap, SVG → validation error, oversize → validation error, success →
  preview swap. Commit `apps/company/components/branding/logo-upload.tsx`.

- **Task 3 — Live preview card.** Build `<BrandPreview />` reading from the same `form` state and
  preview URL the form holds. Render the marketplace snippet: `.avatar` + display name + `.pill`
  industry/size row + location `.badge` chips + 3-line About clamp. The card is sticky in its
  column (`top: 88px`) on desktop and inline on mobile. Verify the preview updates on every
  keystroke and that the empty-field copy is truthful (no fake placeholder content). Commit
  `apps/company/components/branding/brand-preview.tsx`.

- **Task 4 — Save + invalidation.** Wire the Save button to the existing `save` mutation. On
  success → `qc.invalidateQueries(["company-profile"])` + `toast.success("Branding updated")`; on
  error → `toast.error(errorMessage(err))`. The Save button shows an inline spinner while pending
  and is disabled if the form is dirty-invalid. Verify a round-trip in mock and (after
  `pnpm gen`) real: edit → Save → preview persists on reload. Commit the wiring inside the page.

- **Task 5 — Page assembly + fidelity verify.**
  1. `apps/company/app/branding/page.tsx` mounts `<CompanyBranding />` inside `<CompanyShell>`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a recruiter, screenshot `/company/branding` in both themes
     at 1440×900 and 390×844 against the Task-0 HTML and the design-language reference. Iterate
     any divergence until 1:1. Commit verify shots under
     `docs/brand/redesign-v3/verify/company-branding-{light,dark}.jpeg`.
  4. Confirm a non-manager is still redirected by `CompanyShell` — the role gate is unchanged.
  5. Confirm the mock→real seam flips from `makeMockBrandingClient()` to `realBrandingClient(api)`
     only — components unchanged; the same `BrandingForm` shape is sent to `UpsertCompanyProfile`.

## States & a11y

- **States.** Each region behaves independently:
  - **Loading** — form renders `LoadingState` skeletons for each field; preview renders an empty
    `.cell.tight` with the `.tag` micro-label.
  - **First-run** (no profile yet) — form opens on empty fields with truthful inline `.sub`
    hints; Save creates the row via `Upsert`. Preview shows "Add a display name to preview".
  - **Logo busy** — upload button shows an inline spinner; the avatar shows a shimmer overlay.
  - **Logo validation error** — `.pill-warn` chip below the upload row ("PNG / JPEG / WebP only"
    or "Logo must be 2 MB or smaller"); the avatar is unchanged.
  - **Logo success** — avatar swaps to the new key; preview swaps in lock-step.
  - **Save pending** — Save button shows an inline spinner and is disabled.
  - **Save success** — `toast.success("Branding updated")` + `["company-profile"]` invalidation;
    the seed re-renders to confirm persistence.
  - **Error** — `ErrorState` on the form (with retry) for the seed read; `toast.error` for the
    mutation; the upload row surfaces its own validation chip.
- **Responsive.** Sidebar collapses ≤1000px per the design language. Form + preview 7+5
  ≥1100px → stacked (form first, then preview) at the mid breakpoint → full-bleed ≤760px. The
  preview is sticky on desktop, inline on mobile.
- **Dark + light.** All color via tokens; the avatar gradient placeholder, button surfaces, and
  preview tint resolve cleanly in both themes and inherit per-user Appearance accent overrides.
- **A11y.** One `<h1>` per page (the head). `<main>` + `<form>` landmarks. Every input is in a
  labelled `Field`; validation messages render as `aria-live="polite"` `.sub` lines. The file
  input is `sr-only` inside a real `<label>` (keyboard + SR reachable); the upload button is the
  visible affordance. The preview avatar has an `alt` (the display name, or "Company logo
  placeholder" when empty). Touch targets ≥44×44. Contrast ≥4.5:1 body (`--ink-2` on `--bg`).
  Focus rings: `:focus-visible` uses `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/company-branding-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `CompanyProfileService.GetCompanyProfile`,
  `UpsertCompanyProfile`, `PresignLogoUpload` calls (mock today, real after `pnpm gen`), same
  `["company-profile"]` query key, same `uploadViaPresign` double-gate (MIME + size client-side,
  server is the real guard), same `BrandingForm` shape on save. The mock→real seam flips from
  `makeMockBrandingClient()` to `realBrandingClient(api)` only — components unchanged.
- The preview is a pure render of the form's own state — no second query, no stale snapshot.
  Empty-field copy is truthful (no fake company name).
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, the avatar
  gradient, button surfaces, and focus rings without a code change.
- A non-manager loading `/company/branding` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
