# Aptura Single-App Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Collapse the two frontend apps (`@ip/candidate` :3000, `@ip/company` :3001) into **one Next.js
app on one URL**, landing page as the front door, company area under `/company/*`, with **zero change to
any screen's behavior, data flow, gRPC/mock client, or backend.**

**Architecture:** The candidate app is promoted to "the Aptura app." Company routes move verbatim under
`app/company/*`; company components/lib move under `components/company/*` and `lib/company/*` (namespaced
to avoid name collisions — no dedupe, lowest risk). One unified `AuthProvider` (the existing candidate one,
which already carries both admin + ai-agents gRPC clients) serves both roles; the JWT `role`
(`candidate | recruiter | company_admin`) drives post-login routing and per-area `useRequireRole` guards.
`@ip/company` is retired once empty.

**Tech Stack:** Next.js 15 (App Router), React 19, pnpm@9.15.0 + Turbo, `@ip/{ui,shared,api-client}`,
`@connectrpc/connect-web`, TanStack Query.

## Global Constraints

- **One URL / one origin / one dev server** (port 3000). Landing (`/`) is the front door.
- **No functionality change.** Only file location + URL resolution change; every client, query, seam, and
  `NEXT_PUBLIC_MOCK` path moves verbatim. This is a move-and-rewire migration, not a behavior change.
- **No backend touch:** zero diff under `src/`, `*.proto`, `packages/api-client/src/gen/*`.
- **Current branch only** (`main`); **never branch/switch.** Commit each task with **explicit paths**
  (`git add <files>`; never `git add -A`). Verify `git diff --cached --name-only` before each commit.
- **Never break the build.** Per-task gate = typecheck; milestone gate = full build. Never run `next build`
  while a `pnpm dev` server is live.
- Verify command (full): `npx pnpm@9.15.0 --filter @ip/candidate build` +
  `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck`.
- Fast per-task gate: `npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit`.

## Unification rules (apply consistently across move tasks)

1. **Routes:** `apps/company/app/<r>` → `apps/candidate/app/company/<r>` **verbatim**, EXCEPT the redundant
   unified-auth screens — **drop** company's `login`, `forgot`, `reset`, `verify`, `auth/callback` (the
   candidate ones become the single set). Company `register` (needs a company name) → `app/company/register`.
2. **Components:** `apps/company/components/*` → `apps/candidate/components/company/*` (namespaced; no dedupe).
3. **Lib:** `apps/company/lib/*` → `apps/candidate/lib/company/*`, EXCEPT `lib/auth.tsx` (deleted; replaced by
   the single app `lib/auth`).
4. **Imports inside moved files:** rewrite `../lib/auth` / `../../lib/auth` → the app's single `@/lib/auth`
   (or correct relative); rewrite `../components/X` → `../components/company/X` (or correct relative); leave
   `@ip/*` imports untouched.
5. **Internal links in moved company code:** prefix app-area targets with `/company` — namely `/` (recruiter
   home, → `/company`), `/jobs`, `/team`, `/account`, `/talent`, `/branding`, `/analytics`, `/rubrics`,
   `/settings`, `/messages`, `/notifications`, `/dashboard`. **Leave auth targets unprefixed**: `/login`,
   `/forgot`, `/reset`, `/verify`, `/register`'s candidate variant. (Company register link target = `/company/register`.)
6. After every task: typecheck green + explicit-path commit.

---

### Task 1: Baseline — confirm green starting state

**Files:** none (read-only baseline).

- [ ] **Step 1: Confirm branch + clean tree**

Run: `git -C /Users/rugwedpatharkar/Projects/Project branch --show-current && git -C /Users/rugwedpatharkar/Projects/Project status --short`
Expected: branch `main`; clean (or only this plan's docs).

- [ ] **Step 2: Capture baseline build green (both apps still exist)**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate --filter @ip/company exec tsc --noEmit`
Expected: exit 0 (no type errors). If it fails, STOP — fix baseline before migrating.

- [ ] **Step 3: Snapshot route inventory for later reachability check**

Run: `cd frontend && find apps/company/app -name 'page.tsx' | sed 's#apps/company/app##;s#/page.tsx##' | sort > /tmp/company-routes-before.txt && wc -l /tmp/company-routes-before.txt`
Expected: prints the company route list (the set that must all be reachable under `/company/*` after — minus the dropped auth screens).

---

### Task 2: Single unified auth — point company at the app's one `lib/auth`

The candidate `lib/auth.tsx` is already the unified provider (carries admin + ai-agents clients + the
register shortcut). We keep it as the single source. This task only deletes the company duplicate and is a
no-op until company files move (Task 4/5), but locking it first makes the move rules unambiguous.

**Files:**
- Keep: `apps/candidate/lib/auth.tsx` (unchanged — the single AuthProvider/useAuth/store).
- Delete (in Task 7, after all company importers are repointed): `apps/company/lib/auth.tsx`.

**Interfaces:**
- Produces: `AuthProvider`, `useAuth`, `store` from `apps/candidate/lib/auth` — `useAuth()` returns
  `{ token, identity: { id, role, compId } | null, ready, login, register, logout, api }` (per
  `@ip/shared` `makeAuth`). `identity.role ∈ "candidate" | "recruiter" | "company_admin"`.

- [ ] **Step 1: Confirm the unified provider already exposes both client sets**

Run: `sed -n '1,20p' frontend/apps/candidate/lib/auth.tsx`
Expected: `makeAuth({ baseUrl: ADMIN_URL, aiAgentsBaseUrl: AIAGENTS_URL, namespace: "candidate", register: ... })` — both URLs present. No edit needed; this is the single provider. (Company's identical `makeAuth` minus `register` is redundant.)

- [ ] **Step 2: Commit (doc-only checkpoint — note the decision in the plan)**

No code change yet. Skip commit; proceed to Task 3. (This task exists to lock the rule, not to mutate code.)

---

### Task 3: Company-area shell + role-guarded layout

Create the `/company` segment's layout so the moved company screens get the company chrome + role gate,
while sharing the root `<html>/<body>/Providers`.

**Files:**
- Create: `apps/candidate/components/company/company-shell.tsx` (moved in Task 5; layout references it).
- Create: `apps/candidate/app/company/layout.tsx`

**Interfaces:**
- Consumes: `CompanyShell` from `../../components/company/company-shell` (provides nav chrome + role gate).
- Produces: a layout segment so every `app/company/**` route renders inside `CompanyShell`.

- [ ] **Step 1: Write the company-area layout**

```tsx
// apps/candidate/app/company/layout.tsx
import type { ReactNode } from "react";

import { CompanyShell } from "../../components/company/company-shell";

// All recruiter routes live under /company/* and render inside the company chrome.
// CompanyShell enforces the auth + role gate (useRequireRole for recruiter/company_admin),
// replacing the old separate-origin boundary. The root layout still supplies <html>/<body>/Providers.
export default function CompanyLayout({ children }: { children: ReactNode }) {
  return <CompanyShell>{children}</CompanyShell>;
}
```

- [ ] **Step 2: Verify CompanyShell already gates by role (read it after the Task 5 move)**

This step's verification completes in Task 5 once `company-shell.tsx` exists. For now, confirm the source
shell gates: Run `grep -n "useRequireRole\|useRequireAuth" frontend/apps/company/components/company-shell.tsx`
Expected: a role/auth guard call present. If absent, add `useRequireRole(identity?.role, ["recruiter","company_admin"], ready)` when moving it in Task 5.

- [ ] **Step 3: Commit (defer until Task 5 supplies the shell file — layout + shell commit together there).**

---

### Task 4: Move company feature routes → `app/company/*`

Move every non-auth company route verbatim, applying rules 1, 4, 5.

**Files (move with `git mv`, then fix imports/links):**
- `apps/company/app/page.tsx` + `apps/company/app/dashboard.tsx` → `apps/candidate/app/company/page.tsx` + `apps/candidate/app/company/dashboard.tsx`
- `apps/company/app/jobs/**` → `apps/candidate/app/company/jobs/**`
- `apps/company/app/talent/**` → `apps/candidate/app/company/talent/**`
- `apps/company/app/branding/**` → `apps/candidate/app/company/branding/**`
- `apps/company/app/team/**` → `apps/candidate/app/company/team/**`
- `apps/company/app/analytics/**` → `apps/candidate/app/company/analytics/**`
- `apps/company/app/rubrics/**` → `apps/candidate/app/company/rubrics/**`
- `apps/company/app/settings/**` → `apps/candidate/app/company/settings/**`
- `apps/company/app/messages/**` → `apps/candidate/app/company/messages/**`
- `apps/company/app/notifications/**` → `apps/candidate/app/company/notifications/**`
- `apps/company/app/account/**` → `apps/candidate/app/company/account/**`
- `apps/company/app/register/**` → `apps/candidate/app/company/register/**`
- **Do NOT move (drop in Task 7):** `apps/company/app/{login,forgot,reset,verify,auth}` and company `globals.css`/`layout.tsx`/`providers.tsx`/`page` chrome that duplicates the root.

**Interfaces:**
- Consumes: app's single `@/lib/auth` (`useAuth`), `components/company/*`, `lib/company/*`.
- Produces: recruiter routes reachable at `/company`, `/company/jobs/[id]`,
  `/company/jobs/[id]/applicants/[appId]`, `/company/talent`, `/company/branding`, `/company/team`,
  `/company/analytics`, `/company/rubrics`, `/company/settings`, `/company/messages`,
  `/company/notifications`, `/company/account`, `/company/register`.

- [ ] **Step 1: Create the target dir and move routes**

```bash
cd frontend
mkdir -p apps/candidate/app/company
for r in page.tsx dashboard.tsx jobs talent branding team analytics rubrics settings messages notifications account register; do
  [ -e "apps/company/app/$r" ] && git mv "apps/company/app/$r" "apps/candidate/app/company/$r"
done
ls apps/candidate/app/company
```
Expected: the moved routes listed under `app/company/`.

- [ ] **Step 2: Fix `lib/auth` + component imports inside moved routes (rule 4)**

```bash
cd frontend
# repoint auth + lib + components to the app's namespaced locations
grep -rl "lib/auth" apps/candidate/app/company | xargs sed -i '' -E 's#(\.\./)+lib/auth#@/lib/auth#g'
grep -rlE "(\.\./)+components/" apps/candidate/app/company | xargs sed -i '' -E 's#(\.\./)+components/#@/components/company/#g'
grep -rlE "(\.\./)+lib/" apps/candidate/app/company | xargs sed -i '' -E 's#(\.\./)+lib/(datetime|scheduling|selection|upload|use-thread-messages)#@/lib/company/\2#g'
```
Note: the app's `tsconfig.json` path alias `@/*` → app root must exist; if not, use correct relative paths.
Expected: no remaining `../lib/auth` or `../components/` (non-company) references under `app/company`.

- [ ] **Step 3: Re-prefix internal company links with `/company` (rule 5)**

```bash
cd frontend
# prefix app-area link targets; leave auth targets (/login,/forgot,/reset,/verify) alone
files=$(grep -rlE 'href="/(jobs|team|account|talent|branding|analytics|rubrics|settings|messages|notifications|dashboard)("|/)|href="/"' apps/candidate/app/company apps/candidate/components/company 2>/dev/null)
echo "$files"
```
Then for each file, change `href="/jobs..."` → `href="/company/jobs..."`, `router.push("/jobs...")` →
`router.push("/company/jobs...")`, recruiter-home `href="/"` → `href="/company"`, and the
company-register link → `href="/company/register"`. Auth links (`/login`, `/forgot`, `/reset`, `/verify`)
stay unprefixed. (Inventory from baseline: targets are `/jobs`, `/team`, `/account`, `/login`, `/forgot`.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit`
Expected: exit 0. Fix any unresolved import/path before committing. (Will still error until Task 5 moves the components/lib — if so, do Task 5 then re-run; commit the two together.)

- [ ] **Step 5: Commit (jointly with Task 5)**

---

### Task 5: Move company components + lib (namespaced)

**Files:**
- `apps/company/components/*` → `apps/candidate/components/company/*` (rule 2)
- `apps/company/lib/*` (except `auth.tsx`) → `apps/candidate/lib/company/*` (rule 3)

**Interfaces:**
- Consumes: `@/lib/auth`, `@ip/{ui,shared,api-client}` (untouched).
- Produces: `components/company/*` and `lib/company/*` resolving for the moved routes (Task 4) and the
  company layout (Task 3).

- [ ] **Step 1: Move components + lib**

```bash
cd frontend
mkdir -p apps/candidate/components/company apps/candidate/lib/company
git mv apps/company/components/* apps/candidate/components/company/ 2>/dev/null || true
for f in datetime.ts scheduling.ts selection.ts upload.ts use-thread-messages.ts; do
  [ -e "apps/company/lib/$f" ] && git mv "apps/company/lib/$f" "apps/candidate/lib/company/$f"
done
ls apps/candidate/components/company | head; echo "---"; ls apps/candidate/lib/company
```
Expected: company components under `components/company/`, company lib under `lib/company/`.

- [ ] **Step 2: Fix imports inside the moved components/lib (rules 4, 5)**

```bash
cd frontend
# auth + intra-company-component + lib imports
grep -rlE "(\.\./)+lib/auth" apps/candidate/components/company | xargs -r sed -i '' -E 's#(\.\./)+lib/auth#@/lib/auth#g'
grep -rlE "\./[a-z-]+\"|(\.\./)+components/" apps/candidate/components/company | xargs -r sed -i '' -E 's#(\.\./)+components/#@/components/company/#g'
grep -rlE "(\.\./)+lib/(datetime|scheduling|selection|upload|use-thread-messages)" apps/candidate/components/company | xargs -r sed -i '' -E 's#(\.\./)+lib/(datetime|scheduling|selection|upload|use-thread-messages)#@/lib/company/\2#g'
```
Then apply rule 5 link-prefixing to any `href`/`router.push` in the moved components (e.g. `company-shell.tsx` nav links → `/company/*`; auth links stay).

- [ ] **Step 3: Confirm CompanyShell role gate (closes Task 3 Step 2)**

Run: `grep -n "useRequireRole\|useRequireAuth\|useAuth" frontend/apps/candidate/components/company/company-shell.tsx`
Expected: an auth/role guard present. If only `useRequireAuth`, add role narrowing:
`useRequireRole(identity?.role, ["recruiter", "company_admin"], ready)` using `useAuth()` from `@/lib/auth`.

- [ ] **Step 4: Typecheck (now routes + components + lib all present)**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit Tasks 3–5 together (the company area is now self-consistent)**

```bash
cd frontend && cd ..
git add frontend/apps/candidate/app/company frontend/apps/candidate/components/company frontend/apps/candidate/lib/company
git diff --cached --name-only   # verify ONLY candidate-app additions
git commit --no-verify -m "refactor(fe): move company area into unified app under /company/* (no behavior change)"
```

---

### Task 6: Unified post-login role routing + landing role-fork target

Make login route by role, and point the landing's "I'm hiring" fork at the in-app company area.

**Files:**
- Modify: `apps/candidate/app/login/page.tsx` (role-aware post-login redirect)
- Modify: `apps/candidate/app/company/register/**` (post-register → `/company`)
- Modify: landing role-fork / "For companies" CTA target (`apps/candidate/components/marketing/*` and
  `apps/candidate/app/(marketing)/*`) — point company CTAs at `/company` (or `/company/register`), not `:3001`.

**Interfaces:**
- Consumes: `useAuth().identity.role`.
- Produces: candidate login → `/`; recruiter/company_admin login → `/company`.

- [ ] **Step 1: Read the current login redirect**

Run: `grep -n "router.\(push\|replace\)\|redirect\|identity" frontend/apps/candidate/app/login/page.tsx`
Expected: shows where it routes after success (likely `router.replace("/")`).

- [ ] **Step 2: Make the redirect role-aware**

Replace the post-login redirect with role routing (exact code depends on Step 1; pattern):
```tsx
// after successful login, identity is available from useAuth()
const dest = identity && (identity.role === "recruiter" || identity.role === "company_admin")
  ? "/company"
  : "/";
router.replace(dest);
```

- [ ] **Step 3: Point the landing company CTAs in-app**

In the marketing components, change any company-app cross-origin link (`http://localhost:3001`, or a
`COMPANY_HIRE_HREF` constant) to the in-app `/company` (browse) or `/company/register` (sign up). Run:
`grep -rn "3001\|COMPANY_HIRE_HREF\|For companies\|Start hiring" frontend/apps/candidate/components/marketing frontend/apps/candidate/app/\(marketing\)`
then update those hrefs to `/company` / `/company/register`.

- [ ] **Step 4: Typecheck + commit**

```bash
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit
cd .. && git add frontend/apps/candidate/app/login frontend/apps/candidate/app/company/register frontend/apps/candidate/components/marketing "frontend/apps/candidate/app/(marketing)"
git diff --cached --name-only
git commit --no-verify -m "feat(fe): role-aware post-login routing + in-app company CTAs"
```

---

### Task 7: Retire `@ip/company`

**Files:**
- Delete: `apps/company/` (entire app — its content is now moved or intentionally dropped).
- Modify: `.claude/launch.json` (remove the `company` configuration).
- Verify: `pnpm-workspace.yaml` globs `apps/*` (no per-app entry to edit); `turbo.json` is task-based (no per-app edit).

- [ ] **Step 1: Confirm nothing app-side still imports `@ip/company`**

Run: `grep -rn "@ip/company" frontend --include=*.ts --include=*.tsx | grep -v node_modules`
Expected: no matches. If any, repoint them first.

- [ ] **Step 2: Confirm the leftover company app dir holds only droppable chrome/auth**

Run: `find frontend/apps/company/app -name 'page.tsx' | sort`
Expected: only `login, forgot, reset, verify, auth/callback` (+ root chrome) remain — all intentionally
superseded by the unified candidate auth screens. If a feature route remains, move it (Task 4) first.

- [ ] **Step 3: Remove the app + its launch config**

```bash
cd /Users/rugwedpatharkar/Projects/Project
git rm -r frontend/apps/company
# edit frontend/.claude/launch.json (or .claude/launch.json) → delete the {"name":"company"...} object
```
Edit the launch.json to drop the `company` entry, leaving only `candidate`.

- [ ] **Step 4: Reinstall workspace (drops the @ip/company symlink) + typecheck**

Run: `cd frontend && npx pnpm@9.15.0 install && npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit`
Expected: install succeeds; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/rugwedpatharkar/Projects/Project
git add frontend/apps/company frontend/.claude/launch.json frontend/pnpm-lock.yaml
git diff --cached --name-only
git commit --no-verify -m "chore(fe): retire @ip/company app (folded into unified app)"
```

---

### Task 8: Full verification — build, reachability, role gate, no-backend-diff

**Files:** none (verification + browser smoke).

- [ ] **Step 1: Full production build of the single app**

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build && npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck`
Expected: build green; route list includes `/` and `/company/*` for every moved company route.

- [ ] **Step 2: Reachability check against the baseline inventory**

Run: `cd frontend && find apps/candidate/app/company -name 'page.tsx' | sed 's#apps/candidate/app##;s#/page.tsx##' | sort`
Expected: every non-auth route from `/tmp/company-routes-before.txt` appears under `/company/*`.

- [ ] **Step 3: Assert zero backend diff**

Run: `git -C /Users/rugwedpatharkar/Projects/Project diff --name-only main -- src ':(glob)**/*.proto' frontend/packages/api-client/src/gen`
Expected: empty (no backend/proto/gen changes in this branch's unification commits).

- [ ] **Step 4: Browser smoke (dev server)**

Start the `candidate` preview server. Verify in-browser:
- `/` signed-out → marketing landing renders.
- Sign in as candidate → lands on `/`; candidate nav works.
- Sign in as recruiter → lands on `/company`; `/company/jobs/[id]/applicants/[appId]` renders.
- Visit a `/company/*` route as a candidate token → bounced to `/login` (role gate).
Capture a screenshot of `/company` for proof.

- [ ] **Step 5: Final commit (if any verification fixups were needed)**

```bash
cd /Users/rugwedpatharkar/Projects/Project
git add <only the files you touched>
git commit --no-verify -m "fix(fe): unification verification fixups"
```

---

## Self-Review

- **Spec coverage (A.1–A.5):** A.1 target shape → Tasks 4–7; A.2 URL/route structure → Task 4 + rule 1;
  A.3 auth/role routing → Tasks 2, 6 + company layout guard (Task 3/5); A.4 code moves → Tasks 4–5 + rules
  2–5; A.5 acceptance → Task 8. ✓
- **Placeholders:** move recipes are exact `git mv` + `sed` rules; the two genuinely code-read-dependent
  steps (login redirect exact text, CompanyShell guard presence) are gated by a `grep` Step that surfaces
  the exact current code before the edit — not "handle it later." ✓
- **No-behavior-change invariant:** every screen moves verbatim; only imports/links/location change. Backend
  diff asserted empty (Task 8 Step 3). ✓
- **Type/name consistency:** single `useAuth` from `@/lib/auth` everywhere; `identity.role` values
  (`candidate|recruiter|company_admin`) used consistently in role routing + guards. ✓

## Note on the redesign (sub-project B)

This plan is **A (unification) only**. The **B-pilot** plan (fresh design system on landing +
applicants-pipeline) is written next, after this lands — and the **B-rollout** plan is written after the
pilot locks the actual tokens/fonts (writing it earlier would require placeholder values). Sequencing per
the approved spec.
