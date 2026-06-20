# Frontend — Job detail (`/jobs/[id]`) · Midnight redesign

> **Screen & goal.** Public, SSR, crawlable job-detail page: full JD + meta (location, work mode, type, salary,
> skills, company) rendered server-side; **Apply** + **Save** are client islands that require sign-in. Reskin to
> Midnight. **Zero behavior change** — the apply/consent contract is byte-for-byte preserved.
> **Route(s) + role.** `/jobs/[id]` · **public** (token-free SSR; Apply/Save islands gate on auth).
> **Mockup.** ✗ — build `docs/brand/redesign-v2/job-detail.html` in **Task 0** (sibling of `marketplace.html`).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/jobs/[id]/page.tsx` (SSR server component; wraps `AppShell`)
> - `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx` (`"use client"` consent + Apply — **do not touch logic**)
> - `frontend/apps/candidate/app/jobs/[id]/detail-client.ts` + `types.ts` (real `/public/jobs/{id}` + mock + `fmtSalary`)
> - `frontend/apps/candidate/components/job-meta.tsx`, `save-job-button.tsx`

---

## Layout & components

Single-column document inside the Midnight `.app` shell (the public marketplace family already wraps `AppShell`).
The body is one large `.card` with a header (avatar + title + company link + Save) and the JD/meta/Apply stack.

| Region | Component | Midnight classes / tokens |
|---|---|---|
| Shell | `AppShell` | `.app` + `.side` + `.topbar` (token-free public) |
| Header | `page.tsx` `CardHeader` | `Avatar` (company logo); title in `--font-display`; company → `Link href="/companies/{id}"` `--ink-2` hover-underline; `SaveJobButton` top-right |
| Meta row | `JobMeta` | `.pill`/`Badge` tones — work mode = info/`pill-accent`, salary = `pill-good`; skills as `.badge` mono chips |
| JD body | `page.tsx` | `whitespace-pre-wrap` `--ink-2` paragraph |
| Apply | `ApplyIsland` | `Checkbox` consent + `.btn.btn-primary`; signed-out → "Sign in to apply" `.btn` link |
| not-found | `not-found.tsx` | token empty card |

**Task-0 mockup (`job-detail.html`).** Build it against `tokens.css` + `app.css`: the `.app` shell, a `.card`
header (avatar, Fraunces title, company sub-link, Save ghost button), a `JobMeta` pill row, a JD block, a consent
checkbox + primary Apply button. Mirror `marketplace.html`'s shell + card conventions. Browser-verify on `:4173`.

**New vs reused.** No new React components — reskin only. Reuse `@ip/ui` `AppShell`, `Avatar`, `Card`/`CardHeader`/
`CardTitle`/`CardDescription`/`CardContent`, `Badge`, `Button`, `Checkbox`, `toast`; reuse `JobMeta`,
`SaveJobButton`, `ApplyIsland`.

## Data wiring / seam

- **SSR fetch seam:** `detail = USE_MOCK ? makeMockDetailClient() : getPublicJobDetail` → `GET /public/jobs/{id}`
  (`next: { revalidate: 120 }`). 404 → `notFound()`. **Keep identical.**
- **No query key on the page** (server fetch). `ApplyIsland` uses `useMutation` (no key) →
  `api.applications.apply({ jobId, consent })`; on success invalidates `["recommendations"]` + `["applications"]`,
  clears the `job-consent:<id>` localStorage key, `router.push("/")`. **Byte-for-byte preserved.**
- `SaveJobButton` reads/writes `["saved-jobs","ids"]`; null when signed out.
- Fields consumed (per `backend_job-detail.md`): `JobDetailDTO { jobId, title, jdText, location, remoteMode,
  employmentType, salaryMin, salaryMax, salaryCurrency, skills, postedAt, company { id, name, logo } }`.

## Tasks

- **Task 0 — Build `redesign-v2/job-detail.html`.** As above; browser-verify `:4173`; commit
  `docs/brand/redesign-v2/job-detail.html`.
- **Task 1 — Header + meta.** Reskin `page.tsx` `CardHeader` (Avatar, Fraunces title, company link, `SaveJobButton`)
  + `JobMeta` pill row to Midnight tones. Keep `generateMetadata` + `notFound()` logic. Verify `typecheck`. Commit
  `app/jobs/[id]/page.tsx`, `components/job-meta.tsx`.
- **Task 2 — JD body + Apply island.** Reskin the JD paragraph + `ApplyIsland` (consent `Checkbox`, primary Apply,
  signed-out CTA) to tokens. **Do not change** the consent key, RPC, or invalidations. Commit
  `app/jobs/[id]/apply-island.tsx`.
- **Task 3 — Verify.** `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` clean; preview `/jobs/1`: JD + meta render
  server-side (view-source → title/JD present, token-free), Apply shows "Sign in to apply" signed out and the
  consent+Apply flow signed in, `/jobs/404` → not-found, dark+light correct. Screenshot. Commit.

## States & a11y

- **States (named).** loading (server stream — no client spinner), **not-found** (`notFound()` for draft/missing),
  error (genuine fetch failure → `error.tsx`). Apply island: pending/success/error via `toast`; signed-out →
  "Sign in to apply". `SaveJobButton` → null signed out.
- **Responsive.** Header stacks (avatar+title over Save) on mobile; meta pills wrap; JD full-width.
- **Dark + light.** Tokens only — automatic. No hardcoded colors.
- **A11y.** Company link + breadcrumb real links; consent is a labelled `Checkbox`; Apply is a `<button>`; Avatar
  has a name; cyan `:focus-visible` ring; contrast ≥4.5:1.

## Acceptance

- Matches the new `redesign-v2/job-detail.html`.
- SSR HTML crawlable (title + JD + company in initial HTML, token-free).
- `--filter @ip/candidate build` + `typecheck` green.
- **Apply/consent contract byte-for-byte preserved** (consent key, `api.applications.apply`, invalidations).
- Mock→real flips via `NEXT_PUBLIC_MOCK`.
