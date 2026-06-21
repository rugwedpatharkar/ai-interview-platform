# Robustness Phase 3 — Frontend Robustness Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drain the FE robustness backlog the Phase 0 audit identified — kill the remaining `NEXT_PUBLIC_MOCK` gates so settings/appearance are live-only, add jittered exponential backoff + max-poll caps to the three open-ended polling sites (profile resume parse, dashboard refresh, applicant report polling), add defensive field access to the report cast-seam, audit `errorMessage()` coverage across all toast/error sites, ensure submit buttons disable on validation-fail and pending-state, and surface ICS RPC failures via toast. Result: zero hangs, zero silent failures, every gRPC error a user-friendly message, every form button correct in every state.

**Architecture:** This is a TS/React/Tanstack-Query refactor — no backend changes, no proto changes, no new RPCs. Work fans across `frontend/apps/candidate` + `frontend/apps/company` + `frontend/packages/shared` + `frontend/packages/ui`. The shared `errorMessage()` helper already maps gRPC codes to friendly copy (Phase 0 audit P4 was overestimated — verify in P3-3 that every callsite uses it consistently). The polling sites already use Tanstack Query's `refetchInterval` — wrap the existing callbacks with backoff math, don't reinvent the polling layer.

**Tech Stack:** TypeScript 5.x, React 19, Next.js 15, Tanstack Query v5, `@connectrpc/connect` (gRPC-web), `@ip/ui`, `@ip/shared`. Verification: `pnpm -r typecheck` + `pnpm --filter @ip/candidate build` + `pnpm --filter @ip/company build`. Tests: Vitest where they exist.

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3 Phase 3).
- Behavior preservation: NO change to RPC contracts. The settings live-wiring removes the mock fallback — if the live RPC fails, users see an error toast (the right outcome) instead of silent localStorage persistence (the buggy outcome).
- Per-task commit on `main`; stage explicit paths only (per the user's git-workflow memory).
- Working directory for every command: `/Users/rugwedpatharkar/Projects/Project`.
- FE pnpm version pinned at `9.15.0` (per CLAUDE.md). Use `npx pnpm@9.15.0` everywhere.
- Pre-commit gate per task: `cd frontend && npx pnpm@9.15.0 -r typecheck` exit 0, plus the affected app's `build` exit 0. NEVER run `next build` while `pnpm dev` is live on the same app (per CLAUDE.md anti-pattern).
- Full BE gate (`bash scripts/check.sh`) is informational only this phase — FE work doesn't break BE tests; re-run at end of phase as belt-and-braces.
- No new `console.log` left in production code.
- No `any` types added; use `unknown` + type-narrow.
- No defensive defaults that mask missing data — surface "—" or skeleton, never invent values.

## Pre-Phase Audit Findings (from FE scouting)

- `frontend/apps/candidate/app/settings/settings-client.ts:155` — `USE_MOCK_SETTINGS = process.env.NEXT_PUBLIC_MOCK === "1"` gates mock vs live. Keep `makeMockSettingsClient` for tests; remove the runtime gate.
- `frontend/apps/candidate/app/settings/appearance-client.ts:42` — `USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1"`. Same fix.
- `frontend/apps/candidate/app/profile/page.tsx:105` — resume-parse `refetchInterval` callback; needs backoff + max-cap.
- `frontend/apps/candidate/components/dashboard.tsx:67` — dashboard apps poll; needs backoff + cap.
- `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` — report polling (no max) + cast-seam toReportDTO with optional fields.
- `frontend/apps/candidate/app/schedule/page.tsx:69` + `…/applicants/[appId]/schedule/page.tsx:136` — `getIcs(...)` call without explicit toast on failure.
- `frontend/packages/shared/src/errors.ts:21` — `errorMessage()` already user-friendly (FALLBACK map covers 7 codes + PREFER_SERVER_MESSAGE for INVALID_ARGUMENT/FAILED_PRECONDITION/ALREADY_EXISTS + isNetworkError fallback). P3-3 mostly becomes a coverage audit ("does every callsite use this?") rather than a rewrite.
- Submit-button disabled-state audit needed across all form pages (login, register, forgot, reset, profile/edit, settings tabs, jobs/new, jobs/[id]/edit, rubrics, team invite).

## File Structure (lock-in)

**Modified files:**

| Path | Change |
|---|---|
| `frontend/apps/candidate/app/settings/settings-client.ts` | Remove `USE_MOCK_SETTINGS` runtime gate; keep `makeMockSettingsClient` exported for tests. `useSettingsClient` returns the live client unconditionally. |
| `frontend/apps/candidate/app/settings/appearance-client.ts` | Remove `USE_MOCK` runtime gate; keep mock exported for tests. |
| `frontend/apps/candidate/app/profile/page.tsx` | Replace fixed 2.5s `refetchInterval` with `pollingBackoff()` helper (see lib below) + max-poll cap (24 polls = ~3min). Surface "Still parsing your resume…" toast after the 4th poll. |
| `frontend/apps/candidate/components/dashboard.tsx` | Replace fixed 10s `refetchInterval` with `pollingBackoff()` + cap at 6 polls (~3min of escalation). |
| `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` | Replace fixed 3s report poll with `pollingBackoff()` + max-poll cap (60 polls = ~5min); on cap reached, show "Still scoring — refresh to check again" UI with a manual retry button. Defensive `?.`/`??` on every cast-seam field in `toReportDTO`. |
| `frontend/apps/candidate/app/schedule/page.tsx` | Wrap `getIcs` call in try/catch; show toast on failure. |
| `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx` | Same. |
| Form pages (per P3-4 audit) | Add `disabled={!isValid \|\| isPending}` to primary submit buttons across login, register, forgot, reset, profile edit, settings tabs, jobs/new, jobs/[id]/edit, rubrics, team invite. |

**New files:**

| Path | Responsibility |
|---|---|
| `frontend/packages/shared/src/polling.ts` | Reusable `pollingBackoff({ initialMs, capMs, maxPolls, jitterRatio }) → (query) => number \| false`. Returns a Tanstack-Query `refetchInterval` callback that the calling page hands to `useQuery`. Stops polling when `maxPolls` reached. Exports a small `useCappedPolling()` hook for the same purpose with explicit max-reached callback. |
| `frontend/packages/shared/src/polling.test.ts` | Vitest unit tests for the backoff math and cap behavior. |

**Existing exports to use (no change):**
- `errorMessage()` from `@ip/shared` — already user-friendly. Phase 3 audits coverage.
- `isCode()`, `isTransient()`, `isNotFound()` — used by report-polling retry rules.

## Task 1 — `pollingBackoff()` helper + tests

**Files:**
- Create: `frontend/packages/shared/src/polling.ts`
- Create: `frontend/packages/shared/src/polling.test.ts`
- Modify: `frontend/packages/shared/src/index.ts` (export `pollingBackoff` + types)

**Interfaces:**
- Consumes: nothing (pure function).
- Produces:
  ```ts
  export interface PollingBackoffOptions {
    initialMs: number;            // first interval (e.g. 500)
    capMs: number;                // upper bound (e.g. 30_000)
    maxPolls: number;             // hard stop, returns false after this many polls
    jitterRatio?: number;         // 0..1, defaults to 0.15
  }
  export function pollingBackoff(opts: PollingBackoffOptions):
    (query: { state: { dataUpdateCount: number; status: string } }) => number | false;
  ```
  Returns a function suitable for Tanstack Query's `refetchInterval`. Increases via exponential `initial * 2^n + jitter`, clamped to `capMs`. After `maxPolls` polls (counted via `dataUpdateCount`), returns `false` (stops polling).

- [ ] **Step 1.1: Write the failing test**

Create `frontend/packages/shared/src/polling.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { pollingBackoff } from "./polling";

const q = (n: number) => ({
  state: { dataUpdateCount: n, status: "success" as const },
});

describe("pollingBackoff", () => {
  it("returns initialMs on first poll (jitter aside)", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 10, jitterRatio: 0 });
    const interval = cb(q(0)) as number;
    expect(interval).toBe(500);
  });

  it("doubles each poll until capMs is hit", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 20, jitterRatio: 0 });
    expect(cb(q(0))).toBe(500);
    expect(cb(q(1))).toBe(1_000);
    expect(cb(q(2))).toBe(2_000);
    expect(cb(q(3))).toBe(4_000);
    expect(cb(q(7))).toBe(30_000);   // 500 * 2^7 = 64000, clamped
    expect(cb(q(10))).toBe(30_000);  // still capped
  });

  it("stops after maxPolls", () => {
    const cb = pollingBackoff({ initialMs: 500, capMs: 30_000, maxPolls: 5, jitterRatio: 0 });
    expect(cb(q(0))).toBeTypeOf("number");
    expect(cb(q(4))).toBeTypeOf("number");
    expect(cb(q(5))).toBe(false);
    expect(cb(q(99))).toBe(false);
  });

  it("adds jitter within the configured ratio", () => {
    const cb = pollingBackoff({ initialMs: 1_000, capMs: 30_000, maxPolls: 10, jitterRatio: 0.2 });
    const samples = Array.from({ length: 50 }, () => cb(q(0)) as number);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(1_000);
      expect(s).toBeLessThanOrEqual(1_200); // initial + 20% jitter
    }
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/shared test 2>&1 | tail -10
```
Expected: ImportError on `pollingBackoff`.

- [ ] **Step 1.3: Write minimal implementation**

Create `frontend/packages/shared/src/polling.ts`:

```typescript
/**
 * Reusable polling backoff for Tanstack Query's refetchInterval. Exponential growth
 * with optional jitter, clamped to capMs, stops after maxPolls. The whole reason this
 * lives in @ip/shared is so every long-poll site in the app uses the same backoff
 * curve and the same hard cap — no more "we poll every 3s forever" surprises.
 */
export interface PollingBackoffOptions {
  initialMs: number;
  capMs: number;
  maxPolls: number;
  jitterRatio?: number;
}

interface QueryLike {
  state: { dataUpdateCount: number; status: string };
}

export function pollingBackoff(
  opts: PollingBackoffOptions,
): (query: QueryLike) => number | false {
  const { initialMs, capMs, maxPolls, jitterRatio = 0.15 } = opts;
  return (query) => {
    const n = query.state.dataUpdateCount;
    if (n >= maxPolls) return false;
    const base = Math.min(initialMs * 2 ** n, capMs);
    const jitter = base * jitterRatio * Math.random();
    return Math.round(base + jitter);
  };
}
```

- [ ] **Step 1.4: Export from package index**

Add to `frontend/packages/shared/src/index.ts`:
```typescript
export { pollingBackoff, type PollingBackoffOptions } from "./polling";
```

- [ ] **Step 1.5: Verify test passes + typecheck**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/shared test
cd frontend && npx pnpm@9.15.0 --filter @ip/shared typecheck
```

- [ ] **Step 1.6: Commit**

```
cd /Users/rugwedpatharkar/Projects/Project
git add frontend/packages/shared/src/polling.ts frontend/packages/shared/src/polling.test.ts frontend/packages/shared/src/index.ts
git commit -m "feat(@ip/shared): pollingBackoff helper for capped exponential polling"
```

---

## Task 2 — Profile resume-parse polling backoff

**Files:**
- Modify: `frontend/apps/candidate/app/profile/page.tsx`

**Interfaces:**
- Consumes: `pollingBackoff` from `@ip/shared`.
- Produces: capped, jittered resume-parse polling with user feedback.

- [ ] **Step 2.1: Read the current `refetchInterval` block** (~line 90–115)

- [ ] **Step 2.2: Replace fixed 2.5s polling with backoff**

```typescript
import { pollingBackoff } from "@ip/shared";

// ... in the useQuery for resume status:
refetchInterval: pollingBackoff({
  initialMs: 500,
  capMs: 5_000,
  maxPolls: 24,    // ~3 minutes of escalation
  jitterRatio: 0.2,
}),
```

Add a `useEffect` that fires a `toast.info("Still parsing your resume — this can take a moment.")` after `dataUpdateCount >= 4` (≈10s of polling, the audit's stated threshold) and only once per upload session (use a ref guard).

- [ ] **Step 2.3: Verify typecheck + build**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

Both must exit 0.

- [ ] **Step 2.4: Commit**

```
cd /Users/rugwedpatharkar/Projects/Project
git add frontend/apps/candidate/app/profile/page.tsx
git commit -m "fix(candidate/profile): cap resume-parse polling + user-feedback toast"
```

---

## Task 3 — Dashboard polling backoff

**Files:**
- Modify: `frontend/apps/candidate/components/dashboard.tsx`

**Interfaces:**
- Consumes: `pollingBackoff` from `@ip/shared`.
- Produces: capped escalating dashboard refetch.

- [ ] **Step 3.1: Read the current `refetchInterval` block** (~line 60–75)

- [ ] **Step 3.2: Replace fixed-interval polling with capped backoff**

```typescript
import { pollingBackoff } from "@ip/shared";

// in the applications useQuery:
refetchInterval: pollingBackoff({
  initialMs: 10_000,
  capMs: 60_000,   // never poll faster than 10s, never slower than 60s for in-flight
  maxPolls: 18,    // 18 polls = ~9 minutes total before stopping
  jitterRatio: 0.15,
}),
```

If the existing callback inspected `query.state.data` to decide whether to keep polling at all (i.e. there's anything in-flight), preserve that early-return — wrap it so the backoff still applies when in-flight items exist.

- [ ] **Step 3.3: Verify typecheck + build**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

- [ ] **Step 3.4: Commit**

```
git add frontend/apps/candidate/components/dashboard.tsx
git commit -m "fix(candidate/dashboard): cap applications polling at 18 polls / 9 min"
```

---

## Task 4 — Applicant report polling + cast-seam defensiveness

**Files:**
- Modify: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx`

**Interfaces:**
- Consumes: `pollingBackoff`, `isCode`, existing `Code.NotFound` import.
- Produces: bounded report polling with manual-refresh fallback + defensive field access in `toReportDTO`.

- [ ] **Step 4.1: Read the current report polling + toReportDTO**

Search for `refetchInterval` and `toReportDTO` in the file. Note the existing retry rules (NOT_FOUND → keep polling).

- [ ] **Step 4.2: Replace fixed polling with capped backoff**

```typescript
import { pollingBackoff } from "@ip/shared";

refetchInterval: pollingBackoff({
  initialMs: 3_000,
  capMs: 10_000,
  maxPolls: 60,    // ~5 minutes
  jitterRatio: 0.1,
}),
```

Preserve the existing `retry: (n, err) => isStillFinalizing(err) && n < 12` rule for transient errors.

- [ ] **Step 4.3: Add manual-refresh UI on poll-cap**

When `query.state.dataUpdateCount >= 60` AND status is still NOT_FOUND/pending, render a button:
```tsx
{isCapped && (
  <Card>
    <p>Still scoring — this is taking longer than usual.</p>
    <Button onClick={() => query.refetch()}>Check again</Button>
  </Card>
)}
```

`isCapped` derives from `useQuery`'s `dataUpdateCount` and the loading state.

- [ ] **Step 4.4: Add defensive field access to `toReportDTO`**

Replace bare property reads with `?.` / `??`:

```typescript
// before:
function toReportDTO(r: Record<string, unknown>): ReportDTO {
  return {
    summary: r.executive_summary as string,
    score: r.overall_score as number,
    competencies: (r.competencies as any[]) ?? [],
    // ...
  };
}

// after:
function toReportDTO(r: Record<string, unknown>): ReportDTO {
  return {
    summary: (r.executive_summary as string | undefined) ?? "",
    score: (r.overall_score as number | undefined) ?? 0,
    competencies: Array.isArray(r.competencies) ? r.competencies : [],
    // ...
  };
}
```

Each field gets explicit fallback. Audit every field in the DTO — if `Array.isArray()` is the right check, use it; if `typeof === "string"`, use that. No silent `as any` chains.

- [ ] **Step 4.5: Verify typecheck + build**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

- [ ] **Step 4.6: Commit**

```
git add frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx
git commit -m "fix(company/applicants): cap report polling + defensive cast-seam fields"
```

---

## Task 5 — Settings + Appearance live-only

**Files:**
- Modify: `frontend/apps/candidate/app/settings/settings-client.ts`
- Modify: `frontend/apps/candidate/app/settings/appearance-client.ts`

**Interfaces:**
- Consumes: existing `makeApiSettingsClient` / `makeApiAppearanceClient`.
- Produces: a `useSettingsClient` / `useAppearanceClient` that always returns the live client. Mock factories stay exported for tests.

- [ ] **Step 5.1: Read `settings-client.ts:155` + `appearance-client.ts:42`**

- [ ] **Step 5.2: Remove the `USE_MOCK_SETTINGS` / `USE_MOCK` runtime gate**

```typescript
// before:
export const USE_MOCK_SETTINGS = process.env.NEXT_PUBLIC_MOCK === "1";

export function useSettingsClient(): SettingsClient {
  const { api } = useAuth();
  return useMemo(
    () => (USE_MOCK_SETTINGS ? makeMockSettingsClient() : makeApiSettingsClient(api)),
    [api],
  );
}

// after:
export function useSettingsClient(): SettingsClient {
  const { api } = useAuth();
  return useMemo(() => makeApiSettingsClient(api), [api]);
}
```

`makeMockSettingsClient` STAYS exported for `settings-client.test.ts`.

Same shape for `appearance-client.ts`.

- [ ] **Step 5.3: Verify typecheck + build + existing tests**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate test
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

Tests must still pass — they import `makeMockSettingsClient` directly, not via the env gate.

- [ ] **Step 5.4: Commit**

```
git add frontend/apps/candidate/app/settings/settings-client.ts frontend/apps/candidate/app/settings/appearance-client.ts
git commit -m "fix(candidate/settings): drop NEXT_PUBLIC_MOCK runtime gate — live RPC only"
```

---

## Task 6 — `getIcs()` error toast on both schedule pages

**Files:**
- Modify: `frontend/apps/candidate/app/schedule/page.tsx`
- Modify: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx`

**Interfaces:**
- Consumes: existing `errorMessage()` from `@ip/shared`, existing `toast.error`.
- Produces: surfaced error feedback on ICS generation failure (was silently failing per the audit).

- [ ] **Step 6.1: Read the existing `getIcs` call sites**

Each calls `await sched.getIcs(...)` and pipes the result to a download. If the call throws, the download doesn't happen — silently.

- [ ] **Step 6.2: Wrap each call in try/catch**

```typescript
try {
  const { content, filename } = await sched.getIcs(appId);
  // existing download logic
} catch (err) {
  toast.error(errorMessage(err) || "Couldn't generate the calendar file. Please try again.");
}
```

(`errorMessage()` returns a friendly string by gRPC code; the OR fallback is for the rare case where errorMessage returns "" — shouldn't happen but defensive.)

- [ ] **Step 6.3: Verify typecheck + build**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

- [ ] **Step 6.4: Commit**

```
git add frontend/apps/candidate/app/schedule/page.tsx frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx
git commit -m "fix(candidate/company schedule): surface ICS generation failures via toast"
```

---

## Task 7 — Submit-button disabled-state audit

**Files:**
- Modify: form pages across `frontend/apps/candidate` + `frontend/apps/company`.

**Interfaces:**
- Consumes: existing React Hook Form `isValid`/`isSubmitting` OR manual form state.
- Produces: every primary submit button disabled when the form is invalid OR a mutation is in-flight.

### Audit list (verify each, add disabled-state if missing)

| File | Submit button | Current state | Action |
|---|---|---|---|
| `apps/candidate/app/login/page.tsx` | Sign in | TBD | Verify `disabled={loading \|\| !canSubmit}` |
| `apps/candidate/app/register/page.tsx` | Create account | TBD | Same |
| `apps/candidate/app/forgot/page.tsx` | Send link | TBD | Same |
| `apps/candidate/app/reset/page.tsx` | Reset password | TBD | Same |
| `apps/candidate/app/verify/page.tsx` | Verify | TBD | Same |
| `apps/candidate/app/profile/page.tsx` | Save profile | TBD | Same |
| `apps/candidate/components/settings/*-tab.tsx` | Save preferences | TBD | Same |
| `apps/candidate/app/company/jobs/new/page.tsx` | Create job | TBD | Same |
| `apps/candidate/app/company/jobs/[id]/edit/page.tsx` | Publish / Save | TBD | Same |
| `apps/candidate/app/company/rubrics/page.tsx` | Save rubric | TBD | Same |
| `apps/candidate/app/company/team/page.tsx` | Send invite | TBD | Same |
| `apps/candidate/app/company/onboarding/page.tsx` | Finish setup | Already wired per parallel `cfbba21` | Verify |

### Workflow

- [ ] **Step 7.1: Per page, read the submit-button JSX.**

- [ ] **Step 7.2: If the disabled prop is missing or incomplete, add:**

```tsx
<Button
  type="submit"
  disabled={mutation.isPending || !form.formState.isValid}
  loading={mutation.isPending}
>
  Submit
</Button>
```

For pages without React Hook Form (manual state), derive `canSubmit` from the relevant input refs/state.

- [ ] **Step 7.3: Commit per app (candidate, company) or per logical group**

Grouped commit messages:
```
git commit -m "fix(candidate/auth-forms): disable submit on invalid/pending across 5 pages"
git commit -m "fix(candidate/company-forms): disable submit on invalid/pending across N pages"
```

- [ ] **Step 7.4: Per-commit gate**

```
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

---

## Task 8 — `errorMessage()` coverage audit

**Files:**
- Modify: any `toast.error(...)` site that builds its message manually instead of using `errorMessage()`.

**Interfaces:**
- Consumes: existing `errorMessage()` from `@ip/shared`.
- Produces: 100% coverage — every error toast goes through the friendly mapper.

- [ ] **Step 8.1: Grep for direct error message construction**

```
grep -rn "toast.error" frontend/apps frontend/packages 2>&1 | grep -v "errorMessage" | head -30
```

Each hit that builds its own message is a candidate. Inspect: does the manual message hide a gRPC error? If so, swap to `toast.error(errorMessage(err))`.

Exclude legitimate static-string toasts ("Please choose a date"). Only convert ones that wrap a caught error.

- [ ] **Step 8.2: Per-file fix + commit**

Each replacement is mechanical. Commit per package or per app.

- [ ] **Step 8.3: Verify typecheck + build**

```
cd frontend && npx pnpm@9.15.0 -r typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
cd frontend && npx pnpm@9.15.0 --filter @ip/company build
```

---

## Task 9 — Phase 3 HANDOFF doc + memory pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-robustness-phase-3-handoff.md`
- Modify: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md` (append)
- Create: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-3.md`

- [ ] **Step 9.1: Write the HANDOFF doc.** Template:

```markdown
# Robustness Phase 3 — HANDOFF (2026-06-21)

Phase 3 closed: every long-poll site capped, settings/appearance live-only, every
error toast user-friendly, ICS failures surfaced, every submit button correct.

Branch: main · Base: <P2 HEAD> · HEAD: <P3 HEAD>
Gate: pnpm -r typecheck + pnpm build green; bash scripts/check.sh untouched (BE not changed).

## Shipped
- @ip/shared pollingBackoff helper (Task 1)
- Profile resume polling capped (Task 2)
- Dashboard polling capped (Task 3)
- Applicant report polling capped + cast-seam defensive (Task 4)
- Settings + Appearance live-only (Task 5)
- ICS error toast on both schedule pages (Task 6)
- Submit-button disabled-state across N form pages (Task 7)
- errorMessage() coverage audit — N callsites converted (Task 8)
```

- [ ] **Step 9.2: Create memory file `robustness-phase-3.md`.**

- [ ] **Step 9.3: Append pointer to MEMORY.md (one line).** REMEMBER: MEMORY.md is an INDEX of pointers — do NOT write Phase-3 content INTO MEMORY.md (Phase 1+2 hit this bug twice). Append ONE line:

```markdown
- [Robustness Phase 3 (2026-06-21)](robustness-phase-3.md) — FE robustness sweep: pollingBackoff helper, capped poll sites, live-only settings, ICS toast, submit-button audit
```

- [ ] **Step 9.4: Commit the HANDOFF doc only**

```
git add docs/superpowers/plans/2026-06-21-robustness-phase-3-handoff.md
git commit -m "docs(robustness-phase-3): HANDOFF — phase 3 close + verification"
```

---

## Self-review

**1. Spec coverage:**
- §3 Phase 3 settings live-wiring → Task 5 ✓
- §3 Phase 3 resume-parse polling backoff → Task 2 ✓
- §3 Phase 3 report polling max-poll cap + manual refresh → Task 4 ✓
- §3 Phase 3 dashboard polling backoff → Task 3 ✓
- §3 Phase 3 defensive cast-seam → Task 4 (combined) ✓
- §3 Phase 3 friendly error mapping → Task 8 (coverage audit; existing helper sufficient) ✓
- §3 Phase 3 submit-button disabled state → Task 7 ✓
- §3 Phase 3 ICS RPC error surfacing → Task 6 ✓
- HANDOFF + memory → Task 9 ✓

**2. Placeholder scan:**
- Task 7 "TBD" entries are operational — the implementer reads each file to confirm current state. Not a placeholder; it's the audit step.
- Task 8 "N callsites" — actual count determined by grep, recorded in commit message + report.

**3. Type / signature consistency:**
- `pollingBackoff(opts).(query)` signature matches Tanstack Query v5's `refetchInterval` callback signature ✓
- `errorMessage(err: unknown) → string` unchanged ✓

**4. Gate impact:**
- Each task explicitly runs `pnpm typecheck` + `pnpm build` before commit ✓
- No BE code changes — full `scripts/check.sh` run is informational only.

No issues found. Plan ready.

---

## What this plan does NOT cover (deferred to Phase 4+)

- Missing-RPC wirings (decisions.hold/reject, IntegrityTimeline, server-side cursor pagination, unified mark-read) — Phase 4.
- Observability platform (ObservabilityService, FE SDK, funnel events) — Phase 5.
- Messaging SSE, voice-worker graceful shutdown, chaos verification — Phase 6.

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-4-missing-wirings.md` (after Phase 3 closes).
