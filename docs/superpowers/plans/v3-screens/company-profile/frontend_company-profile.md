# Frontend — Company profile (`/companies/[id]`) · Midnight redesign

> **Screen & goal.** Public, SSR, crawlable company page: branding (name, about, website, logo, locations) +
> **funnel-derived trust signals** ("Actively reviewing", "Responds in ~X days", "N open roles") + the company's
> published roles (reusing the shared `JobCard`). Reskin to Midnight. **Zero behavior change.**
> **Route(s) + role.** `/companies/[id]` · **public** (token-free SSR; `SaveJobButton` islands gate on auth).
> **Mockup.** ✗ — build `docs/brand/redesign-v2/company-profile.html` in **Task 0** (sibling of `marketplace.html`).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/companies/[id]/page.tsx` (SSR server component; wraps `AppShell`)
> - `frontend/apps/candidate/app/companies/[id]/company-client.ts` + `types.ts` (real `/public/companies/{id}` + `/jobs` + mock + `trustChips`)
> - `frontend/apps/candidate/components/trust-badges.tsx`, `job-card.tsx`, `save-job-button.tsx`

---

## Layout & components

Inside the Midnight `.app` shell: a branding `.card` header (avatar + name + website + trust chips + about +
locations) followed by an "Open roles" section reusing the marketplace `JobCard` grid.

| Region | Component | Midnight classes / tokens |
|---|---|---|
| Shell | `AppShell` | `.app` + `.side` + `.topbar` (token-free public) |
| Header | `page.tsx` `CardHeader` | `Avatar` (logo, `size="lg"`); name in `--font-display`; website → external `Link` ghost button `--ink-2` with `ExternalLink`; `TrustBadges` |
| Trust chips | `TrustBadges` | `.pill` tones — first ("Actively reviewing") = `pill-good`/success, rest neutral; "Responds in ~X" hidden when `respondsInDays === 0` |
| About / locations | `page.tsx` `CardContent` | `--ink-2` paragraph; locations row with `MapPin` |
| Open roles | `page.tsx` section | `<h2>` in `--font-display`; reused `JobCard` (`.jobcard`) grid, each with a `SaveJobButton` action |
| Empty | `EmptyState` | "No open roles right now" token card |
| not-found | `not-found.tsx` | token empty card |

**Task-0 mockup (`company-profile.html`).** Build against `tokens.css` + `app.css`: the `.app` shell, a branding
`.card` (avatar, Fraunces name, website link, a row of trust `.pill`s — first `pill-good`), about text, a locations
line, then an "Open roles" `.jobcard` grid mirroring `marketplace.html`'s card. Browser-verify on `:4173`.

**New vs reused.** No new React components — reskin only. Reuse `@ip/ui` `AppShell`, `Avatar`, `Card`/`CardHeader`/
`CardTitle`/`CardContent`, `Badge`, `Button`/`buttonVariants`, `EmptyState`; reuse `TrustBadges`, `JobCard`,
`SaveJobButton`.

## Data wiring / seam

- **SSR fetch seam:** `companyProfile = USE_MOCK ? mock.profile : getCompanyProfile` → `GET /public/companies/{id}`
  (`revalidate: 300`); `companyJobs = … : getCompanyJobs` → `GET /public/companies/{id}/jobs` (`revalidate: 120`).
  404 on profile → `notFound()`; jobs error → `{ jobs: [] }`. **Keep identical.**
- **No query key on the page** (server fetch). A "load more" island (if added) would use `["company-jobs", id, page]`.
- `trustChips(trust)` → ordered string chips; pure, unit-tested; hides the responsiveness chip at `respondsInDays === 0`.
- `SaveJobButton` (per-card `action`) → `["saved-jobs","ids"]`; null signed out.
- Fields consumed (per `backend_company-profile.md`): `CompanyProfileDTO { id, name, about, website, logo,
  locations[], trust { activelyReviewing, respondsInDays, openJobs } }` + `CompanyJobsResult { jobs: JobCardDTO[],
  total, page, pageSize }` (jobs element = the **same** `JobCardDTO` as search).

## Tasks

- **Task 0 — Build `redesign-v2/company-profile.html`.** As above; browser-verify `:4173`; commit
  `docs/brand/redesign-v2/company-profile.html`.
- **Task 1 — Branding header + trust chips.** Reskin `page.tsx` `CardHeader` (Avatar, Fraunces name, website ghost
  link, about, locations) + `TrustBadges` (`.pill` tones, first = success) to Midnight. Keep `generateMetadata` +
  `notFound()`. Verify `typecheck`. Commit `app/companies/[id]/page.tsx`, `components/trust-badges.tsx`.
- **Task 2 — Open-roles grid.** Confirm the reused `JobCard` (reskinned in `../job-detail`/`../marketplace-search`)
  renders correctly here with the `SaveJobButton` action + `EmptyState`. No card fork. Commit if any wiring change.
- **Task 3 — Verify.** `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` clean; preview `/companies/c1`: branding +
  trust chips + reused `JobCard` grid render server-side (view-source → company name + job titles, token-free),
  cards link to `/jobs/{id}`, `respondsInDays===0` hides that chip, `/companies/404` → not-found, dark+light
  correct. Screenshot. Commit.

## States & a11y

- **States (named).** loading (server stream), **not-found** (company with no published presence), error
  (genuine fetch failure → `error.tsx`); job grid has its own empty state ("No open roles right now"); trust chips
  degrade gracefully (responsiveness chip hidden when `respondsInDays === 0`).
- **Responsive.** Header stacks (logo over name/website/trust) on mobile; job cards single-column.
- **Dark + light.** Tokens only — automatic. No hardcoded colors.
- **A11y.** Website is an external link (`rel="noopener noreferrer"`); Avatar named; cards are links; "Open roles"
  is a real `<h2>`; cyan `:focus-visible` ring; contrast ≥4.5:1.

## Acceptance

- Matches the new `redesign-v2/company-profile.html`.
- SSR HTML crawlable (name + about + job titles in initial HTML, token-free).
- `--filter @ip/candidate build` + `typecheck` green.
- **Zero functional diff** — `JobCardDTO`/`JobCard` reused verbatim; trust chips funnel-derived; mock→real flips
  via `NEXT_PUBLIC_MOCK`.
