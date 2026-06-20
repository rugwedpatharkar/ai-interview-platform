# Frontend — `company-branding` (Midnight v3)

> **Screen:** Company branding editor · **Goal:** reskin the existing branding editor to the **Midnight Intelligence** `.app` company shell — a flat branding form (display name, about, website, industry, locations, size), a logo-upload picker, and a **live preview card** of how the company reads in the marketplace — **reusing every handler/query verbatim** (presentational only, zero behavior change).
> **Unified route + role:** `/company/branding` · company (`company_admin`/`recruiter`, manager-scoped, mounted under the `.app` shell at `/company/*`).
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/company-branding.html` (a two-column layout: branding form card left, logo-upload + live preview card right).
> **Existing code it reskins:**
> - `frontend/apps/company/app/branding/page.tsx` (the editor: `useAuthedQuery(["company-profile"])` seed → `form`/`locationsRaw` state → `save` `useMutation` → `client.upsertProfile`)
> - `frontend/apps/company/components/logo-upload.tsx` (the `sr-only` file picker + `uploadViaPresign` + `Avatar`/`img` preview + validation `Alert`)
> - `frontend/apps/company/app/branding/branding-client.ts` (`makeMockBrandingClient()`; real binding to `api.companyProfile.*` after `pnpm gen`)
> - `frontend/apps/company/app/branding/branding-types.ts` (`CompanyProfileDTO` / `BrandingForm` / `LOGO_ACCEPTED_MIME` / `LOGO_MAX_BYTES`)
> - `frontend/apps/company/components/company-shell.tsx` (the `.app` sidebar+topbar shell + `NAV` `Branding` entry — reskinned to Midnight)

## Layout & components
- **Shell:** the `.app` **sidebar + topbar** shell (`CompanyShell` → `.app · .side · .navitem · .main · .topbar · .content`). `Branding` is the active `.navitem[aria-current="page"]`. `.page-head` carries the title "Company branding" + sub "How your company appears to candidates in the marketplace."
- **Form card (flat):** a `.card` wrapping the `<form>` — `Field`+`Input` for display name / website / industry (`.input` token styling), `Textarea` for about, comma-separated `Input` for locations, `Select*` for size, and the **logo row** (`LogoUpload`: `.avatar` preview + a `.btn-ghost`/`.btn-sm` upload label). Save is a `.btn-primary` (`--accent`).
- **Live preview card:** a `.card.tight` rendering the marketplace company snippet from the current `form` state — `.avatar` (logo) + display name (`--font-display`) + industry/size `.pill .pill-neutral` + a `.badge` row of locations + truncated about. **Reads the same `form`/preview URL the editor already holds** (it's a presentational mirror — no new query/state beyond what `page.tsx` keeps today).
- **New vs reused:** **no new components** — `CompanyShell`, `LogoUpload`, `Card`, `Field`, `Input`, `Textarea`, `Select*`, `Button`, `Avatar`, `Alert`, `PageHeader`, `LoadingState`, `ErrorState`, `toast` all reused; only token classes/markup change to match the Midnight mockup. (The live-preview block already mirrors `form`; if it isn't a separate component today, lift it into a local `BrandPreview` rendered from the same state — **no data change**.)

## Data wiring (kept identical to today)
- **Client/seam:** `makeMockBrandingClient()` (swap → `realBrandingClient(api)` binding `api.companyProfile.getCompanyProfile/upsertCompanyProfile/presignLogoUpload` after `pnpm gen`). Logo PUT via `uploadViaPresign` (plain `fetch`, the presign carries its own auth).
- **TanStack query keys:** `["company-profile"]` (seed the editor; invalidated after `upsertProfile`).
- **Consumes** (`backend_company-branding.md`): `getProfile()` → `CompanyProfileDTO` (`displayName`, `logoKey`, `logoUrl`, `about`, `website`, `locations[]`, `industry`, `size`); `upsertProfile(BrandingForm)`; `presignLogo({contentType,size})` → `{url, logoKey}`. **No field added or removed.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/company-branding.html` against `tokens.css` + `app.css`: the `.app` shell with `Branding` active, a `.page-head`, a left `.card` branding form (logo row + fields + `.btn-primary` Save), and a right `.card.tight` live preview (avatar + display name + `.pill` industry/size + location `.badge`s + about). Browser-verify on the `:4173` preview (dark **and** light). Commit `docs/brand/redesign-v2/company-branding.html`.
- [ ] **Task 1 — wrap in the shell + reskin the form card.** In `branding/page.tsx`, keep `CompanyShell`/`PageHeader`/the `useAuthedQuery` + `save` mutation **verbatim**; swap ad-hoc Tailwind colors (`text-muted-foreground`, etc.) → token component classes/vars to match the mockup. **Do not touch** the `form`/`locationsRaw` state, `useEffect` seed, `save.mutate()`, or `qc.invalidateQueries`. Build + browser-verify `/company/branding`; commit explicit path.
- [ ] **Task 2 — reskin `LogoUpload`.** Swap the picker's ad-hoc classes for `.avatar` + `.btn-ghost .btn-sm` label + `Alert` token styling to match the mockup. Keep `onPick`/`uploadViaPresign`/`onUploaded`/the `accept` allowlist + `sr-only` input **verbatim**. Build + browser-verify (pick a logo → preview updates; SVG → `Alert`; oversize → `Alert`); commit.
- [ ] **Task 3 — add the live-preview card.** Render a `BrandPreview` (local, from the same `form` + preview URL) in the right column to match the mockup. It is a **read-only mirror of existing state** — no new query, no new handler. Build + browser-verify the preview updates as the form edits; commit.

> **Restyle discipline:** the diff per file is markup/classes only. If a task touches a handler, `useMutation`, the presign flow, or an RPC call — **stop**, it's out of scope. The preview is a pure render of state the page already holds.

## States & a11y
- **States (preserved, named):** **loading** (`LoadingState` while `["company-profile"]` resolves); **error** (`ErrorState` + retry); **first-run** (no profile → empty fields, `Upsert` creates the row); **logo busy** (`Spinner` in the label) / **logo validation error** (`Alert` — SVG or oversize) / **logo success** (preview swaps); **save pending** (button spinner) / **success** (toast + `["company-profile"]` invalidation).
- **Responsive:** form / preview are a two-column grid collapsing to one column under `lg:`; the website/industry and locations/size sub-grids are `sm:grid-cols-2` stacking at ~375px; the logo row wraps.
- **Dark + light:** all tokens (`--surface`/`--line`/`--ink`/`--accent`) — auto-themes; no hardcoded hex.
- **A11y:** every field in a labelled `Field`; the file input is `sr-only` with a real `<label>` wrapper (keyboard + SR reachable); `Alert` announces validation failures; preview avatar has an alt; focus ring `--accent-strong`; contrast ≥4.5:1.

## Acceptance
- Matches `company-branding.html`; build/typecheck green; **zero functional diff** (the editor seeds, edits, logo-uploads with the double-gate, and saves exactly as today); the read DTO is the same `CompanyProfileDTO`; mock→real path unchanged (flip `makeMockBrandingClient()` → `realBrandingClient(api)` only).
