# Onboarding & First-Run (Part A core #6) — Design

> **Context.** Closes **Part A "core" #6** of `docs/superpowers/v2/2026-06-19-v2-completeness-audit.md`
> ("Onboarding / first-run — candidate … and employer … guided flows + empty states") and fills the
> empty states the screens build plan flagged (`docs/superpowers/v2/2026-06-19-screens-frontend-build-plan.md`).
> It implements the architecture overview's intent that v2 "get new users to value fast" — the
> *first session* layer on top of the nine pillars (`docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md`).
> This module is **mostly frontend** (flows + empty states) with a **thin backend flag**: a per-user /
> per-company `onboarding` progress doc that is **dismissible, resumable, idempotent, and never gates
> real usage**. Personal project, **LOCAL-ONLY — never run git/gh.** No production code yet; this is
> the design awaiting review.

## 1. Goal & scope

**The problem.** Every pillar plan builds a screen for a user who already has data — applications to
track, applicants to rank, jobs in the marketplace. The screens build plan even names the holes:
"no-applications / no-saved-jobs" (candidate), "no-jobs / no-applicants" (employer). But nothing owns
the **first session** — the moment a brand-new candidate or company lands with an empty account and
must be walked to first value (a complete profile + a found job; a first posted job + a first
applicant). Without this, the demo's "empty" screens read as broken, and a real new user bounces.

**In scope — get new users to value fast, and fill the flagged empty states:**

- **Candidate first-run** — a **profile-completeness checklist** (résumé → review → preferences), a
  **"here's how to find jobs"** card pointing at the marketplace, and a **"try a practice interview"**
  teaser linking to Candidate Growth (`/practice`). Plus the **empty states** for no-applications and
  no-saved-jobs on the candidate dashboard.
- **Employer first-run** — a **post-your-first-job wizard** (reuses the extended `JobForm` + the
  existing JD-assist client), an **invite-your-team** step, a **set-the-gate-mode-default** step
  (advisory recommended) paired with a **consent / candidate-notification default**, and an **optional
  branding setup** step (links to the existing `company_profiles` editor). Plus the **empty states**
  for no-jobs and no-applicants.
- **A lightweight onboarding state** — one small, **dismissible + resumable** progress record per user
  and per company, plus the FE-driven step components. Simplest thing that fits (see §3, §6): a
  flag-plus-progress doc the frontend reads once and updates as steps complete.
- **The empty / loading / error states** for the key first-run screens, tied to `@ip/ui`'s state kit
  (`EmptyState` / `LoadingState` / `ErrorState`) and the brand standard's "every state designed" bar
  (`docs/brand/aptura-ui-ux.md`).

**Robustness invariants (non-negotiable, §4.5):** onboarding is **skippable** (a persistent "Skip /
Dismiss" everywhere), **non-blocking** (it never sits in front of a real action — the marketplace,
the dashboard, posting a job all work whether or not onboarding is touched), **idempotent** (completing
a step twice, or re-running it, is a no-op), and it **never gates real usage** (no feature is locked
behind "finish onboarding"). It is *guidance*, not a *gate*.

**Out of scope (deferred / explicitly cut):**

- **No new pillar features.** Onboarding **reuses** existing flows (résumé parse, `JobForm`, JD assist,
  team invite, `gate_mode`, `company_profiles`, `/practice`) — it orchestrates them into a first-run
  sequence; it builds none of them. Where a step's underlying feature is owned by another pillar, this
  doc **links** to it and never reimplements it.
- **No compliance-triggering features.** No ID/identity verification, no background checks, no biometric
  proctoring tour — squarely on the architecture overview's permanent cut list (§2). Onboarding only
  surfaces the *existing* consent posture (the `automated_evaluation` consent already in the ledger)
  and the advisory-gate recommendation; it introduces no new regulated surface.
- **No product tour / coach-marks engine, no gamification, no email drip.** A first-run checklist +
  wizard, not a tooltip framework. A welcome email is a notifications-center follow-up (it already
  owns the email seam); onboarding does not add an email channel.
- **No new template engine.** The employer "consent / notification template" step sets a **default
  string** (the company's candidate-notification copy + consent posture), reusing the notifications
  center's existing static `_MESSAGES` seam — a full templating engine is explicitly a follow-up there
  (`2026-06-19-notifications-center-design.md` §"out of scope"), so onboarding stays a thin default-setter.
- **No analytics dashboard for onboarding funnels.** Step completion is recorded on the doc (so the
  FE can resume), but a "how many users finished onboarding" analytics surface is a later add.

## 2. Where it fits (a first-run layer over the pillars; the funnel is untouched)

Onboarding is a **read-mostly orchestration layer**. It owns exactly one tiny piece of new state — the
`onboarding` progress doc — and otherwise **composes** flows the pillars already built. Critically, it
sits **off the funnel**: a candidate's profile/saved-jobs and a company's first job all flow through
the *existing* contracts (résumé parse, `api.applications.apply`, `createJob`), so onboarding adds
**no funnel event, no new `ApplicationState`, no CAS surface**. It is the same architectural posture as
Candidate Growth's practice mode — a feature that deliberately stays off the audited funnel seam.

```
   NEW candidate                                   NEW company (first recruiter)
   ───────────                                     ─────────────────────────────
   /  (dashboard)                                  /  (recruiter dashboard)
     │                                               │
     ▼  empty account?                               ▼  no jobs yet?
   ┌───────────────────────────┐                   ┌─────────────────────────────────┐
   │ CandidateOnboardingCard    │                   │ EmployerOnboardingWizard         │
   │ (checklist + 3 nudges)     │                   │ (post-first-job · invite · gate  │
   │ • Résumé → review → prefs  │                   │  · consent default · branding?)  │
   │ • "Find jobs" → /jobs      │                   │  reuses <JobForm> + JD assist,   │
   │ • "Try practice" → /practice│                  │  InviteRecruiter, gate_mode,     │
   └───────────┬───────────────┘                   │  company_profiles editor         │
               │  step done → PATCH progress         └───────────┬─────────────────────┘
               ▼                                                 │  step done → PATCH progress
   ┌───────────────────────────────────────────────────────────▼─────────────────┐
   │  OnboardingService (admin) — read/update ONE progress doc                     │
   │   • candidate: keyed by user_id   • company: keyed by comp_id                 │
   │   • {steps:{id:done}, dismissed, completed_at}  — idempotent set-step         │
   │   • NEVER gates: every pillar flow works regardless of this doc               │
   └──────────────────────────────────────────────────────────────────────────────┘
        (no RabbitMQ event · no funnel state · no comp_id leak across tenants)
```

This is a **targeted addition to Module 1 (Identity & Access)** and the two Next apps from the
architecture overview's module map — not a new service and not a new event plane. The backend touch is
one small collection + a thin gRPC service on admin (the existing transport); everything else is
frontend composition of existing clients.

| Pillar flow onboarding reuses | Owned by | Onboarding's job |
|---|---|---|
| Résumé upload → parse → review/edit + completeness meter | Candidate Profile (built) + screens §C | Surface it as checklist step 1; read the parse result's completeness |
| Marketplace search/browse | Pillar A (`job-marketplace`) | A "find jobs" nudge linking to `/jobs`; never reimplements search |
| Practice interview | Pillar D Candidate Growth (`/practice`) | A "try a practice interview" teaser linking to `/practice` |
| Extended job create form (`JobForm`) + JD assist | Pillar A TIER 5 + screens #12 | The wizard's "post your first job" step renders `<JobForm>` + the JD-assist panel |
| Team invite (`InviteRecruiter`) | Identity & Access (built) + Part A #2 (team depth) | The wizard's "invite your team" step calls the existing invite |
| `gate_mode` default (advisory recommended) | Inc 0 compliance gate (`AptitudeConfig.gate_mode`) | The wizard's "set your default" step — the **first UI** for this field |
| Candidate-notification default + consent posture | Notifications center (`_MESSAGES` static) + Trust/consent ledger | The wizard sets a default string + confirms the advisory/consent posture |
| Company branding (`company_profiles` editor, `/branding`) | Pillar A TIER 5 | An **optional** wizard step linking to the existing editor |

## 3. Architecture (components + boundaries)

Two layers: a **thin backend** (one collection + one gRPC service + the eraser entry) and the
**frontend first-run UI** (the candidate card, the employer wizard, the flagged empty states). The
backend is deliberately minimal — its only authority is "remember which steps a user/company finished
so the FE can resume and not re-nag."

```
Candidate app (/)        Company app (/, /onboarding)
  │  gRPC-web (authed)      │  gRPC-web (authed)
  ▼                         ▼
┌──────────────────────────────────────────────────────────────┐
│ admin — OnboardingService (NEW, gRPC-web; existing transport) │
│   GetOnboarding(scope)        → OnboardingProgress             │
│   CompleteStep(scope, step)   → OnboardingProgress (idempotent)│
│   DismissOnboarding(scope)    → OnboardingProgress             │
│   scope = {kind: candidate|company}  (subject from the JWT,    │
│            NEVER a client-supplied user_id/comp_id)            │
└───────────────┬───────────────────────────────┬──────────────┘
                ▼                                 ▼
   resources/onboarding.py (NEW)          model/onboarding.py (NEW)
   get / complete_step / dismiss          OnboardingProgress, OnboardingStep
   (validate step ∈ the scope's set;      (the canonical step lists live here)
    idempotent upsert; default-construct
    a fresh "all steps pending" doc)
                │
                ▼
   infra/repositories/onboarding.py (NEW)
   onboarding collection:
     • _id = ("candidate", user_id)  OR  ("company", comp_id)
     • {steps:{...}, dismissed:bool, completed_at, updated_at}
     • upsert; per-tenant by construction (comp doc carries comp_id)
                │
                ▼
            MongoDB (admin owns it — single source of truth)
```

**Components (one job each):**

1. **`model/onboarding.py`** (NEW, admin) — the progress models + the **canonical step enums**. The
   step lists are data here (not scattered across the FE) so the backend can validate a `CompleteStep`
   against the scope's allowed steps and the FE can render them in order. See §4.1.

2. **`resources/onboarding.py`** (NEW, admin) — three operations, all idempotent:
   - `get_onboarding(scope)` — load the doc; **if absent, construct a fresh one** (all steps pending,
     `dismissed=False`) without writing — a read never mutates. Returns the progress.
   - `complete_step(scope, step)` — validate `step` is in the scope's step set (`ValidationError`
     else, the one boundary check); **upsert** `steps[step]=True` + recompute `completed_at` (set when
     every required step is done). Completing an already-done step is a no-op upsert (idempotent).
   - `dismiss_onboarding(scope)` — set `dismissed=True`. Re-dismissing is a no-op. (No "un-dismiss"
     RPC needed for v1 — the doc persists, and a future "restart onboarding" is a trivial follow-up.)
   - **Tenant/identity safety:** `scope.kind` decides candidate-vs-company; the **subject id comes from
     the authenticated JWT** (`user_id` for candidate, `comp_id` for company — resolved server-side via
     the existing auth context), **never from the client**. A recruiter can only touch *their company's*
     doc; a candidate only *their own*. This mirrors the marketplace's per-tenant scoping discipline.

3. **`infra/repositories/onboarding.py`** (NEW, admin) — the `onboarding` collection repo:
   `get(scope)` / `upsert_step(scope, step, value)` / `set_dismissed(scope, value)` /
   `delete_by_user(user_id)` (erasure). Keyed by the `(kind, subject_id)` compound so a candidate and a
   company can never collide and a query always carries its scope. Declared once in the index authority
   (§4.4).

4. **Frontend — candidate** (`apps/candidate`): a `useOnboarding()` query hook + a
   `CandidateOnboardingCard` (the checklist + the three nudges) on the dashboard, plus the
   no-applications / no-saved-jobs `EmptyState`s. Reuses the existing profile/marketplace/practice
   routes — it links, it does not rebuild.

5. **Frontend — company** (`apps/company`): a `/onboarding` wizard route (`EmployerOnboardingWizard`)
   stepping through post-first-job → invite → gate-default → consent-default → (optional) branding,
   plus the no-jobs / no-applicants `EmptyState`s. The job step embeds the **existing** `<JobForm>` +
   JD-assist panel; the gate step is the first UI for `AptitudeConfig.gate_mode`.

6. **Shared client** (`@ip/shared`): a `makeOnboardingClient(adminUrl, store)` mirroring the existing
   gRPC-web client wiring (`authedFetch`, silent token refresh) — `get()` / `completeStep(step)` /
   `dismiss()`. One client, both apps (each wires it with its own token store).

## 4. Design detail

### 4.1 Onboarding models (`model/onboarding.py`, NEW)

Two scopes, two step sets, one progress shape. The step ids are **stable string enums** (the FE keys
its checklist off them; the backend validates against them).

```python
class OnboardingStep(StrEnum):
    # candidate
    UPLOAD_RESUME       = "upload_resume"        # résumé → parse
    REVIEW_PROFILE      = "review_profile"       # confirm/edit the parsed profile
    SET_PREFERENCES     = "set_preferences"      # role/location/remote preferences
    EXPLORE_JOBS        = "explore_jobs"         # visited the marketplace (the "find jobs" nudge)
    TRY_PRACTICE        = "try_practice"          # ran a practice interview (the Growth teaser)
    # company
    POST_FIRST_JOB      = "post_first_job"       # published the first job (reuses JobForm)
    INVITE_TEAM         = "invite_team"          # invited at least one teammate (reuses InviteRecruiter)
    SET_GATE_DEFAULT    = "set_gate_default"     # chose the default gate_mode (advisory recommended)
    SET_CONSENT_DEFAULT = "set_consent_default"  # confirmed the candidate-notification + consent default
    SETUP_BRANDING      = "setup_branding"        # OPTIONAL — company_profiles editor

CANDIDATE_STEPS = (UPLOAD_RESUME, REVIEW_PROFILE, SET_PREFERENCES, EXPLORE_JOBS, TRY_PRACTICE)
COMPANY_STEPS   = (POST_FIRST_JOB, INVITE_TEAM, SET_GATE_DEFAULT, SET_CONSENT_DEFAULT, SETUP_BRANDING)

# "Required for completion" excludes the deliberately-optional ones, so the checklist can hit 100%
# without forcing a skippable step. completed_at is set only when every REQUIRED step is done.
CANDIDATE_REQUIRED = (UPLOAD_RESUME, REVIEW_PROFILE, SET_PREFERENCES)   # nudges (explore/practice) are optional
COMPANY_REQUIRED   = (POST_FIRST_JOB, SET_GATE_DEFAULT, SET_CONSENT_DEFAULT)  # invite + branding optional

class OnboardingScope(BaseModel):
    kind: Literal["candidate", "company"]
    subject_id: str = ""            # user_id OR comp_id — set SERVER-SIDE from the JWT, never the client

class OnboardingProgress(BaseModel):
    kind: Literal["candidate", "company"] = "candidate"
    steps: dict[str, bool] = Field(default_factory=dict)   # {step_id: done}; absent == not done
    dismissed: bool = False
    completed_at: str = ""          # ISO; set when all REQUIRED steps done (else "")
    updated_at: str = ""
```

> **Why "required" vs "optional" steps.** The three robustness invariants demand a checklist that can
> reach 100% **without** forcing a skippable action. `EXPLORE_JOBS` / `TRY_PRACTICE` (candidate) and
> `INVITE_TEAM` / `SETUP_BRANDING` (company) are **nudges** — they nudge toward value but are not
> required for `completed_at`. This is what makes the flow genuinely non-blocking: a candidate who only
> wants to complete their profile is "done"; a solo recruiter who won't invite a team is "done". The
> optional steps still render (as dismissible nudges) so the value path is visible.

### 4.2 The candidate first-run (checklist + 3 nudges)

`CandidateOnboardingCard` renders on the dashboard **above** the application tracker when the account
is new (`!progress.dismissed && progress.completed_at == ""`). It is a `Card` with:

1. **A profile-completeness checklist** — three rows wired to the **existing** profile flow:
   - *Upload your résumé* → routes to `/profile` (the existing résumé-upload + parse). Marked done when
     the parsed profile exists (the FE reads the existing profile/parse result, then calls
     `completeStep(UPLOAD_RESUME)`).
   - *Review your details* → the existing parsed-profile review/edit (screens §C `ParsedBanner`).
     `completeStep(REVIEW_PROFILE)` on save.
   - *Set your preferences* → role/location/remote prefs (the candidate's existing profile prefs).
     `completeStep(SET_PREFERENCES)` on save.
   - A thin `Progress` bar (0–100) over `CANDIDATE_REQUIRED` is the card's **one focal point** (violet,
     per the brand standard's "one focal point / the violet metric").
2. **"Here's how to find jobs"** — a nudge card with a one-line explainer ("Search and browse open
   roles — your match score is on every card") and a primary `Button` → `/jobs`. Visiting marks
   `EXPLORE_JOBS` (optional). This is the bridge from an empty account to the marketplace.
3. **"Try a practice interview"** — a teaser ("Practice a real AI interview, just for you — never shared
   with any employer") + `Button` → `/practice` (Candidate Growth). Running one marks `TRY_PRACTICE`
   (optional). The copy reuses Candidate Growth's "private / detached" framing verbatim so the trust
   cue is consistent.

Each row has its own state; the whole card has a persistent **"Dismiss"** (`dismiss_onboarding`) and
collapses once `completed_at` is set (replaced by a small "You're all set" confirmation that itself is
dismissible). **The card never blocks the dashboard** — the application tracker and everything else
render whether the card is present, dismissed, or complete.

### 4.3 The employer first-run (post-first-job wizard)

`EmployerOnboardingWizard` is a `/onboarding` route the new recruiter is **invited to** (a prominent
"Finish setting up" card on the empty recruiter dashboard) but is **never forced into** — `/jobs`,
`/talent`, `/analytics` all work immediately. It is a stepper (reuses `@ip/ui` patterns) over:

1. **Post your first job** *(required)* — embeds the **existing extended `<JobForm>`** (Pillar A TIER 5)
   plus the **existing JD-assist client** (the `jd.ts` / `AiSuggestPanel` surface from screens #12).
   On a successful `createJob`, mark `POST_FIRST_JOB`. This is the single highest-value step — a company
   with a posted job has a reason to come back. The form is the *same component* the standalone
   `/jobs/new` uses; the wizard just frames it as step 1 (no duplicate form logic).
2. **Invite your team** *(optional)* — reuses the **existing `InviteRecruiter`** (email + temp password;
   Part A #2 deepens it later). Invite ≥1 teammate → mark `INVITE_TEAM`; "Skip for now" advances without
   marking. A solo recruiter is never stuck here.
3. **Set your gate-mode default** *(required)* — the **first UI** for `AptitudeConfig.gate_mode`
   (`auto | advisory`). Presents the choice with the architecture overview's recommendation baked into
   the copy: **advisory is pre-selected and labeled "Recommended"** ("AI recommends, you decide — no
   candidate is ever auto-rejected"; `auto` is offered as "Auto-advance on pass" with a plain-language
   note). The chosen value is stored as the **company's default** for new jobs (a small
   `company_defaults.gate_mode`, read by `JobForm` to pre-fill new jobs); mark `SET_GATE_DEFAULT`.
   This directly satisfies the audit's "set the gate mode default (advisory recommended)".
4. **Set your candidate-notification default + consent posture** *(required)* — a thin step that sets a
   **default candidate-notification message** (reusing the notifications center's existing static
   `_MESSAGES` seam — a single editable default string, **not** a template engine) and **confirms the
   consent posture** (the existing `automated_evaluation` consent the apply flow already records). Copy:
   "Candidates always hear back — here's your default update message." Mark `SET_CONSENT_DEFAULT`. This
   is the audit's "consent/notification template," scoped to the *existing* seams (no new regulated
   surface, no template engine — both are explicit follow-ups, §1).
5. **Optional branding setup** *(optional)* — links to the **existing `company_profiles` editor**
   (`/branding`, Pillar A TIER 5): logo, display name, "actively reviewing" badge. "Add later" skips.
   Mark `SETUP_BRANDING` on save.

A persistent **"Skip / Finish later"** exits the wizard to the dashboard at any step (progress is
saved step-by-step, so re-entering resumes exactly where they left off — §4.5). When
`COMPANY_REQUIRED` is all done, the wizard shows a "You're set up" summary with links to the ranked-
applicants and analytics surfaces, and the dashboard's "Finish setting up" card disappears.

### 4.4 Persistence, idempotency, indexes

- **One collection, `onboarding`**, keyed by the compound `(_id = {kind, subject_id})` so candidate
  (`user_id`) and company (`comp_id`) docs share a store without colliding. The company doc carries
  `comp_id` (its `subject_id`) so it is **per-tenant by construction**.
- **Index** (declared in the admin index authority `src/admin/app/infra/db.py`, alongside the other
  collections): the `_id` compound is the primary access path (`get(scope)` is an `_id` lookup); add
  `IndexSpec("onboarding", "subject_id")` only to support the **erasure** `delete_by_user(user_id)`
  equality match (so the purge is index-efficient even though the candidate `_id` already embeds it —
  the bare-`subject_id` index lets erasure delete without reconstructing the `kind`). Inc 5/the
  compliance-gate plan owns the index-authority pattern; this slots one more collection in.
- **Idempotency.** `complete_step` is an upsert that sets one boolean to `True`; calling it N times is
  identical to calling it once. `dismiss` is an idempotent boolean set. There is **no read-modify-write
  race** to worry about because each step write is independent (`$set steps.{step} = true`), so two
  concurrent step-completions never clobber each other (unlike a whole-doc overwrite). `completed_at` is
  recomputed from the post-write `steps` map.
- **No event, no funnel.** Onboarding writes nothing to RabbitMQ and touches no `ApplicationState`. The
  doc is private bookkeeping; nothing downstream depends on it. (Same "off the funnel seam" property as
  practice mode — it is what keeps onboarding free of CAS/audit obligations.)

### 4.5 Robustness — skippable, resumable, idempotent, never-gates (the hard invariants)

These four properties are the whole point; each is enforced structurally, not by convention:

1. **Skippable.** Every onboarding surface has a persistent, always-reachable **Dismiss / Skip**
   (`dismiss_onboarding`). Dismissing hides the card/exits the wizard **immediately** and persists, so
   it never re-nags. A dismissed user has a fully functional product.
2. **Resumable.** Progress is written **step-by-step** (each `completeStep` persists before the FE
   advances), and `get_onboarding` returns the exact `steps` map on the next load — so a user who
   closes the tab mid-wizard re-enters at the first unfinished step. Resumption is "render the steps
   whose `steps[id]` is falsy"; there is no separate "current step" cursor to corrupt.
3. **Idempotent.** Re-completing a step, re-running the résumé upload, re-posting (a second job),
   re-dismissing — all no-ops on the doc (§4.4). The FE may freely re-call `completeStep` (e.g. on every
   profile save) without creating duplicates or flicker.
4. **Never gates real usage.** This is enforced **by placement**: onboarding is a *card on* / *route
   beside* the real surfaces, never *in front of* them. There is **no route guard**, **no modal that
   blocks the app**, **no "complete onboarding to continue"**. The marketplace, the dashboard, posting a
   job, ranking applicants — all reachable on first load with the onboarding doc untouched. A test
   asserts the dashboard/marketplace render with `onboarding` absent and with `dismissed=True`
   identically (the doc's state changes only the *nudge card*, never the page's core).

> Why this matters: onboarding that blocks is onboarding users resent. The architecture overview's
> "demo-first" bar means a reviewer must be able to skip straight to any screen; a new user must never
> be trapped. Guidance, not a gate — enforced by the doc carrying no authority over any feature.

### 4.6 Erasure (Inc 0 follow-through)

The **candidate** `onboarding` doc is keyed by `user_id` and records first-run progress — low-
sensitivity, but it **is** per-user data, so it **joins the erasure cascade** (architecture overview §6;
the compliance-gate plan already lists "wiring the extension points now so later pillars just slot
their repo in"). `CandidateEraser` (`src/admin/app/resources/compliance.py`) gains an `onboarding` repo
and a `delete_by_user(user_id)` call alongside the existing reports/interviews/attempts/consents/
practice deletions; a test asserts `erase(user_id)` removes the candidate's onboarding row. The
**company** doc is keyed by `comp_id` (organizational config, not personal data) and is **not** part of
candidate erasure — it follows company-deletion lifecycle, not subject-access erasure.

## 5. Interfaces / events

- **New gRPC-web (admin) — `OnboardingService`:**
  - `GetOnboarding({kind})` → `OnboardingProgress` (subject from JWT; constructs a fresh "all pending"
    doc if none — a read never writes).
  - `CompleteStep({kind, step})` → `OnboardingProgress` (idempotent; `400`/`INVALID_ARGUMENT` if `step`
    ∉ the scope's step set; the subject is JWT-derived, never client-supplied).
  - `DismissOnboarding({kind})` → `OnboardingProgress` (idempotent).
- **Reused, unchanged:** the résumé parse, marketplace search, `/practice`, `createJob` + `JobForm` +
  the JD-assist client, `InviteRecruiter`, `AptitudeConfig.gate_mode`, the notifications `_MESSAGES`
  seam, the consent ledger, the `company_profiles` editor. Onboarding **calls** these; it changes none
  of them.
- **New company default:** `company_defaults.gate_mode` (a tiny per-company default `JobForm` reads to
  pre-fill new jobs). If a `company_defaults` doc/field already lands with the team-depth work (Part A
  #2), reuse it; otherwise this adds the single field. (Documented as a small dependency, §8.)
- **Events:** **NONE.** Onboarding publishes nothing to RabbitMQ and touches no funnel state. (A feature,
  not an omission — it keeps onboarding off the audited seam and free of CAS/event obligations.)

## 6. Key decisions & tradeoffs

- **A thin progress doc, not a full state machine.** The simplest thing that satisfies resumable +
  idempotent is a `{steps: {id: bool}, dismissed}` doc with independent per-step `$set`s — no "current
  step" cursor, no workflow engine. (Alternative considered: a richer `OnboardingService` with ordered
  transitions/validation — rejected as YAGNI for a first-run checklist; the FE owns ordering, the
  backend just remembers done-ness.) This is the "pick the simplest that fits" the task calls for.
- **FE owns the flow; backend owns the memory.** Step *ordering*, *copy*, and *which pillar route a step
  links to* live in the frontend (where the UX is); the backend only validates `step ∈ set` and stores
  done-ness. Keeps the backend tiny and the flow easy to re-sequence without a schema change.
- **Required vs optional steps.** Splitting the step sets (§4.1) is what makes the checklist reach 100%
  without forcing a skippable action — the structural guarantee behind "non-blocking."
- **Reuse, never reimplement.** Every step embeds or links an existing pillar flow (`JobForm`, résumé
  parse, `/practice`, `InviteRecruiter`, `gate_mode`, `company_profiles`). Onboarding adds *sequencing
  and empty-state copy*, not features — which is exactly why it's "mostly frontend with a thin flag."
- **Gate-default lives here because nothing else surfaces it.** The compliance-gate spec explicitly
  defers the recruiter UI ("Pillar D / recruiter workspace owns the actual screen"); the first-run
  wizard is the natural, earliest home for "pick advisory (recommended)" — so onboarding closes that UI
  gap as a side effect.
- **Consent/notification step is a default-setter, not a template engine.** The notifications center
  keeps `_MESSAGES` static in v1; onboarding respects that boundary and only sets a default string +
  confirms the existing consent posture — no new regulated surface, no engine. Both richer paths are
  named follow-ups.
- **Off the funnel, no event.** Like practice mode, onboarding carries no `comp_id` cross-tenant leak,
  no funnel state, no RabbitMQ — so it inherits none of the CAS/audit complexity and can't accidentally
  perturb an application.

## 7. Testing approach (offline, fakes)

All backend logic sits behind the existing in-memory repo/fakes so `bash scripts/check.sh` stays
**offline and green** (baseline **423 tests**; this increment grows it). No LLM seam is involved (the
JD-assist call inside the wizard's job step is the *existing* client, exercised by Pillar A's tests, not
re-tested here).

- **`test_onboarding_resource.py`** (admin, fakes only):
  - `get_onboarding` on an absent doc returns an all-pending, non-dismissed progress **without writing**
    (assert the repo received no write).
  - `complete_step` sets the step; a second `complete_step(same)` is a no-op (idempotent; the doc is
    byte-identical). `completed_at` is set **only** once every **required** step is done (optional steps
    don't trigger it).
  - `complete_step` with a step **not in the scope's set** (e.g. a company step on a candidate scope) →
    `ValidationError` (the one boundary check).
  - `dismiss_onboarding` flips `dismissed`; re-dismiss is a no-op.
  - **Identity/tenant:** the subject is taken from the scope/JWT, never a client field; a candidate scope
    can't read/write a company doc and vice-versa (parametrized).
- **`test_onboarding_api.py`** (gRPC-web `TestClient`, mirror the existing service tests): authed
  get/complete/dismiss for the owner; `UNAUTHENTICATED` with no token; `INVALID_ARGUMENT` for an unknown
  step; a company token only ever resolves to its own `comp_id`.
- **Never-gates regression:** a test asserts the dashboard/marketplace data paths are **independent** of
  the onboarding doc — they return the same result with the doc absent, present-incomplete, and
  `dismissed=True` (the doc changes only the nudge card, never the core page).
- **Erasure:** `CandidateEraser.erase(user_id)` deletes the candidate's `onboarding` row (extend the
  existing erasure test); the company doc is untouched by candidate erasure.
- **Frontend** — verified by `npx pnpm@9.15.0 --filter @ip/candidate build` +
  `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`. Manual: a fresh
  candidate sees the checklist + nudges and can dismiss; a fresh company is walked through the wizard,
  can skip any optional step, and resumes mid-wizard after a reload. No `next build` while `pnpm dev`
  is live.

## 8. Open questions

- **`company_defaults.gate_mode` ownership.** The gate-default step needs a per-company default field
  for `JobForm` to pre-fill. Does it land here (one field) or with Part A #2 (team/roles depth, which
  introduces per-company settings)? **Proposed:** add the single field here if #2 hasn't landed;
  otherwise reuse #2's settings doc. Either way it's one field, not a new collection.
- **Re-show onboarding after dismiss.** Should there be a "restart the setup guide" affordance (e.g. in
  settings) after a user dismisses? **Proposed:** out of scope for v1 (the doc persists; a future
  "restart" is a trivial `dismissed=False` write); flagged, not built.
- **Welcome email.** A first-run welcome email is natural but belongs to the **notifications center**
  (it owns the email seam), not onboarding. **Proposed:** a notifications-center follow-up; onboarding
  stays in-app only.
- **Onboarding completion analytics.** Step-completion is recorded on the doc; a "funnel of who finished
  onboarding" analytics view is a later add (Analytics pillar), not in this cut.
- **Step copy / which optional nudges.** The exact nudge set (e.g. add a "save your first job" candidate
  nudge, or a "set a saved search" one) is a copy decision for the build; the step **enum** is the
  contract, the copy is FE-owned and cheap to tune.
