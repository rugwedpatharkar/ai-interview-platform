# Architecture roadmap

Only `architecture` findings, covering folder structure, state boundaries, testing, file-size hot spots, and API-client seams.

---

## API-client seams

### AR-1 · P1 — Messages client seam re-instantiated in six places
- `app/messages/messages-client.ts:54` · `components/candidate-shell.tsx:77` · `components/message-thread-view.tsx:29` · `app/messages/page.tsx:58` · `app/messages/[applicationId]/page.tsx:41` · `app/applications/[id]/page.tsx:143` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:194` · `lib/use-schedule.ts:18` (canonical shape) · `lib/saved-jobs-client.ts:128` (canonical shape)
- Add `lib/use-messages.ts` with `useMessagesClient()` + `useThreads()`. Six 4-line `useMemo` blocks + five duplicate `useQuery(listQueryKey())` blocks collapse. Fixes the cadence-drift bug (shell polls 60 s, applicant page 30 s over same key).

### AR-2 · P2 — `type Api = ReturnType<typeof useAuth>["api"]` duplicated in 5 clients
- `app/messages/messages-client.ts:50` · `app/notifications/notifications-client.ts:69` · `lib/practice-client.ts:39` · `lib/job-alerts-client.ts:130` · `lib/saved-jobs-client.ts:90`
- Replace with `import type { ApiClients } from "@ip/shared"` (settings-client / team-client / branding-client already do this).

### AR-12 · P2 — `messages/page.tsx` `markRead` swallows every error
- `app/messages/page.tsx:85` · `components/candidate-shell.tsx:84` · `packages/shared/src/observability.ts:1`
- `catch (err) { if (isAborted(err)) return; recordError(err); }`. `recordError` already exists.

---

## State boundaries

### AR-3 · P1 — `listMyApplications` query duplicated with divergent poll cadence
- `components/dashboard.tsx:71` · `app/applications/[id]/page.tsx:130` · `lib/use-schedule.ts:18` (canonical pattern)
- Add `lib/use-applications.ts` with `useApplications()` + `useApplication(id)`. Both consumers pull from hook so cadence lives in one place.

---

## Folder structure

### AR-6 · P2 — Deep `../../../../../..` imports even though `@/*` alias is defined
- `tsconfig.json:11` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:37` · `app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:31` · `app/company/jobs/[id]/edit/page.tsx:23`
- Codemod every relative chain of depth ≥ 3 to `@/`. Add ESLint `no-restricted-imports` `patterns: ["../../../*"]`. Add `@/*` note to CLAUDE.md.

### AR-4 · P1 — Landing bodies "use client" ship 1,358 static LOC as client JS
- `components/landing/company-body.tsx:1` · `components/landing/candidate-body.tsx:1,81` · `components/landing/landing-page.tsx:10`
- Duplicate of RF-2 / RF-1 (landing restructure); listed here because it's also an architectural boundary problem.

---

## File-size hot spots

### AR-7 · P2 — Applicant report page is 856 LOC across four concerns
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:577,622,754` · `app/company/jobs/[id]/applicants/[appId]/integrity-client.ts:1`
- Colocate: `_components/integrity-band-section.tsx` (622-743), `_components/competency-card.tsx` (577-620), `_components/reason-dialog.tsx` (754-856). Leading-underscore folders are Next 15-router-ignored, no route change. page.tsx keeps orchestration + tabs + decide mutation.

### AR-8 · P2 — Profile page is 674 LOC of a single form with four sections inlined
- `app/profile/page.tsx:77,313,546` · `app/onboarding/page.tsx:94` · `components/profile/experience-row.tsx:1`
- Two of four sections already extracted (experience-row, skill-chips). Add `components/profile/education-row.tsx` (mirror of experience-row) + `components/profile/resume-upload-cell.tsx` (owns upload mutation + parse-poll state). Import from both profile + onboarding to dedupe parse-polling logic (currently copy-pasted between `profile:77-134` and `onboarding:94-151`).

---

## Testing coverage

### AR-9 · P1 — Zero tests for seven pure functions that drive outcome copy + score band
- `app/applications/[id]/page.tsx:70,446` · `app/applications/[id]/outcome/page.tsx:80` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:80,123` · `app/aptitude/[applicationId]/page.tsx:54`
- Existing tests are transport-focused (6 test files: observability, polling, funnel, job-alerts-client, saved-jobs-client, skill-chips, settings-client).
- Add vitest coverage for: `buildJourney`, `labelForEvent`, `verdictFrom`, `toReportDTO`, `pipPosition`, `isAnswered`, `sevClass`/`sevLabel`. Table-driven tests over every state in `TERMINAL_STATES` + funnel states.
- ~150 LOC of tests protects the exact copy that determines whether "you always hear back" survives future refactors.

---

## Public API discipline

### AR-11 · P2 — 100 inline `ap-btn` string literals across 37 files, no typed variant surface
- `packages/ui/src/styles/primitives.css:85` · `packages/ui/src/button.tsx:1` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:269` · `app/company/jobs/new/page.tsx:336` · `app/jobs/[id]/apply-island.tsx:91`
- Add `ApButton` to `@ip/ui` mirroring `Button` but backed by ap-btn CSS: `variant: "primary" | "ghost" | "coral"`, `size: "sm" | "md" | "lg"`. Codemod 100 sites. Reserve raw literals for landing pages.

### AR-5 · P1 — `optimizePackageImports` misses `@ip/ui`, `@ip/shared`, react-query
- `next.config.ts:11` · `packages/ui/src/index.ts:1` · `packages/shared/src/index.ts:1`
- Extend `optimizePackageImports: ["lucide-react", "@ip/ui", "@ip/shared", "@tanstack/react-query"]`. Overlaps with PF-10; land as one edit.

---

## DX / CI

### AR-10 · P2 — Turbo pipeline missing `outputs` for `lint`/`test`/`typecheck`
- `turbo.json:15` · `packages/{ui,shared}/tsconfig.tsbuildinfo` · `apps/candidate/tsconfig.tsbuildinfo`
- Update `turbo.json`:
  - `typecheck: { outputs: ["**/*.tsbuildinfo"], inputs: ["src/**", "**/*.ts", "**/*.tsx", "tsconfig*.json"] }` — drop `dependsOn: ["^build"]`.
  - `lint: { outputs: [".eslintcache"] }`.
  - `test: { outputs: ["coverage/**"] }`.
- Verify with clean-checkout + `turbo typecheck --dry-run`.
