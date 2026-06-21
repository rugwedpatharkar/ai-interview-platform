# Job detail — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR job-detail surface at `/jobs/[id]`. SSR streams the full JD (title, company,
location, work mode, employment type, salary band, skills, posted-at, full job description) so
search engines and signed-out visitors get the whole page in initial HTML. The Apply island and
SaveJobButton are `"use client"` and gate on auth. Replace every byte of the old v2 detail UI
(which used the `.app` shell + a single Midnight reskin card) with a brand-new **public
marketing-style** surface built from Aperture Pro primitives — same mega-nav + utility rule as
the landing, a wide editorial container, a bento-leaning detail layout with an anchor JD cell
and a sticky "apply panel" side cell. Behavior, SSR fetch seam, `notFound()` handling, consent
contract, Apply RPC, and cache invalidations are all unchanged. Only the UI is new. Pre-launch
posture throughout — no fake employer outcomes, no claimed integrations, no fabricated company
reviews.

## Route + role

`/jobs/[id]` (`frontend/apps/candidate/app/jobs/[id]/page.tsx`) · **public** (token-free initial
SSR; Apply + Save are `"use client"` islands that gate on auth). No `.app` shell — this is the
same **public marketing-style** shell as the landing and `/jobs`.

## Approved mockup (build to this exactly)

- **Interactive demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — design-language reference. The job detail is a new public surface inside the same shell;
  build the layout grammar from the demo's nav + wide container + anchor `.cell` + supporting
  side cell + section rhythm.
- **Light-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
- **Light-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
- **Dark-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
- **Dark-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`

No per-screen mockup file exists yet; this plan is the spec until one is added. Side-by-side
screenshot proof against the design language is part of the acceptance criteria — see
"Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files are re-written from scratch; do not port markup
or Tailwind classes):

- `frontend/apps/candidate/app/jobs/[id]/page.tsx` — SSR server component
- `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx` — `"use client"` consent + Apply (logic frozen — markup rebuilt)
- `frontend/apps/candidate/app/jobs/[id]/not-found.tsx` — not-found surface
- `frontend/apps/candidate/app/jobs/[id]/error.tsx` — error boundary surface
- `frontend/apps/candidate/components/job-meta.tsx` — meta pill row
- `frontend/apps/candidate/components/save-job-button.tsx` — markup rebuilt; auth-gating + query keys unchanged

**Untouched (data + behavior seam — FROZEN):**

- `frontend/apps/candidate/app/jobs/[id]/detail-client.ts` — `detail = USE_MOCK ? makeMockDetailClient() : getPublicJobDetail`
- `frontend/apps/candidate/app/jobs/[id]/types.ts` — `JobDetailDTO`, `PublicCompany`, `RemoteMode`, `EmploymentType`
- `fmtSalary(job)` helper
- `generateMetadata({params})` (title/description) and `notFound()` on 404
- Apply contract: `api.applications.apply({ jobId, consent })`, the
  `job-consent:<id>` localStorage key, invalidation of `["recommendations"]` + `["applications"]`,
  and the `router.push("/")` on success
- `SaveJobButton` query keys (`["saved-jobs","ids"]`) and signed-out null-render behavior

## Layout & components — map to `@ip/ui` primitives and tokens

Public marketing-style surface. Use the **landing shell** (mega-nav + utility rule + mega-footer)
already moved into `@ip/ui` by the landing plan's Task 1. Below the shell sits a wide
container (`.wrap`) with a breadcrumb, a hero header, and a 2-column detail bento.

| Region | Component (new) | Tokens / primitives |
|---|---|---|
| Top utility rule | reused `<UtilityRule />` from `@ip/ui` | pre-launch coral pill + meta + right link |
| Sticky mega-nav | reused `<MegaNav />` from `@ip/ui` | brand + 6 nav links + audience switch + `Sign in` + primary CTA |
| Breadcrumb | `<JobBreadcrumb />` (new) | thin row inside `.wrap`: `← All roles` link in Geist Mono `--step--1`, hover-underline `--ink-2`; renders `Jobs · Company name` separated by mono `·` |
| Hero header | `<JobHero />` (new) | section padding `clamp(3rem,5vh,4rem) 0`; left = Avatar (56px company logo) + a column with company name `--ink-2 --step-0` + `h1.display` title at `--step-3/-4` (Schibsted 700, `text-wrap: balance`); right = `<JobMetaPanel />` |
| Meta panel | `<JobMetaPanel />` (new) | right-aligned vertical stack of meta lines: location with `MapPin` icon + text; work mode `.pill-teal`; employment type `.pill`; salary band `.pill-good` (uses `fmtSalary(job)`; renders nothing when band is incomplete); posted-at as Geist Mono `--step--1`; on mobile this collapses below the title as a wrapping pill row |
| Save action | `<SaveJobButton />` (new markup, frozen wiring) | `.btn.btn-ghost.btn-sm` with `Bookmark` icon; toggles to `.btn.btn-coral.btn-sm "Saved"` when in `["saved-jobs","ids"]`; renders `null` when signed out |
| Detail bento | `.detail-bento` (new class in `@ip/ui/src/app.css`) | CSS grid `1.6fr 1fr` ≥1100px (anchor + side); single column <1100px; gap 1.5rem |
| JD anchor | `<JdAnchor />` (new) | `.cell.anchor` (large gradient-tinted teal-soft cell, 22px radius, 1.6rem padding); h2 `About the role` in display; JD body rendered from `jdText` with `whitespace-pre-wrap`, body type `--step-0` `--ink-2`, line-length capped 65–75ch; a skills row at the bottom — Geist Mono `--step--1` legend "Skills" + `.badge` mono chips |
| Apply side cell | `<ApplyPanel />` (new) | sticky `.cell` at `top: 96px` ≥1100px; structure: small Geist Mono micro-label `Apply`, a brief lead line ("One strictly proctored interview · no second takes"), a labelled consent `<Checkbox />` ("I agree to a strictly proctored interview and on-device proctoring"), a primary `.btn.btn-primary.btn-lg` Apply button (disabled until checked, shows loading spinner during the RPC), and a small footnote in `--ink-3` linking to the privacy summary. Signed-out: replaces the consent + button with a single ghost `<Link href="/login?return=…">.btn` "Sign in to apply". After a successful apply: morphs into a `.pill-good` success line ("Applied · check your inbox") before the router push to `/`. |
| Strict proctored band | `<ProctoredBand />` (new) | a thin token-aligned row below the bento with three `.pill` chips ("Camera + mic required", "No mute · no camera-off", "Server-authoritative auto-end on HIGH"); honest, architectural — see anti-fiction rule |
| Not-found | `<NotFoundCard />` (in `not-found.tsx`) | a centered `.cell` with `eye-off` icon, h2 "Role unavailable", body "This role may have been closed or is not yet public.", a primary `.btn.btn-primary` "Browse open roles" → `/jobs` |
| Error | `<ErrorCard />` (in `error.tsx`) | centered `.cell` with `danger` pill, h2 "Couldn't load this role", a `Try again` ghost button that calls `reset()` |
| Footer | reused `<MegaFooter />` from `@ip/ui` | 6-col sitemap + truthful badges + legal row |

All new classes (`.detail-bento`, `.cell.anchor` consumer styles) live in `@ip/ui/src/app.css`
(shared with marketplace + company-profile). Icons (`MapPin`, `Bookmark`, `eye-off`, `danger`)
come from the existing `@ip/ui/src/sprite.tsx` — extend the sprite once, do not import per page.

## Data wiring / seam (FROZEN — preserve verbatim)

- **SSR fetch.** `page.tsx` calls `detail(id)` (the `detail-client.ts` seam) inside a `try`;
  on 404 it calls `notFound()`, on `UNAVAILABLE` / 5xx it rethrows so Next's `error.tsx`
  catches it. `next: { revalidate: 120 }` is preserved.
- **Client seam unchanged.** `detail-client.ts` still exports
  `detail = USE_MOCK ? makeMockDetailClient() : getPublicJobDetail` against
  `GET /public/jobs/{id}` (snake_case wire → camelCase DTO). `NEXT_PUBLIC_MOCK=1` flips to the
  fixture; the fixture's `id === "404"` still throws `not_found`.
- **No query key on the page** — server fetch only. `<ApplyPanel />` uses `useMutation` (no
  key) → `api.applications.apply({ jobId, consent })`; on success it clears
  `localStorage["job-consent:<id>"]`, invalidates `["recommendations"]` and `["applications"]`,
  and calls `router.push("/")`. **Byte-for-byte preserved.**
- **Consent localStorage key.** The consent checkbox writes `job-consent:<id>` on change so a
  refresh restores the checked state; cleared on successful apply. Unchanged.
- **`SaveJobButton`** reads/writes `["saved-jobs","ids"]`; renders `null` when signed out.
- **Fields consumed** (per `backend_job-detail.md`): `JobDetailDTO { jobId, title, jdText,
  location, remoteMode, employmentType, salaryMin, salaryMax, salaryCurrency, skills, postedAt,
  company { id, name, logo } }`.
- **`generateMetadata({params})`** unchanged — sets `<title>` and `<meta description>` from
  the fetched DTO.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** Aperture Pro is approved. No per-screen mockup
> file required. The detail bento + sticky apply panel are direct applications of the
> `.cell.anchor` + supporting `.cell` vocabulary in the demo.
>
> **Task 1 — Design system primitives** already live in `@ip/ui` from the **landing plan's
> Task 1** (tokens, app.css, sprite, fonts). This screen REUSES them. Any new primitive
> (`.detail-bento` grid, the `Bookmark`/`eye-off`/`MapPin` sprite additions) is added to the
> shared `@ip/ui/src/app.css` and `@ip/ui/src/sprite.tsx` in Task 1 below.

- **Task 1 — Public shell + breadcrumb + hero.** Mount the shared `<UtilityRule />` +
  `<MegaNav />` + `<MegaFooter />` on this route. Build `<JobBreadcrumb />` and `<JobHero />`
  (Avatar + company + display title + `<JobMetaPanel />` on the right). Add the new
  `.detail-bento` class to `@ip/ui/src/app.css`; extend `@ip/ui/src/sprite.tsx` with
  `MapPin`, `Bookmark`, `eye-off`. Verify the hero header lays out cleanly at 1440 (split) and
  390 (stacked), the title balances at narrow widths, `generateMetadata` still emits title +
  description. Screenshot in both themes. Commit
  `frontend/apps/candidate/app/jobs/[id]/page.tsx`,
  `frontend/apps/candidate/components/job-meta.tsx`,
  `frontend/packages/ui/src/app.css` (new grid), `frontend/packages/ui/src/sprite.tsx`.
- **Task 2 — Detail bento + JD anchor + skills.** Build the `.detail-bento` grid with
  `<JdAnchor />` (left, 1.6fr) as the `.cell.anchor` containing the display h2, JD body
  (`whitespace-pre-wrap`, body width capped at 75ch), and the skills row at the bottom. Right
  column placeholder for now. Verify long JDs render correctly, headings inside JD body (if
  any) inherit the design language type scale, code blocks (if any in JD text) render in
  Geist Mono. Screenshot. Commit `frontend/apps/candidate/app/jobs/[id]/page.tsx`.
- **Task 3 — Apply panel + Save button + proctored band.** Build `<ApplyPanel />` as the right
  side `.cell` (sticky at `top: 96px` ≥1100px). Wire the consent `<Checkbox />` to
  `localStorage["job-consent:<id>"]`. Wire the primary Apply button to `useMutation` →
  `api.applications.apply({ jobId, consent: true })`; on success clear the consent key,
  invalidate `["recommendations"]` and `["applications"]`, `router.push("/")`. Implement the
  signed-out variant ("Sign in to apply" → `/login?return=…`). Rebuild
  `<SaveJobButton />` markup (icon + label) while keeping the `["saved-jobs","ids"]` mutation
  unchanged. Add `<ProctoredBand />` below the bento. Verify: signed-out shows the Sign-in
  link, signed-in pre-consent shows the disabled Apply, checking enables it, clicking shows
  the pending state, on success morphs to the `.pill-good` confirmation before the router
  push. Verify the consent key restores across reload. Screenshot signed-in + signed-out.
  Commit `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx`,
  `frontend/apps/candidate/components/save-job-button.tsx`.
- **Task 4 — Not-found + error surfaces.** Build `<NotFoundCard />` (in
  `app/jobs/[id]/not-found.tsx`) and `<ErrorCard />` (in `app/jobs/[id]/error.tsx`) using
  `.cell` + the new sprite icons. Verify `/jobs/404` (mock throws `not_found`) renders the
  not-found card, hitting an error path renders the error card with a working `reset()`.
  Screenshot both. Commit.
- **Task 5 — Full page assembly + verify.**
  1. `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` is green; `--filter @ip/candidate exec
     tsc --noEmit` is green.
  2. Run dev (`NEXT_PUBLIC_MOCK=1 pnpm --filter @ip/candidate dev`), navigate to `/jobs/1`,
     screenshot in both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against the design language: same nav, same wide
     container, same `.cell.anchor` rhythm, same teal-soft / mono accents — iterate any
     divergence until 1:1.
  4. Verify SSR HTML (curl or view-source on `/jobs/1`): title, JD text, company name, meta
     pills all present, token-free.
  5. Verify the **Apply contract** byte-for-byte:
     - consent key reads + writes `job-consent:1` exactly
     - successful apply invalidates `["recommendations"]` + `["applications"]`
     - successful apply pushes to `/`
     - signed-out path links to `/login?return=…`
  6. Flip `NEXT_PUBLIC_MOCK` off and confirm the real `GET /public/jobs/{id}` response
     renders identically.

## States & a11y

- **States (named).**
  - `success` — SSR stream renders the whole page.
  - `not-found` — `notFound()` → `not-found.tsx` shows `<NotFoundCard />`.
  - `error` — SSR rethrow → `error.tsx` shows `<ErrorCard />` with `reset()`.
  - Apply island states: `signed-out`, `pre-consent` (button disabled), `consented` (button
    enabled), `pending` (spinner + button disabled), `success` (`.pill-good` then
    `router.push("/")`), `error` (toast — reuse existing `toast()` from `@ip/ui`).
  - Save button states: `null` (signed-out), `unsaved` (ghost + bookmark icon), `saved`
    (`.btn-coral` + filled bookmark), `pending` (subtle spinner inside the button).
- **Responsive.** Hero splits at ≥1100px (avatar + title left, meta panel right) and stacks
  at <1100px (title above, meta pills wrap below). `.detail-bento` collapses to single-column
  at <1100px — Apply panel un-sticks and follows the JD. JD body stays within 65–75ch on all
  widths. Proctored band wraps to 2 rows at <760px. No horizontal scroll at 320px.
- **Dark + light.** Tokens only — automatic. JD anchor uses the `.cell.anchor` gradient
  (`--teal-soft` over `--surface`) which resolves cleanly in both themes. Apply panel uses
  `--surface`. No hardcoded hex.
- **A11y.** One `<h1>` (the job title). Landmarks:
  `<header><nav><main><article><aside><footer>`. Breadcrumb is a real `<nav aria-label="Breadcrumb">`
  with an ordered list and the trailing item set to `aria-current="page"`. Avatar named with
  the company. `JobMetaPanel` uses semantic `<dl>` for label/value pairs. Apply checkbox is a
  labelled `<input type="checkbox">` (clicking the label toggles it). Apply button is a real
  `<button>` with `aria-disabled` when consent is unchecked and `aria-busy` during pending.
  Save button has `aria-pressed` to indicate saved state. Pending and success use polite
  `aria-live` regions. `:focus-visible` rings use `--teal` 2px / 4px halo. Touch targets
  ≥44×44. Contrast ≥4.5:1 (body uses `--ink-2` on the `--bg`, JD body uses `--ink` on the
  `.cell.anchor` gradient which we have verified at ≥4.5:1 in both themes). All animations
  honor `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  for shell + container + type + bento `.cell.anchor` rhythm, applied to a real job detail
  with the sticky apply panel and the proctored truth-band described above. Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/job-detail-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green (with `NEXT_PUBLIC_MOCK=1`); `tsc --noEmit` is
  green; no console errors / warnings on the rendered page; `prefers-reduced-motion` honored.
- **Apply / consent contract byte-for-byte preserved.** Same `job-consent:<id>` key, same
  `api.applications.apply({ jobId, consent })` RPC, same `["recommendations"]` +
  `["applications"]` invalidation, same `router.push("/")` on success, same disabled-until-
  checked behavior, same signed-out "Sign in to apply" link.
- SSR HTML crawlable: view-source on `/jobs/1` contains the title, JD body, company name, and
  meta in initial HTML, token-free. `generateMetadata` still emits `<title>` and
  `<meta description>`.
- `/jobs/404` → not-found surface; genuine fetch failures → error surface with a working
  `reset()` button.
- Mock → real flips via `NEXT_PUBLIC_MOCK` with no code change.
- **Pre-launch posture enforced.** Proctored band uses only architectural truths (camera + mic
  required, no mute, server-authoritative auto-end). No fake employer outcomes, no fake
  reviews, no claimed integrations anywhere on the page.
