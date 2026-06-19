# Aptura v2 — Frontend Build Program (screens + backend contracts)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute each per-screen plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement every v2 screen in the frontend, each against an explicit **backend-requirement contract**, so a parallel session can build the backend while the frontend is built — integrating at `pnpm gen`.

**Architecture:** Each screen is a Next.js App-Router route that follows the established pattern (`"use client"` → `useAuth`/`useRequireAuth` → `useAuthedQuery` (gRPC) or a REST client → `@ip/ui` → loading/empty/error states). A screen's **BE needs are a typed contract** — an admin gRPC RPC (proto request/response) or an ai-agents REST shape. The frontend is built **against that contract with a mock client**; the backend session implements the same contract; they integrate when the proto regenerates (`pnpm gen`) or the REST endpoint lands.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript 5.7 · Tailwind v4 · TanStack Query v5 · `@connectrpc/connect-web` + protobuf-es (gRPC-web) · `@ip/ui` (Radix + tokens) · `@ip/shared` (auth/transport) · `@ip/api-client` (buf-generated). Backend: admin gRPC-web, ai-agents FastAPI REST, MongoDB, the 40-signal proctoring model.

---

## Global Constraints

- **Package manager:** `npx pnpm@9.15.0` (pinned). Verify per app: `--filter @ip/candidate build`, `--filter @ip/company build`, `--filter @ip/{ui,shared,api-client} typecheck`.
- **NEVER run `next build` while `pnpm dev` is live** — it clobbers `.next` (chunk-not-found 500s). Stop dev first. (Use the `preview_*` tools for the verify loop.)
- **FE root:** the monorepo is at `frontend/` — all paths are `frontend/apps/{candidate,company}/…` + `frontend/packages/{ui,shared,api-client}/…`.
- **lucide-react must be declared per app** (`frontend/apps/{candidate,company}/package.json`) — pnpm strict resolution.
- **Design tokens only** — `@ip/ui` semantic tokens (`bg-background`, `text-foreground`, `bg-primary`, status families); never raw `zinc/red/green`. Violet brand scale `brand-*`. Sora display + Inter body. Dark mode is class-based + automatic.
- **`--gradient-brand`** (violet→indigo) only on hero/marketing surfaces; product UI stays flat.
- **Proctoring pivot (2026-06-20):** the interview is **strictly proctored** (camera+mic required, no mute, fullscreen-locked, 40 signals, HIGH-severity auto-gate, integrity surfaced to recruiters). No "no-surveillance" copy. Canonical: [proctored-integrity](../v2/2026-06-20-proctored-integrity.md).
- **Backend gate** (for the BE sessions implementing contracts): `bash scripts/check.sh` green (baseline 423 tests), `scripts/smoke_login.py --selftest` after transport touches, `pnpm gen` clean.
- **Local-only project — never run git/gh** beyond what the user asks.

---

## 1. Current-state baseline (code-verified 2026-06-20)

### Frontend — the canonical screen pattern (every plan follows this)
```tsx
"use client";
import { useAuth } from "../lib/auth";
import { useRequireAuth, useAuthedQuery, errorMessage } from "@ip/shared";
import { PageHeader, Card, LoadingState, ErrorState, EmptyState } from "@ip/ui";

export default function Screen() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready, "/login");        // redirect if unauthed
  const q = useAuthedQuery(token, {              // gRPC via TanStack Query
    queryKey: ["thing"],
    queryFn: () => api.service.method({ ... }),   // typed client call
  });
  if (!token) return null;                        // hydration guard
  return (
    <Shell>
      <PageHeader title="…" action={…} />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} />}
      {q.data && /* render */}
    </Shell>
  );
}
```
- **gRPC** → `useAuth().api.<service>.<method>()` (auto bearer + 401-refresh-retry via the authed transport). **REST** (ai-agents) → typed clients (`interview`, `chat`, `jd`, `proctor`) from `lib/auth.tsx`, using `authedFetch`.
- **Components** from `@ip/ui` (Button, Card, Badge, Alert, Input, Select, Dialog, Tabs, Table, Avatar, Progress, DropdownMenu, Tooltip, ConfirmDialog, ChatWindow, AppShell/PageHeader/EmptyState/ErrorState/LoadingState, Skeleton, toast). Shells: `CandidateShell` / `CompanyShell`.
- **States** every screen ships: loading (`LoadingState`/`Skeleton`), empty (`EmptyState`), error (`ErrorState` + retry), success.

### Frontend — built vs. missing
| Built | Missing / partial |
|---|---|
| Auth (login/register/verify/forgot/reset/SSO), candidate dashboard, job detail, profile/account, **text** interview, aptitude; company jobs/post-a-job/applicants/report/talent/analytics/rubrics/team(basic) | Marketplace search, saved jobs, job alerts, company pages, **proctored** interview room, coding assessment UI, practice + skill-gap, messaging, notifications center, settings/2FA, scheduling, onboarding |

### Backend — built services vs. gaps
- **admin gRPC (built):** Auth, Profile, Job, Application, Aptitude, Decision, Report, Analytics, Compliance, Recommendation, Rubric, Talent (+ OAuth REST).
- **ai-agents REST (built):** `/interview/{id}/start|turn|proctor|rtc-token`, `/chat/turn` (SSE), `/jd/improve`. **40-signal proctoring** model + `/proctor` ingest + `proctoring_events` (write-only).
- **Gaps the screens need (→ new contracts):** `SearchJobs`/discovery + facets, `GetPublicJobDetail`, `CompanyProfile`, `SavedJobs`, `JobAlerts`, `Messaging`, `Notifications`, `Scheduling`, `Settings`/2FA, `Team`, `SearchCandidates`, **`GetIntegrityTimeline`** (read proctoring_events) + report integrity fields, **proctoring auto-gate** + camera/mic detectors, practice endpoints, extended `Job` fields + `gate_mode`.

---

## 2. The FE↔BE contract model (how parallelization works)

Each per-screen doc has a **Backend Contract** section the BE session implements standalone. A contract is one of:

**(a) gRPC RPC** (admin) — the dominant case. Specify the proto delta:
```proto
// service: admin.discovery.v1 — NEW
rpc SearchJobs(SearchJobsRequest) returns (SearchJobsResponse);
message SearchJobsRequest { string q = 1; string location = 2; ... int32 page = 9; }
message SearchJobsResponse { repeated JobCard jobs = 1; Facets facets = 2; int32 total = 3; }
```
→ BE session: proto + servicer + resource + Mongo + tests; FE session: `pnpm gen` exposes `api.discovery.searchJobs(...)`.

**(b) REST shape** (ai-agents) — for interview/practice/proctoring:
```
POST /practice/start  {topic?, jd_text?} → {practice_id, question}
```

**The build-against-mock workflow** (lets FE proceed before BE lands):
1. FE plan defines the contract's TS shape (a local `types.ts` mirroring the proto/REST response).
2. FE builds a **mock client** (`makeMock<Screen>Client()` returning fixture data of that shape) behind the same interface the real client will satisfy.
3. FE builds the screen against the mock; verifies via the preview loop.
4. BE session implements the contract; FE swaps mock → real (`api.<svc>.<method>` after `pnpm gen`, or the REST client). The screen's component code doesn't change — only the client binding.

> This is why every screen is buildable in parallel: the **contract is the integration seam**, and the mock makes the FE independently testable today.

---

## 3. Build order (waves) + screen index

Each row links its per-screen doc (`v2-screens/<name>.md`) with the FE plan + BE contract. **New** = the BE session must build it; **Existing** = already in code; **Extend** = add fields/RPCs.

### Wave 0 — Reposition + foundation (mostly FE, little/no new BE)
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Landing (proctored reposition) | candidate · `/` | none (later `/public/jobs`) | `v2-screens/landing.md` |
| Auth restyle (split layout) | both · `/login` … | Existing Auth | `v2-screens/auth.md` |
| Profile enhance (completeness) | candidate · `/profile` | Existing Profile | `v2-screens/candidate-profile.md` |

### Wave 1 — Marketplace & discovery (the headline)
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Job marketplace / search | candidate · `/jobs` | **NEW** `DiscoveryService.SearchJobs` + facets; public `/public/jobs` | `v2-screens/marketplace-search.md` |
| Job detail (public/SSR) | candidate · `/jobs/[id]` | **Extend** `GetPublicJob`→`GetPublicJobDetail` (salary/skills/remote/company) | `v2-screens/job-detail.md` |
| Company profile page | candidate · `/companies/[id]` | **NEW** `CompanyProfileService.GetCompanyProfile` | `v2-screens/company-profile.md` |
| Saved jobs | candidate · `/saved` | **NEW** `SavedJobsService` (Save/Unsave/List) | `v2-screens/saved-jobs.md` |
| Job alerts | candidate · `/alerts` | **NEW** `JobAlertsService` (Create/List/Delete) | `v2-screens/job-alerts.md` |
| Dashboard / tracker enhance | candidate · `/` (authed) | Existing `ListMyApplications` (+ status detail) | `v2-screens/candidate-dashboard.md` |
| Post-a-job extended | company · `/jobs/new` | **Extend** `Job` (location/remote/salary/skills/type) + `gate_mode` | `v2-screens/post-a-job.md` |
| Company branding editor | company · `/branding` | **NEW** `CompanyProfileService.Upsert` + logo presign | `v2-screens/company-branding.md` |
| Recruiter dashboard + KPIs | company · `/` | **Extend** `Analytics` (no-ghosting KPIs) | `v2-screens/recruiter-dashboard.md` |
| Talent pool / sourcing | company · `/talent` | **NEW** `SourcingService.SearchCandidates` | `v2-screens/talent-sourcing.md` |
| Onboarding / first-run | both · first-run | Existing | `v2-screens/onboarding.md` |

### Wave 2 — Proctored interview + assessments + report
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Proctored interview room | candidate · `/interview/[id]` | **Evolve** proctoring (camera/mic detectors wiring, no-mute, fullscreen, auto-gate) + `rtc-token` | `v2-screens/proctored-interview.md` |
| Coding assessment + sandbox | candidate · `/aptitude/[id]` | **Extend** `Aptitude` (typed kinds) + `run_code` (mcp-capability) | `v2-screens/coding-assessment.md` |
| Applicants pipeline + advisory gate | company · `/jobs/[id]` | Existing + `assessment_review` funnel state | `v2-screens/applicants-pipeline.md` |
| AI candidate report + integrity band | company · `/jobs/[id]/applicants/[appId]` | **NEW** `Report.GetIntegrityTimeline` + report integrity fields | `v2-screens/candidate-report.md` |

### Wave 3 — Messaging + notifications
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Messaging (candidate + recruiter) | both · `/messages` | **NEW** `MessagingService` (Send/ListThreads/ListMessages/MarkRead) | `v2-screens/messaging.md` |
| Notifications center + bell | both · bell + `/notifications` | **NEW** `NotificationService` (List/MarkRead/MarkAllRead) | `v2-screens/notifications.md` |

### Wave 4 — Account & team
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Settings & security (2FA/sessions/prefs) | both · `/settings` | **NEW** `SettingsService` (11 RPCs) | `v2-screens/settings-security.md` |
| Team & permissions | company · `/team` | **NEW** `TeamService` (6 RPCs) + RBAC matrix (lib) | `v2-screens/team-permissions.md` |

### Wave 5 — Growth & scheduling
| Screen | App · route | BE contract | Doc |
|---|---|---|---|
| Practice + skill-gap feedback | candidate · `/practice` + `/feedback/[id]` | **NEW** ai-agents `/practice/*` | `v2-screens/practice-feedback.md` |
| Interview scheduling | both · `/schedule` + applicant tab | **NEW** `SchedulingService` (5 RPCs) + reminder sweep | `v2-screens/scheduling.md` |

> Each new BE contract traces to an existing v2 pillar plan (job-marketplace, messaging, notifications-center, settings-and-security, team-and-permissions, interview-scheduling, candidate-growth, rich-assessments, code-execution-sandbox, proctored-integrity) — the per-screen contract is the **screen-scoped slice** of that plan, plus the exact proto/REST shape.

---

## 4. New backend surface the screens require (consolidated)

The screen gaps resolve to these **new** backend deliverables (full detail in [backend build plan](../v2/2026-06-20-backend-build-plan.md) + [proctored-integrity](../v2/2026-06-20-proctored-integrity.md)). Each becomes a contract section in its screen doc:

- **New gRPC services:** `DiscoveryService` (SearchJobs, GetPublicJobDetail, GetRecommendedFeed), `CompanyProfileService`, `SavedJobsService`, `JobAlertsService`, `SourcingService`, `MessagingService`, `NotificationService`, `SchedulingService`, `TeamService`, `SettingsService` + `Report.GetIntegrityTimeline`.
- **Extended:** `Job` (location/remote_mode/employment_type/salary/skills/posted_at + `gate_mode`), `Aptitude` (typed mcq/coding/free_text), `Analytics` (no-ghosting KPIs), `Application`/funnel (`assessment_review`).
- **New REST (ai-agents):** `/practice/start|{id}/turn|{id}/feedback`; proctoring **auto-gate** (HIGH-severity terminate) + camera/mic on-device detectors (`@ip/shared/proctor-vision.ts`, `proctor-audio.ts`); session recording.
- **New mcp-capability:** `run_code` sandbox.
- **New collections/indexes:** per the backend build plan (company_profiles, saved_jobs, job_alerts, message_threads, messages, notifications, notification_prefs, interview_slots, interview_bookings, member_job_assignments, code_submissions, practice_sessions) — admin owns the index authority.

---

## 5. Per-screen doc template (every `v2-screens/<name>.md` follows this)

````markdown
# Screen: <Name> — FE plan + BE contract

**Route:** `<app>/app/<path>/page.tsx`  ·  **Mockup:** `<aptura_… widget>`  ·  **Pillar:** `<v2 plan>`
**Goal:** <one sentence>

## A. Backend contract (hand this to a backend session)
**Status:** NEW | EXTEND | EXISTING · **Service:** `<admin.x.v1 | ai-agents REST>`
- RPC/endpoint: `<signature>`
- Request: `<message fields + types>`
- Response: `<message fields + types>`  ← the FE renders these
- Auth/scope: `<bearer; comp/candidate scope>`
- Backed by: `<resource + collection + index>` (cross-ref the pillar plan)
- Proto delta / new file: `<src/admin/app/routes/pb/<x>.proto>` (or REST route)
- **FE mock shape** (`types.ts`): the TS interface the FE codes against until this lands.

## B. Frontend plan (TDD, bite-sized)
**Files:** Create/Modify (exact paths) · **Components** (new + `@ip/ui` reused) · **Query keys**
### Task 1: <thing>
- [ ] Step 1 … (real code) … - [ ] Step N: verify `--filter @ip/<app> build` + typecheck + preview
…
## C. States & acceptance
loading/empty/error/success · responsive · dark · a11y · pixel-matches mockup · build+typecheck green.
````

---

## 6. Execution (after all plans are written)

Per the user's choice, **all per-screen plans + contracts are authored first** (this program), **then** implementation begins. When building:
- **Frontend:** I execute each screen's Part B against the Part A mock (preview-verified), in wave order.
- **Backend (parallel sessions):** each takes a screen's Part A contract → implements proto/servicer/resource/tests (TDD, `scripts/check.sh`), → `pnpm gen` integrates.
- Use `superpowers:subagent-driven-development` for task-by-task execution with review checkpoints.

## 7. Status of this program
- [x] Architecture + current-state baseline + contract model + build order (this doc)
- [x] **All 24 per-screen docs authored** (`v2-screens/*.md`) — Wave 0–5, FE plan + BE contract each (2026-06-20)
- [ ] Execution (FE build + parallel BE) — green-lit next

### Shared components — build ONCE, referenced across screens
Build these first (in `@ip/ui` or the app); they are defined in the named doc, other docs **reuse** them (never re-create):
| Component | Defined in | Reused by |
|---|---|---|
| `JobCard` + `SaveJobButton` (optimistic toggle) | `marketplace-search.md` / `saved-jobs.md` | job-detail, company-profile, talent |
| `ScoreRing`, `StatusPill` | `candidate-report.md` (Task 0) | applicants-pipeline, dashboard |
| `KpiCard`, `FunnelChart` (extracted from analytics) | `recruiter-dashboard.md` | analytics, candidate-dashboard |
| `NotificationBell`, `NotificationItem` | `notifications.md` | both shells |
| `AuthSplitPanel`, `AuthLayout` | `auth.md` | all auth routes |
| `JobForm` | `post-a-job.md` | job edit |
| `ProctorStatusStrip` + `proctor-vision.ts` + `proctor-audio.ts` | `proctored-interview.md` | — |
| `CodeEditor` | `coding-assessment.md` | — |
