# Onboarding & First-Run (Part A core #6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]`
> checkboxes. Spec: `docs/superpowers/v2/2026-06-19-onboarding-design.md`.

**Goal:** Get new users to value fast and fill the empty states the screens build plan flagged. A
**candidate first-run** (profile-completeness checklist → "find jobs" → "try a practice interview" +
no-applications / no-saved-jobs empty states) and an **employer first-run** (post-your-first-job wizard
reusing the extended `JobForm` + JD assist → invite team → set the **gate-mode default** (advisory
recommended) + a consent/notification default → optional branding + no-jobs / no-applicants empty
states). Backed by **one tiny `onboarding` progress doc** per user / per company that is **dismissible,
resumable, idempotent, and never gates real usage**. This module is **mostly frontend** (flows + empty
states) with a **thin backend flag**; it **reuses** existing pillar flows and **builds none** of them.

**Architecture:** A thin admin `OnboardingService` (gRPC-web, existing transport) over a single
`onboarding` collection keyed by `(_id = {kind, subject_id})` — candidate by `user_id`, company by
`comp_id`. Three idempotent ops: `GetOnboarding` (constructs a fresh all-pending doc if absent, never
writes on read), `CompleteStep` (per-step `$set`, validate `step ∈ scope set`), `DismissOnboarding`.
The frontend composes existing clients: a candidate dashboard `CandidateOnboardingCard` + the employer
`/onboarding` wizard, each step **embedding or linking an existing pillar flow**. The candidate doc
joins the Inc 0 erasure cascade. **No RabbitMQ event, no funnel state, no route guard.**

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest) must stay green;
  baseline today is **423 tests**. Frontend verified by
  `npx pnpm@9.15.0 --filter @ip/candidate build` + `npx pnpm@9.15.0 --filter @ip/company build` +
  `npx pnpm@9.15.0 --filter @ip/{ui,shared,api-client} typecheck`. Never `next build` while `pnpm dev`
  is live.
- **Reuse, never reimplement.** Do **not** rebuild the résumé parse, marketplace search, `/practice`,
  `JobForm`, the JD-assist client, `InviteRecruiter`, the `gate_mode` field, the notifications
  `_MESSAGES` seam, the consent ledger, or the `company_profiles` editor. Onboarding **orchestrates**
  them. If a step's underlying feature isn't built yet (its pillar is later in the build order), the
  step **links** to the route and marks done on the existing success signal — it never duplicates the
  feature.
- **Robustness invariants (the whole point) — enforce structurally, not by convention:**
  - **Skippable:** every surface has a persistent Dismiss/Skip (`DismissOnboarding`); it persists and
    never re-nags.
  - **Resumable:** progress is written **step-by-step** (each `CompleteStep` persists before the FE
    advances); `GetOnboarding` returns the exact `steps` map; resumption = "render steps whose
    `steps[id]` is falsy" (no separate cursor).
  - **Idempotent:** re-completing a step / re-dismissing is a no-op `$set`; the FE may freely re-call.
  - **Never gates:** onboarding is a *card on* / *route beside* the real surfaces, **never in front of
    them** — no route guard, no blocking modal, no "finish to continue". A test asserts the
    dashboard/marketplace render identically with the doc absent vs `dismissed=True`.
- **No compliance-triggering features.** No ID/identity verification, background checks, or biometric
  proctoring (architecture overview §2 permanent cut list). The consent/notification step only sets a
  **default string** + confirms the **existing** `automated_evaluation` consent posture — **no template
  engine** (notifications center keeps `_MESSAGES` static; that's a named follow-up), no new regulated
  surface.
- **Off the funnel:** onboarding carries **no `comp_id` cross-tenant leak** (the subject id is always
  JWT-derived, never a client param), **publishes nothing** to RabbitMQ, and touches **no
  `ApplicationState`**. Same posture as practice mode.
- **Robustness bar (per `docs/superpowers/plans/PRODUCTION_STANDARDS.md` + `~/.claude/CLAUDE.md`):**
  validate at boundaries (the one check: `step ∈ the scope's set`); subject id from the auth context,
  never the client; structured `get_logger` logs; trust internal typed calls (no defensive coercion on
  already-typed params); minimal code (a `{steps,dismissed}` doc, not a workflow engine).
- **Offline gate:** all backend logic sits behind the existing in-memory repo/fakes; Mongo is never hit
  in unit tests. No LLM seam is added (the JD-assist call in the wizard is the *existing* client).

---

## File structure (new + modified)

```
src/admin/app/
  model/onboarding.py                      (NEW — OnboardingStep enum, *_STEPS / *_REQUIRED tuples,
                                            OnboardingScope, OnboardingProgress; spec §4.1)
  resources/onboarding.py                  (NEW — get_onboarding / complete_step / dismiss_onboarding;
                                            idempotent; validate step ∈ scope set; subject from JWT)
  infra/repositories/onboarding.py         (NEW — onboarding collection repo: get / upsert_step /
                                            set_dismissed / delete_by_user)
  infra/db.py                              (+onboarding index: _id compound is primary; +IndexSpec(
                                            "onboarding","subject_id") for erasure equality match)
  routes/<grpc service module>             (NEW OnboardingService: GetOnboarding / CompleteStep /
                                            DismissOnboarding — thin RPC, subject from auth context)
  resources/compliance.py                  (CandidateEraser: +onboarding repo + delete_by_user in erase())
  <app factory / DI wiring>                (construct the repo + service; pass the repo to CandidateEraser)
  proto/ (or the gRPC-web schema location)  (+onboarding service + messages; then the gen step)

src/admin/tests/
  test_onboarding_resource.py              (NEW — get(absent→no write)/complete(idempotent)/dismiss/
                                            required-vs-optional completed_at/step-not-in-set/tenant)
  test_onboarding_api.py                   (NEW — gRPC-web: authed get/complete/dismiss; UNAUTH;
                                            INVALID_ARGUMENT unknown step; company→own comp_id only)
  test_resources_compliance.py             (+onboarding row erased; company doc untouched)

frontend/packages/shared/src/
  onboarding.ts                            (NEW — makeOnboardingClient(adminUrl, store): get /
                                            completeStep(step) / dismiss; mirrors existing gRPC-web client)
  index.ts                                 (+export makeOnboardingClient + OnboardingProgress/Step types)

frontend/apps/candidate/
  lib/auth.tsx                             (+export onboarding = makeOnboardingClient(ADMIN_URL, store))
  components/candidate-onboarding-card.tsx (NEW — checklist (résumé/review/prefs) + 3 nudges +
                                            Progress + Dismiss; links /profile, /jobs, /practice)
  components/dashboard.tsx                 (+render CandidateOnboardingCard above the tracker;
                                            +no-applications EmptyState)
  app/saved/page.tsx (or the saved-jobs view)  (+no-saved-jobs EmptyState)   # whichever owns /saved
  lib/onboarding-steps.ts                  (NEW — FE step ordering/copy/route map; keys off the enum)

frontend/apps/company/
  lib/auth.tsx                             (+export onboarding = makeOnboardingClient(ADMIN_URL, store))
  app/onboarding/page.tsx                  (NEW — EmployerOnboardingWizard route; stepper; Skip/Finish-later)
  components/employer-onboarding-wizard.tsx(NEW — steps: post-first-job <JobForm>+JD assist · invite ·
                                            gate default · consent default · optional branding)
  components/onboarding-step-*.tsx         (NEW — one thin component per step; each embeds/links existing flow)
  app/(dashboard)/page.tsx (recruiter home)(+"Finish setting up" card when COMPANY_REQUIRED incomplete;
                                            +no-jobs EmptyState)
  app/jobs/[id]/page.tsx (applicants view) (+no-applicants EmptyState on the ranked/applicants tab)
  components/job-form.tsx (shared JobForm) (+read company_defaults.gate_mode to pre-fill new jobs — only
                                            if not already wired by Part A #2)
```

**Responsibilities (one job each):** `model/onboarding.py` = the progress shape + canonical step sets.
`resources/onboarding.py` = three idempotent ops + the one boundary check. `infra/repositories/
onboarding.py` = the collection read/write + erasure. The gRPC service is thin transport. The FE step
components each **embed or link** an existing pillar flow and call `completeStep` on its success signal —
they hold no feature logic of their own.

---

## Resolved scope (completeness audit 2026-06-19)

Closes **Part A "core" #6** of `docs/superpowers/v2/2026-06-19-v2-completeness-audit.md`. The concrete,
pinned facts each task must honor (grounded in the existing v2 docs, not invented):

- **S1 — candidate checklist + nudges.** Steps `upload_resume / review_profile / set_preferences`
  (**required**) + `explore_jobs / try_practice` (**optional nudges**). Required-only drives `Progress`
  + `completed_at`, so the checklist hits 100% without forcing a skippable step (spec §4.1/§4.2).
- **S2 — employer wizard.** Steps `post_first_job` (**required**, embeds the extended `JobForm` + the
  existing JD-assist client) · `invite_team` (**optional**, reuses `InviteRecruiter`) · `set_gate_default`
  (**required**, the **first UI** for `AptitudeConfig.gate_mode`, advisory pre-selected/"Recommended") ·
  `set_consent_default` (**required**, sets a default candidate-notification string over the existing
  `_MESSAGES` seam + confirms the `automated_evaluation` consent posture — **no template engine**) ·
  `setup_branding` (**optional**, links the existing `company_profiles` editor) (spec §4.3).
- **S3 — gate default home.** The compliance-gate spec defers the recruiter UI ("Pillar D / recruiter
  workspace owns the actual screen"); the wizard is the earliest home. Store the choice as a per-company
  default (`company_defaults.gate_mode`) that `JobForm` reads to pre-fill new jobs. `auto` = demo
  default, `advisory` = recommended production default (ground truth
  `2026-06-19-compliance-advisory-gate-design.md`).
- **S4 — empty states.** Fill the build-plan-flagged holes with `@ip/ui`'s `EmptyState` (+ `LoadingState`
  / `ErrorState`): candidate **no-applications** (dashboard tracker) + **no-saved-jobs** (saved view);
  employer **no-jobs** (recruiter home) + **no-applicants** (ranked/applicants tab). Each EmptyState's
  CTA points back at the first-run path (post a job / browse jobs).
- **S5 — thin state, never a workflow engine.** One `onboarding` doc `{steps:{id:bool}, dismissed,
  completed_at}`; per-step independent `$set` (no whole-doc overwrite race); `get` constructs a fresh
  doc on miss **without writing**. FE owns ordering/copy; backend owns done-ness + the `step ∈ set`
  check (spec §4.4/§6).
- **S6 — robustness invariants.** Skippable (persistent Dismiss) · resumable (step-by-step writes, no
  cursor) · idempotent (no-op `$set`) · **never gates** (card-on/route-beside, no guard/modal). The
  never-gates property is test-locked (spec §4.5).
- **S7 — erasure.** The **candidate** doc (keyed by `user_id`) joins the Inc 0 `CandidateEraser`
  cascade (`delete_by_user`); the **company** doc (keyed by `comp_id`, org config) is **not** part of
  candidate erasure (spec §4.6).

---

## TIER A — the thin backend (one collection, three idempotent ops)

### Task 1 — onboarding models (TDD)
**Files:** Create `src/admin/app/model/onboarding.py`; Test `src/admin/tests/test_onboarding_resource.py`
(model assertions to start).
**Interfaces — Produces:** `OnboardingStep` (StrEnum), `CANDIDATE_STEPS`/`COMPANY_STEPS` +
`CANDIDATE_REQUIRED`/`COMPANY_REQUIRED` tuples, `OnboardingScope`, `OnboardingProgress` (spec §4.1).

- [ ] **Step 1 — failing test:** assert `OnboardingStep` has the 10 members (spec §4.1); the candidate
  step set excludes the company steps and vice-versa; `CANDIDATE_REQUIRED ⊂ CANDIDATE_STEPS` (and the
  nudges `explore_jobs`/`try_practice` are **not** in `CANDIDATE_REQUIRED`); `COMPANY_REQUIRED ⊂
  COMPANY_STEPS` (and `invite_team`/`setup_branding` are **not** required). Assert `OnboardingProgress`
  defaults: `steps == {}`, `dismissed is False`, `completed_at == ""`.
- [ ] **Step 2 — run** `(cd src/admin && ../../.venv/bin/python -m pytest tests/test_onboarding_resource.py -v)` → FAIL (module missing).
- [ ] **Step 3 — implement** `model/onboarding.py` exactly as spec §4.1.
- [ ] **Step 4 — run → PASS.**
- [ ] **Step 5 — gate:** `bash scripts/check.sh` green.

### Task 2 — onboarding repository (TDD)
**Files:** Create `src/admin/app/infra/repositories/onboarding.py`; Modify `src/admin/app/infra/db.py`
(+indexes); extend the admin test fakes (in-memory onboarding repo) used by `test_onboarding_resource.py`.
**Interfaces — Produces:** `OnboardingRepository` with `get(scope) -> OnboardingProgress | None`,
`upsert_step(scope, step, value)`, `set_dismissed(scope, value)`, `delete_by_user(user_id)`.

- [ ] **Step 1 — in-memory fake** (mirror an existing repo fake in admin tests): a dict keyed by
  `(kind, subject_id)`; `upsert_step` sets `steps[step]`; `set_dismissed` flips the flag; `get` returns
  the stored doc or `None`; `delete_by_user` removes the `("candidate", user_id)` key.
- [ ] **Step 2 — implement** `OnboardingRepository` over the `onboarding` collection: `_id =
  {"kind": ..., "subject_id": ...}`; `get` is an `_id` lookup; `upsert_step` is
  `update_one(_id, {"$set": {f"steps.{step}": value, "updated_at": now}}, upsert=True)` (per-step set,
  **no whole-doc overwrite** — S5); `set_dismissed` upserts `dismissed`; `delete_by_user` deletes the
  candidate `_id`. (Infra — exercised via the fake in Task 3; no Mongo unit test.)
- [ ] **Step 3 — indexes** in `src/admin/app/infra/db.py` (the index authority): the `_id` compound is
  the primary path; add `IndexSpec("onboarding", "subject_id")` to back the erasure equality match
  (S7). Slot it next to the other collections' specs.
- [ ] **Step 4 — gate green.**

### Task 3 — onboarding resource: get / complete_step / dismiss (TDD — the core)
**Files:** Create `src/admin/app/resources/onboarding.py`; Test
`src/admin/tests/test_onboarding_resource.py`.
**Interfaces — Consumes:** `OnboardingRepository` (fake). **Produces:**
`get_onboarding(scope, *, repo, clock) -> OnboardingProgress`;
`complete_step(scope, step, *, repo, clock) -> OnboardingProgress`;
`dismiss_onboarding(scope, *, repo, clock) -> OnboardingProgress`.

- [ ] **Step 1 — failing tests** (fakes only):
  - `get_onboarding` on an **absent** doc returns an all-pending, `dismissed=False` progress **and the
    repo received NO write** (assert the fake's write-count is 0 — a read never mutates, S5).
  - `complete_step(scope, UPLOAD_RESUME)` sets it; a **second** `complete_step(same)` returns a
    byte-identical doc (idempotent — S6); the repo write is a no-op-equivalent `$set`.
  - `completed_at` is **empty** until **all required** steps are done, then set; completing an
    **optional** step (`EXPLORE_JOBS`) does **not** set `completed_at`.
  - `complete_step` with a step **not in the scope's set** (a company step on a candidate scope) →
    `ValidationError` (the one boundary check).
  - `dismiss_onboarding` flips `dismissed`; re-dismiss is a no-op.
  - **Tenant/identity:** a candidate scope and a company scope address **different** docs; nothing in the
    resource accepts a subject id from outside the `scope` (the caller builds the scope from the JWT).
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement** `resources/onboarding.py`:
  - `get_onboarding`: `doc = repo.get(scope)`; if `None`, **return** `OnboardingProgress(kind=scope.kind)`
    (fresh, not written). No write on the read path.
  - `complete_step`: `_steps_for(scope.kind)` → if `step not in that set`, `raise ValidationError`;
    `repo.upsert_step(scope, step, True)`; reload; recompute `completed_at` from the post-write `steps`
    against `_required_for(scope.kind)` (set `clock().isoformat()` once when newly complete, else keep);
    persist `completed_at`/`updated_at`; return the progress.
  - `dismiss_onboarding`: `repo.set_dismissed(scope, True)`; return the progress.
  - `get_logger(component="resource.onboarding")`; log `complete_step` with `{kind, step, completed:
    bool}` (aggregate-ish; no PII).
  - **One `now`** per call (`clock()` once); trust the typed `scope`/`step` (no defensive coercion).
- [ ] **Step 4 — run → PASS** (all the above cases).
- [ ] **Step 5 — gate green.**

### Task 4 — OnboardingService gRPC-web endpoints (TDD)
**Files:** Modify the admin gRPC service module + proto/schema location + the app factory/DI;
Test `src/admin/tests/test_onboarding_api.py`.
**Interfaces — Produces:** `GetOnboarding({kind})`, `CompleteStep({kind, step})`,
`DismissOnboarding({kind})` → `OnboardingProgress`. **The subject id is resolved server-side from the
authenticated JWT** (candidate→`user_id`, company→`comp_id`), **never** read from the request body.

- [ ] **Step 1 — failing endpoint tests** (mirror an existing admin gRPC-web service test): authed
  `GetOnboarding` returns an all-pending doc for a new user; `CompleteStep` then `GetOnboarding`
  reflects the step; `DismissOnboarding` sets `dismissed`. `UNAUTHENTICATED` with no/invalid token.
  `INVALID_ARGUMENT` for an unknown/foreign step. A **company** token resolves only to **its own**
  `comp_id` (it cannot pass another company's id — there is no id field to pass).
- [ ] **Step 2 — define** the proto/schema messages + service; run the gen step
  (`pnpm gen` or the repo's codegen) so the gRPC-web stubs exist.
- [ ] **Step 3 — implement** the service thin-transport style: build `OnboardingScope` from
  `{kind}` + the **auth-context subject id** (the existing pattern that yields `user_id`/`comp_id`
  from the JWT); call the Task 3 resource; map `ValidationError`→`INVALID_ARGUMENT`, no-auth→
  `UNAUTHENTICATED`. Wire the repo + service in the app factory; **pass the repo to `CandidateEraser`**
  (Task 7 uses it).
- [ ] **Step 4 — run → PASS; gate green.**

---

## TIER B — candidate first-run (checklist + nudges + empty states)

> **Frontend grounding (read before writing FE code).** Mirror these verbatim — do not invent new
> conventions:
> - **Client shape:** the existing gRPC-web/REST clients in `frontend/packages/shared/src/` (e.g.
>   `interview.ts`, `jd.ts`) — `restAuthFor(store)`/`authedFetch` (silent 401-refresh), the `post<T>`/
>   `get<T>` helpers that parse `{detail}` and throw `HttpError(status, detail)`. Index barrel:
>   `frontend/packages/shared/src/index.ts`.
> - **Query/mutation patterns:** `frontend/apps/candidate/components/dashboard.tsx` +
>   `recommended-roles.tsx` — `useQuery`/`useMutation`, `errorMessage(err)` for copy, `enabled`-gating,
>   the `inFlight` `useRef` latch on mutations. Query client: `frontend/packages/shared/src/query.ts`.
> - **`@ip/ui` exports available** (`frontend/packages/ui/src/index.ts`): `Card`/`CardHeader`/
>   `CardTitle`/`CardContent`, `Button` (`loading`/`leadingIcon`), `Badge` (`tone`/`variant`),
>   `Progress` (0–100 or indeterminate), `Alert` (`tone`), `Spinner`, `EmptyState`/`ErrorState`/
>   `LoadingState` (icon/message/retry), `Field`/`Input`/`Select`/`Textarea`. Tokens:
>   `text-foreground`, `text-muted-foreground`, `bg-surface-muted`, `bg-primary`, `border-l-brand-500`,
>   `text-success`, `font-display`.
> - **Auth wiring:** `frontend/apps/{candidate,company}/lib/auth.tsx` —
>   `makeXClient(ADMIN_URL, store)` sharing the app's token store; `useAuth()`/`useRequireAuth`/
>   `useRequireRole`.
> - **Brand bar:** `docs/brand/aptura-ui-ux.md` — real content (no lorem); one focal point (the violet
>   metric → the completeness `Progress`); every state designed; light+dark; trust cues in the copy
>   ("never shared with any employer"). Gradient only on hero/marketing, never product UI.
> - **FE gotchas (from memory):** `lucide-react` icons must be imported **in the app**, never
>   re-exported through `@ip/ui`; never `next build` while `pnpm dev` is live.

### Task 5 — shared onboarding client + candidate checklist/nudges + candidate empty states
**Files:** Create `frontend/packages/shared/src/onboarding.ts` (+export in `index.ts`); Modify
`frontend/apps/candidate/lib/auth.tsx`; Create
`frontend/apps/candidate/components/candidate-onboarding-card.tsx` +
`frontend/apps/candidate/lib/onboarding-steps.ts`; Modify
`frontend/apps/candidate/components/dashboard.tsx` and the saved-jobs view.

**Interfaces — Produces:** `makeOnboardingClient(adminUrl, store)` with `get()` →
`OnboardingProgress`, `completeStep(step)` → `OnboardingProgress`, `dismiss()` → `OnboardingProgress`.
Types `OnboardingProgress` (`{ kind; steps: Record<string,boolean>; dismissed; completed_at }`) +
`OnboardingStep` (string union) exported from `index.ts`.

#### Step 1 — `@ip/shared/onboarding.ts` (the client)
- [ ] Mirror the existing gRPC-web/REST client wiring exactly: `restAuthFor(store)` →
  `get<T>`/`post<T>` via `authedFetch`, parsing `{detail}` and throwing `HttpError`. Methods:
  `get()` → the GetOnboarding read; `completeStep(step)` → CompleteStep; `dismiss()` →
  DismissOnboarding. **No `subject_id`/`user_id`/`comp_id` in any signature** — the subject is
  server-derived from the JWT (the detached-identity property reaches the client surface).
- [ ] Export `makeOnboardingClient`, `type OnboardingProgress`, `type OnboardingStep` from `index.ts`.

#### Step 2 — `auth.tsx` wiring (candidate)
- [ ] `import { makeOnboardingClient } from "@ip/shared";` then
  `export const onboarding = makeOnboardingClient(ADMIN_URL, store);` under the existing client exports
  (reuses the candidate token store — no second auth surface).

#### Step 3 — `lib/onboarding-steps.ts` (FE step map — ordering/copy/route)
- [ ] A small data module the card renders off: for each candidate step, `{ id, title, hint, href,
  optional }` (e.g. `upload_resume → /profile`, `explore_jobs → /jobs`, `try_practice → /practice`).
  Ordering + copy live **here** (FE owns the flow; the backend only stores done-ness — spec §6).

#### Step 4 — `candidate-onboarding-card.tsx` (checklist + 3 nudges; **states: loading / active / dismissed / complete / error**)
- [ ] `"use client"`. `useQuery(["onboarding"], onboarding.get)`. Render **only** when
  `!data.dismissed && !data.completed_at`; while loading show a `LoadingState`/skeleton; on error a
  small inline `Alert` (the dashboard still renders — never-gates).
- [ ] **Checklist:** the three `CANDIDATE_REQUIRED` rows from the step map, each a row with a
  done/undone marker (`CheckCircle2` lucide, `text-success` when `steps[id]`) + a `Link`/`Button` to its
  `href`. A thin `Progress` (0–100) over the **required** steps' done-ratio is the card's **one focal
  point** (violet). Completion of a step is driven by the **existing** flow's success (e.g. after a
  profile save the dashboard calls `onboarding.completeStep("review_profile")` via a `useMutation`; the
  mutation invalidates `["onboarding"]`). The card **re-calling `completeStep` is safe** (idempotent).
- [ ] **Nudge 1 — "Find jobs":** a sub-card ("Search open roles — your match score is on every card")
  + primary `Button` → `/jobs`; clicking fires `completeStep("explore_jobs")` (optional).
- [ ] **Nudge 2 — "Try a practice interview":** a sub-card reusing Candidate Growth's private framing
  ("Practice a real AI interview, just for you — never shared with any employer") + `Button` →
  `/practice`; firing `completeStep("try_practice")` (optional).
- [ ] **Dismiss:** a persistent `Button variant="ghost"` "Dismiss" → `onboarding.dismiss()` (mutation →
  invalidate). After dismiss the card disappears; the dashboard is fully usable.
- [ ] **Complete state:** when `completed_at` is set, render a small dismissible "You're all set"
  confirmation instead of the checklist (still never blocks).
- [ ] a11y/dark/responsive: semantic `<ul>/<li>` for the checklist; `aria-hidden` on decorative icons;
  token colors only; single-column on mobile.

#### Step 5 — candidate empty states (S4)
- [ ] **No-applications** (dashboard tracker): when the applications query returns empty, render
  `EmptyState` (icon + "No applications yet" + "Browse open roles to get started" + a `Button` →
  `/jobs`) **instead of** an empty table — but the `CandidateOnboardingCard` (if present) still renders
  above it. (`LoadingState` while the query is pending; `ErrorState`+retry on failure.)
- [ ] **No-saved-jobs** (the saved view): `EmptyState` (icon + "No saved jobs" + "Save jobs from the
  marketplace to compare them here" + `Button` → `/jobs`). Same loading/error treatment.

#### Step 6 — verify (candidate FE)
- [ ] `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck`
  green. Manual: a fresh candidate sees the checklist + nudges, can complete a step (profile save flips
  the row), can dismiss (card vanishes, dashboard still works), and the empty states render with their
  CTAs. Dark + mobile sane. **Do not `next build` while `pnpm dev` is live.**

---

## TIER C — employer first-run (the wizard + empty states)

### Task 6 — employer wizard route + steps + company empty states
**Files:** Modify `frontend/apps/company/lib/auth.tsx`; Create
`frontend/apps/company/app/onboarding/page.tsx`,
`frontend/apps/company/components/employer-onboarding-wizard.tsx`, and one thin component per step
(`onboarding-step-job.tsx`, `-invite.tsx`, `-gate.tsx`, `-consent.tsx`, `-branding.tsx`); Modify the
recruiter home page (`"Finish setting up"` card + no-jobs empty state) and the applicants/ranked tab
(no-applicants empty state); Modify the shared `job-form.tsx` to read `company_defaults.gate_mode`
(only if not already wired by Part A #2).

**Interfaces — Produces:** a `/onboarding` route rendering `EmployerOnboardingWizard` (a stepper over
the 5 steps); each step **embeds or links an existing pillar flow** and calls
`onboarding.completeStep(...)` on its success signal. **Skip/Finish-later** exits to the dashboard at
any step.

#### Step 1 — `auth.tsx` wiring (company)
- [ ] `export const onboarding = makeOnboardingClient(ADMIN_URL, store);` under the existing company
  client exports (reuses the company token store).

#### Step 2 — `employer-onboarding-wizard.tsx` (the stepper; **states: loading / per-step / saving / error / complete**)
- [ ] `"use client"`. `useQuery(["onboarding"], onboarding.get)`. The wizard renders the **first
  unfinished** step (resumption = "render steps whose `steps[id]` is falsy", no separate cursor — S6);
  a stepper header shows progress over `COMPANY_REQUIRED`. A persistent **"Skip / Finish later"**
  `Button` exits to the dashboard (progress is already saved step-by-step). On error, an inline `Alert`
  + retry; never a blocking modal.
- [ ] When `COMPANY_REQUIRED` is complete, render a "You're set up" summary with `Link`s to
  ranked applicants + analytics.

#### Step 3 — `onboarding-step-job.tsx` — Post your first job *(required)*
- [ ] Embed the **existing extended `<JobForm>`** (Pillar A TIER 5) + the **existing JD-assist client**
  surface (the `jd.ts` / `AiSuggestPanel` from screens #12). **Do not duplicate** the form — render the
  same component `/jobs/new` uses. On a successful `createJob`, `completeStep("post_first_job")` then
  advance. Reuse the form's own loading/error states; the `inFlight` latch prevents a double-create.

#### Step 4 — `onboarding-step-invite.tsx` — Invite your team *(optional)*
- [ ] Reuse the **existing `InviteRecruiter`** (email + temp password). On ≥1 successful invite,
  `completeStep("invite_team")`; a **"Skip for now"** advances without marking. A solo recruiter is
  never stuck. (Part A #2 deepens roles/seats later — this step just calls the existing invite.)

#### Step 5 — `onboarding-step-gate.tsx` — Set your gate-mode default *(required, the first UI for `gate_mode`)*
- [ ] A choice control for `AptitudeConfig.gate_mode` (`advisory | auto`) with **advisory pre-selected
  and badged "Recommended"** (copy: "AI recommends, you decide — no candidate is ever auto-rejected");
  `auto` offered as "Auto-advance on pass" with a plain note. On confirm, persist the value as the
  **company default** (`company_defaults.gate_mode`, read by `JobForm` to pre-fill new jobs) and
  `completeStep("set_gate_default")`. (Ground truth: `auto` = demo default, `advisory` = recommended
  production default — `2026-06-19-compliance-advisory-gate-design.md`.)
- [ ] **`JobForm` pre-fill:** modify `job-form.tsx` to read `company_defaults.gate_mode` for the
  new-job initial value **only if** Part A #2 hasn't already wired company settings; otherwise reuse
  that. (One field, not a new collection — spec §8.)

#### Step 6 — `onboarding-step-consent.tsx` — Candidate-notification + consent default *(required)*
- [ ] A thin step that (a) sets a **default candidate-notification message** over the notifications
  center's **existing static `_MESSAGES` seam** (a single editable default string — **not** a template
  engine), and (b) **confirms the consent posture** (the existing `automated_evaluation` consent the
  apply flow records). Copy: "Candidates always hear back — here's your default update message." On save,
  `completeStep("set_consent_default")`. **No new regulated surface, no template engine** (both are
  named follow-ups — spec §1/§6).

#### Step 7 — `onboarding-step-branding.tsx` — Optional branding setup *(optional)*
- [ ] Link to the **existing `company_profiles` editor** (`/branding`, Pillar A TIER 5: logo, display
  name, "actively reviewing" badge). "Add later" skips. On a save round-trip (or a "done" return),
  `completeStep("setup_branding")`. Do **not** reimplement the editor — link/embed it.

#### Step 8 — `app/onboarding/page.tsx` + recruiter-home entry + company empty states (S4)
- [ ] `app/onboarding/page.tsx`: `"use client"`, `useRequireAuth` + `useRequireRole([...recruiter/
  company roles])`, wrap in `<CompanyShell>`, render `<EmployerOnboardingWizard />`. **No route guard
  anywhere forces a user into this route** (never-gates).
- [ ] **Recruiter home:** a prominent **"Finish setting up your account"** `Card` (→ `/onboarding`)
  rendered **only** when `!progress.dismissed && !progress.completed_at`; it **invites**, never blocks.
- [ ] **No-jobs** (recruiter home): `EmptyState` (icon + "No jobs posted yet" + "Post your first role to
  start receiving applicants" + a `Button` → `/onboarding` (or `/jobs/new`)). (`LoadingState`/`ErrorState`.)
- [ ] **No-applicants** (the ranked/applicants tab of `/jobs/[id]`): `EmptyState` (icon + "No applicants
  yet" + "Share this job or wait for matches — you'll be notified" + optionally a copy-link affordance).
  Same loading/error treatment.

#### Step 9 — verify (company FE)
- [ ] `npx pnpm@9.15.0 --filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`
  green. Manual: a fresh company lands on the recruiter home → sees "Finish setting up" + the no-jobs
  empty state → enters `/onboarding` → posts a first job (the **real** `JobForm` + JD assist) → invites
  (or skips) → sets **advisory** as the gate default → sets the notification/consent default → (optional)
  branding → sees "You're set up"; **reloading mid-wizard resumes at the first unfinished step**; "Skip
  / Finish later" always works. The no-applicants empty state renders on a job with no applicants. Dark
  + mobile sane. **Do not `next build` while `pnpm dev` is live.**

---

## TIER D — erasure + never-gates lock + gate green

### Task 7 — erasure cascade entry (TDD — Inc 0 follow-through)
**Files:** Modify `src/admin/app/resources/compliance.py` (`CandidateEraser`), the `CandidateEraser`
construction site (app factory/route from Task 4), and `src/admin/tests/test_resources_compliance.py`.

- [ ] **Step 1 — failing test:** `CandidateEraser.erase(user_id)` calls
  `onboarding.delete_by_user(user_id)` (assert the candidate's `onboarding` row is deleted) alongside
  the existing reports/interviews/attempts/consents (and practice, if Inc 5 landed) deletions. Assert a
  **company** `onboarding` doc is **untouched** by candidate erasure (it's keyed by `comp_id`, org
  config — spec §4.6).
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement:** inject the `OnboardingRepository` into `CandidateEraser.__init__` and call
  `await self._onboarding.delete_by_user(user_id)` in `erase()`. Update the construction site (Task 4
  wiring) to pass the repo. (The `subject_id` index from Task 2 backs the equality delete.)
- [ ] **Step 4 — run → PASS; gate green.**

### Task 8 — never-gates regression lock (TDD — the hard invariant)
**Files:** Test in `src/admin/tests/test_onboarding_resource.py` (or a small `test_onboarding_never_gates.py`).

- [ ] **Step 1 — assert independence:** the dashboard/marketplace **data paths** are independent of the
  onboarding doc — the relevant read (e.g. applications list / job search the candidate dashboard uses)
  returns the **same** result with the onboarding doc **absent**, **present-incomplete**, and
  **`dismissed=True`**. (If the page-data path is FE-only, encode this as a typecheck/structural
  assertion that no onboarding read gates a page query + a manual check in Task 9.) The onboarding doc's
  state may change only the **nudge card/wizard-entry**, never the core page's reachability or content.
- [ ] **Step 2 — run → PASS.** (This is the lock: anyone who later puts an onboarding read in front of a
  real surface fails here.)
- [ ] **Step 3 — gate green.**

### Task 9 — finalize + regression
- [ ] **Confirm the invariants:** re-read `resources/onboarding.py` — `get` never writes; every op is an
  idempotent `$set`; the only boundary check is `step ∈ scope set`; the subject id is never a client
  param. Re-confirm **no RabbitMQ publish, no `ApplicationState`, no `comp_id` from the client**.
- [ ] **Confirm never-gates in the apps:** there is **no route guard / blocking modal** forcing
  onboarding; the candidate dashboard renders with the doc dismissed; the company `/jobs`/`/talent`/
  `/analytics` are reachable without touching the wizard.
- [ ] **Confirm reuse:** the wizard's job step renders the **existing** `<JobForm>` (no duplicate form);
  invite reuses `InviteRecruiter`; branding links the **existing** `company_profiles` editor; the
  consent step writes only the **existing** `_MESSAGES`/consent seams (no template engine).
- [ ] **Empty states:** all four flagged holes (candidate no-applications / no-saved-jobs; company
  no-jobs / no-applicants) render with `EmptyState` + a CTA back to the first-run path, plus
  `LoadingState`/`ErrorState`.
- [ ] **Full gate** `bash scripts/check.sh` green (grown from **423**); all three FE builds + the shared
  typechecks green; update `docs/superpowers/plans/HANDOFF.md` (new "Onboarding & First-Run (Part A #6)"
  section) + memory; flip the spec/plan index row (if tracked) to authored. Record the open follow-ups
  (`company_defaults.gate_mode` ownership vs Part A #2, re-show-after-dismiss, welcome email →
  notifications center, onboarding analytics, the exact nudge/copy set).

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**); all new logic runs offline
   behind the in-memory onboarding repo fake (Mongo never hit in unit tests; no LLM seam added).
2. **Idempotent + resumable + read-never-writes:** `test_onboarding_resource.py` proves `get` on a miss
   writes nothing; `complete_step` twice is a no-op; `completed_at` flips only on **all required** steps;
   `dismiss` is idempotent.
3. **Boundary + tenant:** an out-of-scope step → `ValidationError`; candidate vs company scopes address
   different docs; the gRPC service derives the subject from the JWT (no client-supplied id).
4. **Never-gates (the hard rule):** `test_onboarding_never_gates.py` proves the dashboard/marketplace
   data paths are identical with the doc absent vs `dismissed=True`; manual confirms no guard/modal.
5. **Erasure:** `CandidateEraser.erase(user_id)` deletes the candidate `onboarding` row and leaves the
   company doc untouched.
6. **Reuse (no reimplementation):** the wizard embeds the existing `JobForm` + JD assist, reuses
   `InviteRecruiter`, links the existing `company_profiles` editor, and the consent step writes only the
   existing `_MESSAGES`/consent seams; the gate step is the first UI for `gate_mode` (advisory default).
7. **Empty states:** candidate no-applications / no-saved-jobs and company no-jobs / no-applicants all
   render `EmptyState`+CTA (+ loading/error), per `docs/brand/aptura-ui-ux.md`'s "every state designed".
8. **Frontend:** `--filter @ip/candidate build` + `--filter @ip/company build` +
   `--filter @ip/{ui,shared,api-client} typecheck` green; manual fresh-candidate checklist E2E + fresh-
   company wizard E2E (post job → invite/skip → advisory gate → consent default → branding/skip →
   set-up), including mid-wizard resume and dismiss.

## Risks / re-verify at execution

- **Subject-id source:** the gRPC service **must** derive `user_id`/`comp_id` from the auth context, not
  the request — re-verify the exact admin auth-context accessor at execution and keep zero subject fields
  on the wire (the cross-tenant guarantee).
- **`company_defaults.gate_mode` ownership:** if Part A #2 (team/roles depth) has already introduced a
  per-company settings doc, reuse it for the gate default rather than adding a field; re-check before
  Task 6 Step 5.
- **`JobForm` / JD-assist availability:** the wizard's job step depends on Pillar A TIER 5's `JobForm` +
  the JD-assist client existing. If onboarding is built **before** Pillar A, either sequence it after, or
  have the job step **link** to `/jobs/new` (and mark `post_first_job` on the existing create success)
  rather than embedding the form — never duplicate the form.
- **Never-gates discipline:** if a temptation appears to "redirect new users to onboarding" or gate a
  page on completion, **stop** — onboarding is guidance, not a gate (spec §4.5); the regression lock
  (Task 8) is there precisely to catch this.
- **Notifications `_MESSAGES` seam shape:** the consent/notification step writes a default over the
  existing static map — re-verify its shape (`{state/kind: (subject, body)}`) at execution and keep it a
  single default string, **not** a template engine (that boundary is owned by the notifications center).
- **Idempotent `$set`, not whole-doc overwrite:** each step write must be an independent
  `$set steps.{step}` so concurrent step completions never clobber each other; do **not** read-modify-
  write the whole `steps` map.
