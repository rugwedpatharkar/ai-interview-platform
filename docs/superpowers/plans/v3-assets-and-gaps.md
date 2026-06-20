# Aptura v3 — Assets, Gaps & Remaining-Issues Checklist

> Implement ALL; mark `[x]` on completion. Frontend-only; behavior preserved; builds stay green.
> Source: icon/logo/asset audit + general-issue sweep + gaps/unhandled-scenarios pass.

## A. Icons, logos & brand assets
- [x] A1. Logo mark → real **aperture/lens** SVG (not the spark) — `packages/ui/src/logo.tsx`
- [x] A2. Route shells + footer through `<Logo>`/`<LogoMark>` (kill hand-rolled `◐` glyphs + footer manual mark) — `candidate-shell.tsx`, `company-shell.tsx`, `marketing-footer.tsx`
- [x] A3. Add `icon.svg` (+ `apple-icon`) per app — Aptura mark
- [x] A4. Metadata titles → Aptura — `candidate/app/layout.tsx`, `company/app/layout.tsx`
- [x] A5. `credentials-form` aria-label → "Aptura home"
- [x] A6. `viewport` export: `themeColor` (dark/light) + `colorScheme: "light dark"` — both layouts
- [x] A7. `opengraph-image` per app + `metadataBase`
- [x] A8. `manifest.ts` (name/theme_color/icons) + `favicon.ico`
- [x] A9. Dead `@ip/ui` `Icon` wrapper — delete (unused)
- [x] A10. Logo preview cropping — square preview not circular Avatar — `logo-upload.tsx`

## B. Bugs & unhandled scenarios / gaps
- [x] B1. Topbar search is a dead placeholder → wire to `/jobs?q=` (both shells)
- [x] B2. `alert-form` Selects need `aria-label` (Remote / Frequency)
- [x] B3. `schedule` `formatLocal(chosenStartAt)` guard against empty
- [x] B4. Salary-zero handling unify (`== null`) — `detail-client.ts` vs `job-card.tsx`
- [x] B5. Integrity-timeline list `key` → `${at}-${type}` (not index)
- [x] B6. CompetencyCard `key` → `${i}-${competency}`
- [x] B7. Reskin route `error.tsx`/`not-found.tsx` to Midnight + add `global-error.tsx`
- [x] B8. Stop polls after terminal `booked` — `use-schedule.ts`, `schedule-panel.tsx`
- [x] B9. Offline/network-loss banner (`navigator.onLine`)

## C. Consistency
- [x] C1. Migrate 3 candidate marketplace pages (`jobs`, `jobs/[id]`, `companies/[id]`) to `SidebarShell`; delete old top-bar `AppShell`
- [x] C2. Promote `StatusPill` (with OVERRIDES) into `@ip/ui`; route all status pills through it
- [x] C3. `stat-strip` max-w-5xl → max-w-6xl (marketing parity)

## D. Accessibility
- [x] D1. (= B2) labelled selects
- [x] D2. `Field` clones `aria-invalid` onto the child when `error` — `packages/ui/src/field.tsx`
- [x] D3. Skip-to-content link in `SidebarShell`
- [x] D4. Fix headings — `h1` on auth + entity-detail pages; company dashboard h1→h3 skip
- [x] D5. `aria-label` on placeholder-only inputs (topbar search, message composer)

## E. Dead code / cleanup
- [x] E1. Delete unused: Tooltip primitive, `useTheme` export, `DropdownMenuGroup`/`DropdownMenuCheckboxItem`, `SEVERITY_ORDER`, old `AppShell` (after C1), stray helper `export`s, `createAuthedTransport` from barrel

## F. Dedup (~700 lines)
- [x] F1. Lift byte-identical to `@ip/ui`: `auth-layout`, `notification-item`, `sso-buttons`
- [x] F2. Parameterize + lift: `use-thread-messages`, `message-thread-view`, `notification-bell`, `assistant-chat`
- [x] F3. Reconcile + lift `credentials-form` (company superset); lift `datetime.ts` superset + `scheduling.ts` core

## G. Enhancements
- [x] G1. Toast-on-copy affordances
- [x] G2. Optimistic UI on decision actions
- [x] G3. Empty-state per-context illustrations/icons
- [x] G4. ⌘K command palette over the (now-wired) search
- [x] G5. Idle back-off on the 5s message poll
- [x] G6. Focus-move on interview/aptitude step transitions

## Verification gate
`tsc --noEmit` (all packages) clean per wave; final production `build` both apps green; behavior preserved; commit per wave (explicit paths).
