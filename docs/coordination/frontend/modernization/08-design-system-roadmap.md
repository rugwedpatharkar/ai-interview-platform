# Design system roadmap

Only `design-system` findings, split into token consolidation | primitive consolidation | density modes | icon strategy | typography.

---

## Token consolidation

### DS-1 · P2 — `accent-teal` on gate-mode radios paints stock teal, not brand violet
- `app/company/jobs/new/page.tsx:375` · `app/company/jobs/[id]/edit/page.tsx:376`
- `--color-teal-*` isn't declared in `@theme inline`; brand renamed `--teal → --brand`. Rename utility to `accent-brand`, or hide `sr-only` native input and use the outer label as visual.

### DS-9 · P3 — Marketing-card shadow duplicated verbatim across 5 files
- `auth-card.tsx:58` · `waitlist/page-client.tsx:68` · `pilot/page-client.tsx:79` · `sample-report/page.tsx:33,246` · `packages/ui/src/styles/tokens.css:83`
- `shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)]` is a fourth "lifted marketing card" depth without a token.
- Add `--elev-marketing` (or `--elev-4`) to `tokens.css`; expose via `@theme inline` as `--shadow-elev-marketing`. Replace 5 sites with `shadow-elev-marketing`.

### DS-11 · P3 — Onboarding uses `bg-[var(--brand*)]` arbitrary refs alongside `bg-brand`
- `app/onboarding/page.tsx:319,360`
- 26 sites total across the app. Codemod arbitrary → utility: `bg-[var(--brand)]` → `bg-brand`, `-strong`, `-soft`. Same for `text-` / `border-`.

---

## Primitive consolidation

### DS-5 · P1 — Auth surfaces carry private Field/Notice/PrimaryButton shadowing `@ip/ui`
- `components/auth/auth-card.tsx:88,150,177` · `packages/ui/src/field.tsx:11` · `waitlist/page-client.tsx:118`
- Local Field lacks error/aria-invalid — carries AY-2's fix. Local Notice's color-mix differs from `@ip/ui` Alert.
- One PR: import `Field` from `@ip/ui` with `error={fieldErrors.email}`; replace Notice with `<Alert tone=…>`; replace PrimaryButton with `<Button variant='default' size='lg' loading={busy}>`. Deletes ~120 LOC and lands AY-2 as a byproduct.

### DS-4 · P2 — `StatusPill` unused; `ap-pill` inline 96 times
- `packages/ui/src/status-pill.tsx:23` · `app/applications/[id]/page.tsx:430` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:96` · `app/company/audit/page.tsx:287` · `app/company/team/page.tsx:218` · `app/company/jobs/[id]/page.tsx:264`
- Migrate ~15 highest-traffic call sites: dashboard/applications tracker/detail state pills, recruiter kanban state pill, applicant report recommendation pill. Delete local `pillVariant()` in applications/[id]/page.tsx and `recommendationPill()` in applicants/[appId]/page.tsx.

### DS-2 · P2 — Five recruiter tables reimplement thead/td around dead `.data`/`.table-wrap`
- `app/company/audit/page.tsx:249` · `app/company/team/page.tsx:158` · `app/company/jobs/page.tsx:172` · `app/company/billing/page.tsx:257` · `app/company/talent/page.tsx:345` · `packages/ui/src/table.tsx:9`
- Delete dead `.data` / `.table-wrap` classes now (they carry no styles). Migrate 5 tables to `@ip/ui` Table/TableHead/TableCell. Add `density?` prop (see below).

### DS-7 · P2 — `@ip/ui` `layout.tsx` is `"use client"`; PageHeader/EmptyState ship as client JS on ~30 RSC pages
- `packages/ui/src/layout.tsx:1,121,147,174` · `packages/ui/src/index.ts:83`
- Split into `layout-shell.tsx` (client, AppShell only) and `layout-states.tsx` (no "use client", PageHeader/Heading/EmptyState/ErrorState/LoadingState/SuccessState). Re-export from index.ts unchanged.

### DS-10 · P2 — Applicant report `TabButton` reimplements Radix Tabs
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:536,275` · `packages/ui/src/tabs.tsx`
- Swap for `@ip/ui` Tabs/TabsList/TabsTrigger/TabsContent (already used in `/settings`). Add `?tab=…` URL sync (matches `/settings`). Delete local `TabButton`.

### DS-12 · P3 — Candidate/company settings TabsList duplicate a 60-char className with token vocab drift
- `app/settings/page.tsx:43` · `app/company/settings/page.tsx:31` · `packages/ui/src/tabs.tsx`
- Add `variant?: 'default' | 'segmented'` to `@ip/ui` TabsList. Adopt on both settings pages.

### DS-8 · P3 — Local Avatar in `company/jobs/[id]/page.tsx` duplicates `@ip/ui` Avatar
- `app/company/jobs/[id]/page.tsx:271` · `packages/ui/src/avatar.tsx:33`
- Delete local `function Avatar({ handle })`. Replace with `<Avatar name={candidateHandle(a.candidateUserId)} size='sm' className='font-mono' />`.

### DS-13 · P3 — Both shells hardcode pre-launch pill copy
- `components/company-shell.tsx:151` · `components/candidate-shell.tsx`
- Extract to `<PreLaunchBadge audience='candidate' | 'company' />` rendering when `process.env.NEXT_PUBLIC_LAUNCH_PHASE !== 'live'`.

---

## Density modes

### DS-3 · P2 — No compact density on recruiter tables
- `app/company/audit/page.tsx:250` · `app/company/team/page.tsx:159` · `app/company/talent/page.tsx:346` · `app/company/billing/page.tsx:257` · `packages/ui/src/table.tsx:9`
- Add `density?: 'comfortable' | 'compact'` to `@ip/ui` Table. Comfortable = current `px-4 py-3` (48px rows). Compact = `px-3 py-1.5` (28px rows). Adopt `density='compact'` on audit + team + talent + billing.
- Optional: `CompanyShell` broadcasts density via `data-density='compact'` picked up by Table.

---

## Icon strategy

_No dedicated icon findings in this dimension. Related:_
- Sprite tree-shake / route-scope — see PF-8 (`ApertureSprite renders 25 SVG symbols on every route`).
- `lucide-react` value-import ban inside `@ip/ui` is already enforced by CLAUDE.md.

---

## Typography

### DS-6 · P3 — 41 inline `fontFamily: 'var(--font-display)'` overrides
- `app/sample-report/page.tsx:19` · `components/auth/auth-card.tsx:44,62` · `waitlist/page-client.tsx:39` · `trust/page.tsx` · `status/page.tsx` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:598`
- Tailwind `font-display` utility resolves to the same var via `@theme inline` (tokens.css:223).
- Codemod: replace `style={{ fontFamily: 'var(--font-display)' }}` and `var(--font-mono)` with a `font-display` / `font-mono` class merge on the same element. Keep other inline styles.

### (Cross-dimension) `.ap-h1` at font-weight 800 has no matching file
- `packages/ui/src/styles/primitives.css:64-67`
- Called out inside PF-5. Decide: add Clash Display 800 face, or drop `.ap-h1` to 700 (which is preloaded).
