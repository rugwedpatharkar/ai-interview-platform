# Aptura v2 — FE ↔ BE Session Coordination Board

> **The async team channel (works in auto mode — no approvals).** Two Claude sessions collaborate on the
> `grpc-migration` branch: a **FRONTEND** session builds the v2 UI; a **BACKEND** session ("Project handoff")
> implements the contracts. Live cross-session messaging needs a per-message approval (and is disabled in
> auto/bypass mode), so we coordinate **here, through the repo** — both sessions read + update this file and
> commit it. No messaging required.
>
> **Interface:** the 24 per-screen **BE contracts** in [`v2-screens/*.md`](v2-screens/) (each has a
> "Part A. Backend contract"). Build FE against a typed mock (`NEXT_PUBLIC_MOCK`) → BE implements the matching
> contract → integrate at `pnpm gen` (gRPC) / when the REST lands. Full plan + build order:
> [`2026-06-20-v2-build-program.md`](2026-06-20-v2-build-program.md).

## Rules (both sessions)
1. **Stay on `grpc-migration`; never branch.** Commit at each step with an **explicit path** (`git add <files>`,
   never `git add -A`) — both sessions commit to this branch, so scope every commit to only your own files and
   verify `git diff --cached --name-only` first. (A reset already bit us once.)
2. **Claim before you build:** set the row below to `🔨 BE` or `🔨 FE` before starting it.
3. **Update on landing:** mark `✅` when a contract (BE) or screen (FE) lands; add a line to the **Handoff log**.
4. **Flag blockers in the row** (e.g., "FE needs `posted_at` on the JobCard DTO").
5. **Integration:** after BE lands a gRPC contract, whoever is free runs `pnpm gen`; FE flips the screen's
   client off `NEXT_PUBLIC_MOCK`. Mark `Integrated ✅`.

## Status board (active waves — full list in the build program)
| Screen / contract | BE contract | BE | FE | Integrated | Notes |
|---|---|---|---|---|---|
| W0 landing | none | n/a | ⬜ | n/a | no BE dep — FE can build now |
| W0 auth restyle | existing `Auth.*` | ✅ | ⬜ | — | presentational |
| W0 candidate profile | existing `Profile.*` | ✅ | ⬜ | — | |
| W0 candidate dashboard | existing `Application/Recommendation` | ✅ | ⬜ | — | |
| W1 marketplace search | `DiscoveryService.SearchJobs` + `/public/jobs` | ✅ | ⬜ | ⬜ | **landed** — `pnpm gen` has `api.discovery.searchJobs`; public `GET /public/jobs` (snake_case). FE: flip off mock |
| W1 job detail | extend `GetPublicJobDetail` | ✅ | ⬜ | ⬜ | **landed** — `pnpm gen` grew `PublicJob` (+ `Company`); public `GET /public/jobs/{id}` (snake_case, max-age=120). FE: flip job-detail off mock |
| W1 company profile | `CompanyProfileService` | ✅ | ⬜ | ⬜ | **landed with REAL trust** (transition-log shipped). `GetCompanyProfile` + public `GET /public/companies/{id}` + `/{id}/jobs`. FE: flip `/companies/[id]` off mock |
| W1 saved jobs | `SavedJobsService` | ✅ | ⬜ | ⬜ | **landed** — `pnpm gen` has `api.savedJobs` (save/unsave/listSavedJobs). FE: flip `/saved` off mock |
| W1 talent sourcing | `SourcingService.SearchCandidates` | ✅ | ⬜ | ⬜ | **landed** — `pnpm gen` has `sourcing_pb.ts`. FE: add `sourcing` quad + flip `candidate-search` off mock |
| W1 job alerts | `JobAlertsService` | ✅ | ⬜ | ⬜ | **landed** (create/list/delete; cap 20; sweep deferred to NotificationService). `pnpm gen` has `job_alerts_pb.ts`. FE: add `jobAlerts` quad + flip `/alerts` off mock |
| W1 post-a-job | extend `Job` + `UpdateJob` + `gate_mode` | ✅ | ✅ | ⬜ | **landed** — `pnpm gen` has marketplace fields + `api.jobs.updateJob`; SearchJobs facets now populate. FE: flip post-a-job + `/jobs/[id]` off mock |
| W2 proctored interview | proctoring auto-gate + rtc (video) | 🟦 | ✅ | ⬜ | **auto-gate ✅ landed** (`ProctorAccepted.terminated`/`reason`); rtc video still on fake seams (Plan H) |
| W2 candidate report | `Report.GetIntegrityTimeline` | ✅ | ⬜ | ⬜ | **A1 landed** — `api.reports.getIntegrityTimeline` (score/flags/auto_terminated). A2 report enrichment (competencies/evidence) = ai-agents follow-on. FE: flip integrity band off mock |

*(Waves 3–5: messaging, notifications, settings/2FA, team, practice, scheduling — rows added as we reach them.)*

## 🌙 Tonight's autonomous run (2026-06-20 night)
User asleep; FE + BE sessions complete as much of v2 as possible **via the repo** (no live messaging — sends
need approval the user can't give overnight). **FE** (this session) builds screens vs mocks in `frontend/`,
per-step commits; **BE** ("Project handoff") builds contracts in `src/` + proto + `pnpm gen`. Both: claim a
row (🔨) → mark ✅ on landing → append to the log. Explicit-path commits on `grpc-migration`; FE never blocks
on BE (mocks). BE order: W1 (SearchJobs → CompanyProfile → SavedJobs → JobAlerts → Job-extend → Sourcing →
Analytics KPIs) then W2+. FE order: W0 (landing/auth/profile/dashboard) then W1 screens.

## Handoff log (append; newest last)
- 2026-06-20 · BE · ✅ **NotificationService LANDED** (gate GREEN). New `admin.notification.v1`
  (recipient-scoped from token): `ListNotifications` (fresh `unread_count`, `unread_only`, page_size≤50),
  `MarkRead` (NOT_FOUND if not theirs; returns fresh count), `MarkAllRead`. `notifications` collection +
  recency/unread/sparse-dedup indexes; `CandidateEraser` cascade. `notify_event()` write helper (idempotent
  via `dedup_key`) is the entry messaging / practice / **the JobAlerts sweep** call. `pnpm gen` emitted
  `notification_pb.ts`. **Deferred:** wiring the funnel `TransitionNotifier` to persist a row (today it
  emails only) — follow-on. **FE:** add the `notifications` quad + flip the bell/feed off mock.
- 2026-06-20 · BE · ✅ **Report.GetIntegrityTimeline LANDED (A1)** (gate GREEN). New RPC on the existing
  ReportService (manager + comp-scoped via the application): the **first reader of proctoring_events**.
  Returns `integrity_score` (weighted sum; severity read from the stored server-stamped field),
  chronological `ProctorFlag[]` ({type,severity,at,meta}), `recording_url` ("" — Tier C presign deferred),
  and `auto_terminated`/`terminated_reason` from the interview doc's `terminated_by_proctor` (Plan A).
  No events → clean zero, **not** 404. New `ProctorEventsRepository` + `interviews.get_by_application`.
  `pnpm gen` grew `report_pb.ts` (`IntegrityTimeline`/`ProctorFlag`). **A2** (report message enrichment —
  competencies/evidence + integrity scalars, touches ai-agents `scoring.py`/`report_writer`) is a separate
  follow-on. **FE:** flip the integrity band off mock to `api.reports.getIntegrityTimeline`.
- 2026-06-20 · BE · ✅ **JobAlertsService LANDED** (gate GREEN). New `admin.job_alerts.v1` (candidate-
  scoped from token): `CreateAlert`/`ListAlerts`/`DeleteAlert` over the `job_alerts` collection (saved
  search = keyword + AlertFilters + frequency). frequency ∈ {daily,weekly} or INVALID_ARGUMENT; per-
  candidate cap 20 → FAILED_PRECONDITION (new `LimitExceededError`); cross-tenant/missing delete →
  NotFound. Indexes `(candidate_user_id, created_at desc)` + `(frequency, last_run_at)` (sweep scan).
  `last_run_at` is sweep-written; **the run-and-notify sweep is deferred** — it lands with
  NotificationService (next: Wave 3 K). `pnpm gen` emitted `job_alerts_pb.ts`. **FE:** add the `jobAlerts`
  quad to `index.ts` + flip `/alerts` off mock.
- 2026-06-20 · BE · ✅ **CompanyProfileService LANDED with REAL trust** (gate GREEN: admin 289). Now that
  the transition-log ships (Plan I), `responds_in_days` is the genuine median(applied→first transition)
  and `actively_reviewing` is real (not the earlier proxy). `admin.company_profile.v1.GetCompanyProfile`
  (unauthenticated) + public REST `GET /public/companies/{id}` (max-age=300) and
  `GET /public/companies/{id}/jobs?page&page_size≤24` (same `JobCardDTO` as `/public/jobs`). 404 for no
  published presence (≥1 published job OR a branding doc). `company_profiles` collection (unique comp_id);
  `about/website/logo/locations` are "" / [] until the branding editor (company-branding Upsert) lands.
  `pnpm gen` emitted `company_profile_pb.ts`. **FE:** flip `/companies/[id]` SSR off the mock to
  `/public/companies/{id}` + `/{id}/jobs`. **Branding Upsert + logo presign = separate (company-branding).**
- 2026-06-20 · BE · ✅ **Application transition-log LANDED** (gate GREEN: admin 283; cross-cutting, no
  proto). The funnel CAS (`set_state_if`/`set_state`) now appends a `{state, at}` entry to
  `Application.transitions`, so per-stage timings are derivable from the application doc itself (no
  audit_logs join). This unblocks **CompanyProfile** `responds_in_days` (median applied→first decision) +
  `actively_reviewing` (real, not proxy) and the Analytics no-ghosting KPIs. No FE/contract change.
- 2026-06-20 · BE · ✅ **SourcingService.SearchCandidates LANDED** (gate GREEN: admin 281). New
  `admin.sourcing.v1` (manager + comp-scoped): keyword search over the company's **own applicants only**
  (seed = its `applications`; universe is application-existence, **never** funnel-filtered, so
  rejected/closed-job applicants stay searchable; no global index). Returns `CandidateHit{candidate_user_id
  (masked on render), application_count, fit_score 0..1, top_stage (furthest reached), matched_skills}` +
  total/page/page_size (page_size≤50). **No ID/background/biometric data.** Profile batch lookup
  (`find_by_user_ids`) avoids N+1. `pnpm gen` emitted `sourcing_pb.ts`. **FE integration pending** (same
  status as discovery/savedJobs): add the `sourcing` quad to `packages/api-client/src/index.ts` +
  flip `candidate-search.tsx` off the mock to `api.sourcing.searchCandidates`.
- 2026-06-20 · FE · Seeded this board. The 24 contracts + spine are pushed (commit `eae5a56`). FE starting
  **Wave 0** (no BE dependency). Proposed first BE pickup once the gRPC migration settles:
  **`DiscoveryService.SearchJobs`** + public `/public/jobs` (job-marketplace pillar).
- 2026-06-20 · BE · gRPC migration (G1–G6) DONE + FF-merged to `main` (`b4e8fa0`); BE gate GREEN. Picking up
  **`DiscoveryService.SearchJobs`**. Ownership ask: BE owns all `.proto` + `src/gen/*`; FE owns app code.
- 2026-06-20 · FE · **Agreed** on the ownership split (BE → `.proto` + `frontend/packages/api-client/src/gen/*`;
  FE → app/component code + screen docs). **Branch decision (user): the team stays on `grpc-migration`** — both
  commit here, merge to `main` at milestones. BE: please commit SearchJobs on `grpc-migration`, not `main`.
  `grpc-migration` = `main` (`b4e8fa0`) + this board commit. Migration's FE plumbing confirmed in my tree
  (gen has both proto sets, REST modules gone). FE starting **Wave 0 landing** now.
- 2026-06-20 · BE · 🔨 **SearchJobs**: building `admin.discovery.v1` proto + `resources/discovery.py`
  (`$text`+`$facet` over published jobs) + `DiscoveryServicer` + public `/public/jobs` (no-auth, rate-limited,
  page_size≤24). DESIGN NOTE for the later **extend-Job** step: SearchJobs reads `remote_mode`/
  `employment_type`/`salary_*`/`skills` via `$ifNull`, so they return null/empty facets **until** extend-Job
  adds + populates those Job fields — no SearchJobs change needed then. `posted_at`←`created_at` for now.
  DTO scrubbed of `comp_id`-internals/`aptitude_config`/`required_topics`/drafts; `company_id`=comp_id,
  `company_name` via batch companies lookup. Holding pushes (user asleep).
- 2026-06-20 · BE · ✅ **SearchJobs LANDED** (gate GREEN: admin 244). `admin.discovery.v1.DiscoveryService.SearchJobs`
  (authed) + public `GET /public/jobs?q&location&remote&type&level&skills&sort&page&page_size` (no-auth,
  per-IP rate-limited, page_size≤24, `Cache-Control: public, max-age=60`). **FE integration:** `pnpm gen` now
  exposes `useAuth().api.discovery.searchJobs({...})` (gRPC, camelCase fields per protobuf-es) AND the public
  REST returns **snake_case** JSON `{jobs:[{job_id,title,company_name,company_id,location,remote_mode,
  employment_type,salary_min,salary_max,salary_currency,skills,posted_at,snippet}],facets:{remote_mode,
  employment_type,experience_level},total,page,page_size}` — flip `marketplace-search` off `NEXT_PUBLIC_MOCK`.
  Reminder: remote/employment/salary/skills are empty until the extend-Job step populates them. Also bumped
  venv msgpack→1.2.1 + pydantic-settings→2.14.2 (new CVEs; pip-audit clean).
- 2026-06-20 · BE · ⚠️ **CompanyProfile FINDING + reorder.** Its `TrustSignals.responds_in_days` (median
  applied→first-decision) needs per-application **state-transition timings**, but the `Application` model has
  only `state` + `created_at` — no transition history. The contract already degrades `responds_in_days=0` →
  FE hides the chip, so CompanyProfile is still shippable as: `open_jobs` (real published count),
  `actively_reviewing` (proxy: ≥1 app past `applied`), `responds_in_days=0`. Real responsiveness needs the
  funnel to record transitions first — ties to the **W1 Analytics no-ghosting KPIs** (recommend doing that,
  or an Application transition-log, before/with CompanyProfile). **Reordered:** building **SavedJobsService**
  next (clean, FE already built `/saved`), then CompanyProfile with the proxy trust. (user asleep → noting here.)
- 2026-06-20 · BE · 🔨 **SavedJobsService**: `admin.saved_jobs.v1` (SaveJob/UnsaveJob/ListSavedJobs), candidate-
  scoped from the token; `saved_jobs` collection unique `(candidate_user_id, job_id)`; ListSavedJobs reuses the
  discovery JobCardDTO projection (published-only) + `saved_at`. Save of a non-published/missing job → NotFound.
- 2026-06-20 · BE · ✅ **SavedJobsService LANDED** (gate GREEN: admin 252). `pnpm gen` exposes
  `useAuth().api.savedJobs.{saveJob,unsaveJob,listSavedJobs}` — FE: flip `/saved` + `SaveJobButton` off the mock.
  (Refactor: discovery's `_job_card`/`_iso` → public `job_card`/`iso`, the shared marketplace projection.)
- 2026-06-20 · BE · ⏸️ **CHECKPOINT — tonight's BE: gRPC migration (G1–G6, pushed `b4e8fa0`) + SearchJobs (✅) +
  SavedJobs (✅)**, all gate GREEN (admin 252 / ai-agents 258 / lib 92 / mcp 41+42), committed on `grpc-migration`,
  **NOT pushed** (user asleep; push at a milestone after review). **Next BE pickup = extend-Job** (post-a-job),
  pre-analyzed below so it's a fast, careful pickup with fresh context (it's a WIDE change to the existing
  JobService — touches its tests, so do it deliberately):
  • `model/job.py`: add optional `city/region/country/remote_mode/employment_type/salary_min/salary_max/
  salary_currency(str)/skills(list)/posted_at(datetime|None)`; `AptitudeConfig` gains `gate_mode="auto"`.
  • `job.proto`: extend `CreateJobRequest` (fields 3–12 per the contract) + new `UpdateJobRequest` + widen
  `JobResponse` (fields 5–15). `rpc UpdateJob`. (No new service → no api-client quad; `pnpm gen` widens `job_pb.ts`.)
  • `resources/job.py`: create/update validate enums (remote_mode∈remote|hybrid|onsite, employment_type∈
  full_time|contract|internship, gate_mode∈auto|advisory default auto), `salary_min≤salary_max`, lowercase+dedup
  skills, ""→None, off-enum→INVALID_ARGUMENT; `update_job` manager+comp-scoped (comp_id from token, 404 cross-tenant);
  `publish_job` stamps `posted_at=now`. • `job.py` servicer: add UpdateJob, thread fields, GetJob echoes them.
  • `db.py`: indexes `(status,posted_at)`, `(status,remote_mode,employment_type)`, `(status,city)`.
  • Then update SearchJobs sort to `posted_at` (fallback created_at) + the FE `JobCard` facets go live.
  • UPDATE the existing `test_resources_job` + `test_job_grpc` for the new fields/UpdateJob. `posted_at` backfill
  for legacy published jobs = deferred (search already falls back to created_at). After: `bash scripts/check.sh`
  + `pnpm gen`, mark board. Then CompanyProfile (proxy trust per the finding above) → JobAlerts.
- 2026-06-20 night · FE · ✅ **17 screens shipped** (all typecheck+build GREEN, committed on `grpc-migration`,
  NOT pushed): landing · candidate-dashboard · recruiter-dashboard · candidate-profile · saved-jobs ·
  job-alerts · post-a-job · company-branding · talent-sourcing · **marketplace-search (✅ wired to the REAL
  `/public/jobs`)** · job-detail · company-profile · candidate-report (+ proctoring integrity band) ·
  applicants-pipeline · proctored-interview (uses real `api.interview.recordProctorEvents`/`rtcToken`; LiveKit +
  MediaPipe detectors are **fake/stubbed seams** — no new deps, real wiring deferred) · coding-assessment
  (MCQ byte-identical) · team-permissions. Every not-yet-real contract is behind `NEXT_PUBLIC_MOCK` → flipping
  to real is a 1-line client swap. **Ready to integrate now that they landed:** `/saved` + `SaveJobButton` →
  `api.savedJobs.*`. Remaining FE: auth restyle · practice-feedback · onboarding · settings-security ·
  messaging · notifications · scheduling (cross-app — serializing). FE NOTE for the BE `ProctorAccepted`
  delta: the room already reads `terminated`/`reason` defensively, so HIGH-severity auto-gate engages the
  moment that proto field + ai-agents terminate logic land.
- 2026-06-20 night · FE · ✅✅ **ALL 24 SCREENS COMPLETE.** Both apps typecheck + production-build GREEN;
  `@ip/{ui,shared,api-client}` typecheck GREEN. **27 FE feat commits** on `grpc-migration` (NOT pushed —
  milestone push awaits user review). Added since the 17-screen mark: **auth** (split-layout restyle, both
  apps), **practice + /feedback** (detached growth), **onboarding** (candidate checklist + employer
  first-run), **settings** (2FA/sessions/prefs, both apps; `/account`→`/settings?tab=privacy`), **scheduling**
  (candidate pick-a-slot + company propose-slots tab), **messaging** (inbox + per-app conversation + applicant
  Messages tab), **notifications** (bell in both shells + feed). Candidate = 24 routes, Company = 20 routes.
  **INTEGRATION TODO** (mock→real ≈1-line client swap after each BE contract + `pnpm gen`): SearchJobs ✅ real;
  SavedJobs ✅ ready to flip (`api.savedJobs.*`); pending — GetPublicJobDetail · CompanyProfile · JobAlerts ·
  extend-Job (post-a-job + marketplace facets) · Sourcing · Report.GetIntegrityTimeline · Messaging ·
  Notification · Settings · Team · Scheduling · ai-agents practice/* · proctoring auto-gate
  (`ProctorAccepted.terminated`). **Deferred deps (need a lockfile touch when the user's awake):**
  livekit-client + MediaPipe (proctored room runs on fake seams today), a code-editor lib (textarea fallback),
  a test runner (no vitest in repo — used zero-dep `tsx` harnesses). FE build done for the night. 🌙
- 2026-06-21 · 🔴 **FE→BE REQUEST (high priority): `ProctorAccepted` auto-gate delta** (user-routed to BE —
  it's your lane: proto + `proctoring.py` + `pnpm gen`. The FE side is DONE + wired defensively, so this is
  the ONLY thing blocking the proctored-interview HIGH-severity auto-gate from working live). Spec, per
  `docs/superpowers/plans/v2-screens/proctored-interview.md` §A.2:
  1. **Proto:** add `bool terminated = 2;` + `string reason = 3;` to the `ProctorAccepted` message in the
     interview `.proto` that generates `aiagents.interview.v1` (in `src/ai-agents`; mirror at
     `src/admin/app/routes/pb` if applicable). It currently carries only `accepted`.
  2. **`src/ai-agents/app/resources/proctoring.py` (`record_proctoring_events`):** when an ingested batch
     contains a HIGH-severity event (server-assigned via `severity_of`; `_SEVERITY` HIGH in
     `model/proctoring.py` = second_face, second_voice, phone_detected, screen_share, virtual_camera,
     synthetic_audio_suspected) → **terminate the live session** (set `terminated_by_proctor` + reason, route
     through the interview finalize path) + return `terminated=true` with the triggering event type as
     `reason`. MED/LOW → `terminated=false` (recorded only). Severity stays **server-authoritative** — the
     input DTO has no severity field, so a client-sent severity is ignored.
  3. **`pnpm gen`** in `frontend/` so `interview_pb.ts` gains the fields. (FE then reads them natively; FE will
     drop its defensive `as unknown as ProctorAck` cast as a 1-line cleanup after.)
  4. **ai-agents tests:** HIGH → session `terminated_by_proctor` set + `terminated=true`; MED/LOW →
     `terminated=false`; client-sent severity ignored.
  FE wiring already in place: `ProctorAck` in `frontend/apps/candidate/app/interview/[applicationId]/types.ts`
  + the `sink` callback in `page.tsx` read `terminated`/`reason` via a defensive cast → engages the moment
  this lands. No FE change needed.
- 2026-06-20 · BE · ✅ **GetPublicJobDetail LANDED** (gate GREEN: admin 272). The public job-detail
  surface ships two ways onto one resource (`discovery.get_public_job_detail`, single source of truth with
  search_jobs): (1) gRPC `JobService.GetPublicJob` now returns the **full** `PublicJob` (marketplace fields
  4–11 + a `Company{id,name,logo}` at 12) instead of just title/JD; (2) **public REST `GET /public/jobs/{id}`**
  (no-auth, per-IP rate-limited, snake_case, `Cache-Control: public, max-age=120`) returning the same DTO,
  `404 {"error":"not_found"}` for missing/unpublished (opaque). DTO scrubbed of comp_id/aptitude_config/
  required_topics/gate_mode; comp_id surfaces only as `company.id`; `logo` is "" until branding (Plan D /
  company_profiles) lands. `pnpm gen` done → `job_pb.ts` grew `PublicJob`+`Company`. **FE:** flip job-detail
  SSR off `NEXT_PUBLIC_MOCK` to `/public/jobs/{id}` (and authed deep-links get the same shape via
  `api.jobs.getPublicJob`).
- 2026-06-20 · BE · ✅ **extend-Job LANDED** (gate GREEN: admin 266). `JobService` now carries the full
  marketplace contract: `CreateJob`/`JobResponse` gain `city/region/country/remote_mode/employment_type/
  salary_min/salary_max/salary_currency/skills/gate_mode/posted_at` (additive field numbers 5–15) + a new
  **`UpdateJob`** RPC (manager + comp-scoped; cross-tenant → NotFound). Boundary validation: remote_mode∈
  {remote,hybrid,onsite}, employment_type∈{full_time,contract,internship}, gate_mode∈{auto,advisory}
  (default **auto** — proctored platform), salary_min≤salary_max, skills lowercased+de-duped; off-enum →
  INVALID_ARGUMENT. `gate_mode` persists on `aptitude_config.gate_mode` (ties to the ProctorAccepted
  auto-gate). `publish_job` stamps `posted_at=now` at the draft→published flip; SearchJobs recency sort
  now uses `posted_at` (fallback created_at) and **marketplace facets/fields go live** (no SearchJobs
  code change needed — it already read them via `$ifNull`/`.get`). New indexes: `(status,posted_at)`,
  `(status,remote_mode,employment_type)`, `(status,city)`. `pnpm gen` done → `job_pb.ts` has the fields +
  `api.jobs.updateJob`. **FE:** flip post-a-job to the real `createJob`/`updateJob`; `/jobs/[id]` edit can
  mount `JobForm`. **Deferred:** `posted_at` backfill for legacy published jobs (search falls back to
  created_at, so non-blocking).
- 2026-06-20 · BE · ✅ **ProctorAccepted auto-gate LANDED** (gate GREEN; ai-agents +5 tests). A server-
  classified HIGH-severity proctor event (`second_face`/`second_voice`/`phone_detected`/`screen_share`/
  `virtual_camera`/`synthetic_audio_suspected`) now auto-terminates the live interview:
  `record_proctoring_events` → `terminate_for_proctor` (persists `terminated_by_proctor`, emits a distinct
  `interview.proctor_terminated` event, flips session `status=terminated`), and `RecordProctorEvents`
  returns `terminated=true` + `reason=<event type>`. MED/LOW recorded only. Severity stays server-
  authoritative (input DTO has no severity field). `pnpm gen` done → `interview_pb.ts` carries
  `terminated`/`reason`. **FE:** the HIGH-severity auto-gate is now live; you can drop the defensive
  `as unknown as ProctorAck` cast (1-line cleanup). **Branch note:** committed on `main` (grpc-migration
  already merged via PR #1 `cd140f6`); pushing after the full gate is green (user-approved).
