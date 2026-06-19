# Team & Permissions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-team-and-permissions-design.md`. Canonical design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§4 module #1 Identity & Access).

**Goal:** Systematize multi-recruiter orgs. A static **permissions matrix** (`company_admin` /
`recruiter` / **new** `hiring_manager` → scope sets) in `lib`, enforced by a **`require_permission(scope)`**
guard that **extends** the existing `_require_manager` (the matrix is the dedup — the three duplicated
`_MANAGER_ROLES` collapse into it). A **`TeamService`** (gRPC-web on admin) exposing the **roster**
(`ListMembers`) + **seat mutations** (`InviteMember` / `ResendInvite` / `RevokeInvite` / `RemoveMember`
/ `ChangeRole`), every mutation **`team:manage`-gated, `comp_id`-scoped, audited, and last-admin-
protected**. The `/team` page upgrades from the basic invite form to a full **roster** (Table, role
`Select`, invite `Dialog`, per-row `ConfirmDialog`). **Per-job scoping** is designed (model + indexes
ship) but **enforcement is should-have, deferred** (spec §3.6). No new infra; no new candidate PII.

**Architecture:** A shared `PERMISSIONS` matrix + `has_permission`/`require_permission` in
`lib/lib/schemas/permissions.py`. A new `resources/team.py` (the contract: authz + tenancy + last-admin
+ audit + DTO) reusing `UserRepository` (extended `User` model: `+status`/`+last_active_at`/`+invited_by`),
`AuditLogRepository`, the token + session services, and the existing notifier seam. `auth.invite_recruiter`
is refactored to **delegate** to the generalized invite (legacy `InviteRecruiter` RPC unchanged). A thin
`TeamServicer` adapts gRPC-web (mirrors `routes/decision.py`). The `/team` page is rebuilt as a roster
reusing `@ip/ui` `Table`/`Select`/`Dialog`/`ConfirmDialog`/`Badge`, fed by a new `@ip/shared/team.ts`.

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** "Commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by `npx pnpm@9.15.0 --filter @ip/company build`
  + `--filter @ip/{ui,shared,api-client} typecheck` (the candidate app is untouched by this module;
  build it too if a shared package changed: `--filter @ip/candidate build`). Never `next build` while
  `pnpm dev` is live.
- **Robustness bar:** validate at boundaries (the invite `email` + `temp_password` + `role` are
  caller input — `role ∈ {recruiter, hiring_manager}`, email normalized, password length-checked);
  trust internal typed calls (no defensive coercion); the invite-email + any in-app "new member" notify
  are **best-effort** (try/except + `get_logger` structured log, never block the mutation — mirror
  `invite_recruiter`'s existing `_send_verification` + the funnel→notifier seam). Follow
  `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) and
  `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Authz reuse + extend (do NOT invent a second primitive):** `require_permission(identity, scope)`
  is the matrix-driven generalization of `_require_manager`. Re-express the existing
  decision/job/rubric guards in terms of it (behavior preserved for the two existing roles). Authorize
  the **action** with `require_permission`; scope the **target member** to `comp_id` with
  `_member_scoped` (the team analogue of `decision._scoped`). Both are required for a mutation.
- **The matrix is the single authority** (`lib`), shared by the admin guard **and** the FE `can()`.
  The server enforces; the FE gating is UX, never trust (same posture as the messaging body cap).
- **Behavior preservation:** the matrix refactor must not change the allow/deny outcome for
  `company_admin`/`recruiter` anywhere (the existing tests are the proof). `hiring_manager` is purely
  additive. `auth.invite_recruiter`'s return dict + `recruiter_invited` audit + legacy RPC are
  unchanged observable behavior.
- **Last-admin invariant** (spec §3.5): a company must always keep ≥1 `active company_admin`. Every
  reducing mutation (`RemoveMember`/`RevokeInvite`/`ChangeRole`-away-from-admin) pre-checks a `count`.
- **No candidate PII / no erasure-cascade entry:** a seat is an **employee** `User`, not a candidate;
  this module touches **no** `CandidateEraser` path. (The assignment's `delete_by_user` is for employee
  offboarding, a separate admin action.)

---

## File structure (new + modified)

```
lib/lib/schemas/
  permissions.py                           (NEW — PERMISSIONS matrix + has_permission + require_permission)
  __init__.py                              (+export PERMISSIONS, has_permission, require_permission)
  enums.py                                 (+ hiring_manager to the Role enum)

src/admin/app/
  model/auth.py                            (+status / +last_active_at / +invited_by on User)
  model/team.py                            (NEW — MemberJobAssignment pydantic model)
  infra/repositories/users.py             (+roster/list_company, +set_status, +set_role, +touch_last_active, +count_active_admins)
  infra/repositories/member_job_assignments.py (NEW — should-have model repo: assign/list_for_member/unassign/delete_by_user)
  infra/db.py                              (+INDEXES: users composite, member_job_assignments)
  resources/permissions.py                 (NEW or re-export — require_permission wrapper over lib; OR import directly from lib)
  resources/team.py                        (NEW — the contract: roster + invite/resend/revoke/remove/change-role + last-admin + audit + DTO)
  resources/auth.py                        (MODIFY — invite_recruiter delegates to the shared generalized invite; verify_email flips company member → active)
  resources/decision.py                    (MODIFY — _require_manager → require_permission("applicant:decide"))
  resources/job.py                         (MODIFY — _require_manager → require_permission("job:post"))
  resources/rubric.py                      (MODIFY — _require_manager → require_permission("applicant:review"/"job:post" per call))
  routes/pb/team.proto                     (NEW) + generated team_pb2*.py (via pnpm gen / buf)
  routes/team.py                           (NEW — TeamServicer, thin adapter)
  routes/web.py                            (+register TeamServicer with users/audit/tokens/sessions/notifier)

src/admin/tests/
  test_permissions.py                      (NEW — table-driven has_permission/require_permission, all role×scope pairs)
  test_resources_team.py                   (NEW — authz, tenancy, invite, lifecycle, change-role, last-admin, DTO)
  test_routes_team.py                      (NEW — servicer status mapping + caller_identity)
  test_resources_auth.py                   (extend — invite_recruiter still returns same dict + recruiter_invited audit after delegating; verify_email flips status)
  test_resources_decision.py / _job.py / _rubric.py  (stay green — the refactor proof; add hiring_manager allow/deny cases)
  conftest.py                              (+fake user repo extensions / fake sessions if the suite uses fakes)

frontend/packages/api-client/src/
  index.ts                                 (+team_pb import/re-export; +TeamService in ApiClients + BOTH clientsFromTransport returns)
frontend/packages/shared/src/
  team.ts                                  (NEW — createTeamClient: listMembers/inviteMember/resendInvite/revokeInvite/removeMember/changeRole + query-key helpers; + can(role, scope) over the shared matrix)
  permissions.ts                           (NEW — the matrix mirrored for the FE: PERMISSIONS + can(); kept in lock-step with lib)
  index.ts                                 (+export createTeamClient, can, MemberDTO, the role/scope types)
frontend/apps/company/
  app/team/page.tsx                        (REBUILD — roster Table + invite Dialog + per-row ConfirmDialog actions; admin-gated; reuses @ip/ui)
  components/team-roster.tsx               (NEW — the roster Table + role Select + status Badge + actions, fed by useQuery)
  components/invite-member-dialog.tsx      (NEW — the invite modal: email + role Select + temp password)
```

**Responsibilities (one job each):** `lib/.../permissions.py` = the matrix + the two pure helpers
(the single authority). `resources/team.py` = all team logic (authz/tenancy/last-admin/lifecycle/
audit/DTO). `routes/team.py` = gRPC adapter only. `resources/auth.py` = the shared generalized invite
(both `invite_recruiter` and `team.invite_member` call it). `team.ts` = transport + query keys + `can()`.
`team-roster.tsx` / `invite-member-dialog.tsx` = the `/team` presentation, reusing `@ip/ui`.

---

## TIER A — the matrix + the guard (pure-logic, shared, fully unit-tested)

### Task 1 — `Role.hiring_manager` + the `PERMISSIONS` matrix + `require_permission`
**Files:** Modify `lib/lib/schemas/enums.py`, `lib/lib/schemas/__init__.py`; Create
`lib/lib/schemas/permissions.py`; Test `src/admin/tests/test_permissions.py`.
**Deliverable:** the third role exists; the matrix + `has_permission`/`require_permission` exist and are
exhaustively tested.

- [ ] **Step 1 — add the role:** `hiring_manager = "hiring_manager"` to `Role` (StrEnum) in
  `lib/lib/schemas/enums.py`. (Additive; no existing value changes.)
- [ ] **Step 2 — failing matrix tests** (`test_permissions.py`, table-driven): assert
  `has_permission(role, scope)` for **every** (role, scope) pair — `company_admin` holds all 8 scopes;
  `recruiter` holds `{job:post, job:template, applicant:review, applicant:decide, messaging:send,
  analytics:view}` and **not** `{team:manage, branding:edit}`; `hiring_manager` holds **only**
  `{applicant:review, messaging:send, analytics:view}`; a `candidate`/unknown role → **False for every
  scope**; a bogus scope string → False for every role. Then `require_permission`: a granted scope
  passes silently; a missing scope raises `ForbiddenError` containing the scope; a candidate identity
  is rejected for every company scope.
- [ ] **Step 3 — run** `(cd src/admin && ../../.venv/bin/python -m pytest tests/test_permissions.py -v)` → FAIL.
- [ ] **Step 4 — implement** `lib/lib/schemas/permissions.py` exactly per spec §3.3:
  `PERMISSIONS: dict[Role, frozenset[str]]`, `has_permission(role: str, scope: str) -> bool` (wrap
  `Role(role)` in `try/except ValueError → False` so an unknown role string is safe), and
  `require_permission(identity, scope)` raising `ForbiddenError(f"Missing permission: {scope}")` (import
  `ForbiddenError` from where the admin app defines it — if `lib` cannot import `app.errors`, define
  `require_permission` in `src/admin/app/resources/permissions.py` over `lib`'s `has_permission`, and
  keep only the matrix + `has_permission` in `lib`; decide at execution which import direction is clean
  — **prefer the matrix + `has_permission` in `lib` and the `require_permission` wrapper in admin** to
  avoid `lib`→`app` coupling). Export the matrix + helpers from `lib/lib/schemas/__init__.py`.
- [ ] **Step 5 — run → PASS; gate green** (`bash scripts/check.sh`).

### Task 2 — re-express the existing guards over the matrix (behavior-preserving refactor)
**Files:** Modify `resources/decision.py`, `resources/job.py`, `resources/rubric.py`; the existing
`test_resources_decision.py` / `_job.py` / `_rubric.py` are the proof (extend, don't rewrite).
**Deliverable:** the three duplicated `_MANAGER_ROLES` collapse into the matrix; the two existing roles'
allow/deny outcomes are **unchanged**; `hiring_manager` is correctly allowed/denied.

- [ ] **Step 1 — keep the existing tests green first.** Run the current decision/job/rubric suites and
  confirm green (the baseline to preserve).
- [ ] **Step 2 — replace the guards** (one commit's worth — "refactor: route company guards through the
  permissions matrix"):
  - `resources/decision.py`: `_require_manager(identity)` → `require_permission(identity,
    "applicant:decide")` at its call sites (decide + override-gate). **Same allow set today**
    (admin+recruiter); hiring_manager (new) is correctly **denied** decide.
  - `resources/job.py`: the manager guard → `require_permission(identity, "job:post")` for create/
    edit/open/close. Same allow set today; hiring_manager denied.
  - `resources/rubric.py`: pick the scope per call — **reads** (list/get a rubric) → `applicant:review`
    (so hiring_manager can view), **writes** (create/edit) → `job:post` (admin+recruiter only). Audit
    each call site's intent at execution; default a write to the stricter scope.
  - Delete the now-unused `_MANAGER_ROLES` constants + the local `_require_manager` defs (the matrix is
    the single source). Remove now-unused imports.
- [ ] **Step 3 — add the new-role cases** to the existing suites: a `hiring_manager` identity is
  **denied** `decide_application` / job-post (→ `ForbiddenError`) and **allowed** the review reads.
  Confirm `candidate` is still denied everywhere and `company_admin`/`recruiter` still pass exactly as
  before.
- [ ] **Step 4 — gate green.** (This task is the safety net: if any existing decision/job/rubric test
  flips, the refactor changed behavior — stop and reconcile.)

---

## TIER B — the seat model + the team resource (the core; pure-logic, fully unit-tested)

### Task 3 — extend `User` + `UserRepository` + the assignment model + indexes
**Files:** Modify `model/auth.py`, `infra/repositories/users.py`, `infra/db.py`; Create
`model/team.py`, `infra/repositories/member_job_assignments.py`.
**Deliverable:** the seat fields + roster/lifecycle repo methods + the should-have assignment model all
exist; indexes declared.

- [ ] **Step 1 — extend `User`** (`model/auth.py`, additive + default-safe per spec §3.1):
  `status: Literal["active", "pending", "revoked"] = "pending"`,
  `last_active_at: datetime | None = None`, `invited_by: str | None = None`. (Existing fields
  unchanged; defaults make every old doc valid — a legacy company user with no `status` reads as the
  field default; **note** the backfill consideration in Step 5.)
- [ ] **Step 2 — `UserRepository` methods** (extend, mirror the existing `set_email_verified`/
  `anonymize` style):
  - `list_company(comp_id, *, limit)` → `find_capped({"comp_id": comp_id})` (roster; the resource sorts/
    clamps).
  - `set_status(user_id, status)` → `$set status`.
  - `set_role(user_id, role)` → `$set role`.
  - `touch_last_active(user_id, when)` → `$set last_active_at` (best-effort; called from login/refresh).
  - `count_active_admins(comp_id)` → `count_documents({"comp_id": comp_id, "role":
    "company_admin", "status": "active"})` (the last-admin invariant's source of truth).
  - `revoke_seat(user_id)` → `$set {status: "revoked", password_hash: ""}` (the soft tombstone; sessions
    are revoked separately by the resource via the session service).
- [ ] **Step 3 — `MemberJobAssignment`** (`model/team.py`) per spec §3.1: `comp_id`, `user_id`,
  `job_id`, `created_at` default-now, `assigned_by`. And `MemberJobAssignmentRepository`
  (`collection="member_job_assignments"`): `assign(assignment)`, `list_for_member(user_id)`,
  `unassign(user_id, job_id)`, `delete_by_user(user_id)`.
- [ ] **Step 4 — indexes** in `infra/db.py` `INDEXES` (the single index authority; the `users`
  `email`-unique + `comp_id` indexes already exist):
```python
# team — roster reads + the last-admin count
IndexSpec("users", [("comp_id", 1), ("role", 1), ("status", 1)]),
# per-job scoping (should-have; the model ships in the core increment, enforcement deferred)
IndexSpec("member_job_assignments", [("user_id", 1), ("job_id", 1)], {"unique": True}),
IndexSpec("member_job_assignments", "comp_id"),
IndexSpec("member_job_assignments", "user_id"),
```
- [ ] **Step 5 — legacy backfill note (decide at execution):** existing company `User` docs predate
  `status`. Options: (a) rely on the pydantic default at read time (a doc with no `status` is treated
  as its default — but the default is `pending`, which would mislabel an existing **active** admin); or
  (b) a tiny **one-shot backfill** stamping every existing `comp_id`-bearing user `status="active"`
  (they're already verified/in-use). **Prefer (b)** — a `migrate_*`-style idempotent update (mirror the
  marketplace `posted_at` backfill pattern the audit calls for) so the roster shows existing members as
  `active`, not `pending`. Document the migration in the task.
- [ ] **Step 6 — gate:** `bash scripts/check.sh` green (models/repos are import-only; no behavior yet).

### Task 4 — `resources/team.invite_member` + `auth.invite_recruiter` delegation (TDD)
**Files:** Create `resources/team.py`; Modify `resources/auth.py`; Test `tests/test_resources_team.py`,
extend `tests/test_resources_auth.py`.
**Interfaces — Produces:** `async invite_member(identity, email, role, temp_password, *, users,
tokens, notifier, nonces=None, audit=None) -> dict` (the new member DTO). **Consumes:**
`require_permission`, the shared `_invite_company_user` internals.

- [ ] **Step 1 — failing tests** (mirror `test_resources_auth`/`test_resources_decision` style;
  fakes/in-memory repos):
  - an **admin** invites a `recruiter` → a `pending` `User` is created (`comp_id` from the caller,
    `status="pending"`, `email_verified=False`, `invited_by=identity["id"]`), the verification email is
    sent (assert against the fake notifier), a `member_invited` audit row is written.
  - an admin invites a `hiring_manager` → same, with `role=hiring_manager`.
  - an **invalid role** (`company_admin` or `candidate` via invite) → `ValidationError`.
  - a **duplicate email** → `ConflictError` (reused from `invite_recruiter`'s normalize+check).
  - a **non-admin** caller (recruiter/hiring_manager/candidate) → `ForbiddenError` (the
    `require_permission("team:manage")` gate).
  - **legacy compat:** `auth.invite_recruiter(...)` (unchanged signature) still returns the **same
    dict** (`{id, email, role: "recruiter", comp_id, email_verified: False}`) and writes the
    **`recruiter_invited`** audit (NOT `member_invited`) after delegating.
- [ ] **Step 2 — run → FAIL.**
- [ ] **Step 3 — implement.** Factor a shared private `_invite_company_user(caller, email, role,
  password, *, users, tokens, notifier, nonces, audit, audit_action, invited_by)` in `resources/auth.py`
  holding the **existing** `invite_recruiter` body (normalize email, duplicate-check, `hash_password`,
  insert `User(role=…, comp_id=caller["comp_id"], status="pending", invited_by=…)`, `_send_verification`,
  audit). Then:
  - `auth.invite_recruiter` becomes: `caller = identity_from_token(token, ...)`; `if caller["role"] !=
    company_admin → ForbiddenError`; `return await _invite_company_user(caller, email, Role.recruiter,
    password, …, audit_action="recruiter_invited", invited_by=caller["id"])`. (Behavior unchanged.)
  - `resources/team.invite_member(identity, email, role, temp_password, …)`:
    `require_permission(identity, "team:manage")`; validate `role ∈ {recruiter, hiring_manager}` else
    `ValidationError`; `return await _invite_company_user(identity, email, role, temp_password, …,
    audit_action="member_invited", invited_by=identity["id"])`. **No duplicated invite logic.**
- [ ] **Step 4 — run → PASS; gate green.**

### Task 5 — `list_members` + `resend_invite` + `revoke_invite` + `remove_member` + `change_role` + last-admin (TDD)
**Files:** Modify `resources/team.py`; Modify `resources/auth.py` (`verify_email` flips status); Test
`tests/test_resources_team.py`, extend `tests/test_resources_auth.py`.
**Interfaces — Produces:** `list_members(identity, *, users, page, page_size)`,
`resend_invite(identity, user_id, *, users, tokens, notifier, nonces, audit)`,
`revoke_invite(identity, user_id, *, users, sessions, audit)`,
`remove_member(identity, user_id, *, users, sessions, audit)`,
`change_role(identity, user_id, role, *, users, sessions, audit)`.

- [ ] **Step 1 — failing tests:**
  - `list_members`: an admin gets only **their `comp_id`'s** members (desc by `created_at`), page-size
    **clamped**; the DTO is a **strict subset** (id, email, role, status, last_active_at, invited_by —
    **no `password_hash`**, grep-test). A non-admin caller → `ForbiddenError`.
  - **`_member_scoped`:** every per-member mutation rejects a **cross-tenant/forged `user_id`** →
    `NotFoundError` (the target's `comp_id != identity["comp_id"]`).
  - `revoke_invite` (a **pending** member): `status → "revoked"`, `password_hash` blanked, the member's
    sessions revoked (assert `sessions.revoke_user(user_id)`), `member_invite_revoked` audit.
  - `remove_member` (an **active** member): `status → "revoked"`, blanked, sessions revoked,
    `member_removed` audit.
  - `resend_invite` (a **pending** member): re-sends the verification email (assert notifier),
    `member_invite_resent` audit; an **active** member → `ConflictError`/no-op (decide; lean
    `ConflictError("Already active")`).
  - `change_role`: changes the role (`set_role`) + `member_role_changed` audit; **demotion force-revoke**
    decision (spec §6 open item) — for v1 lean: a demotion (privilege reduction) revokes sessions, a
    promotion does not (assert accordingly, or assert "no session revoke on promotion" only and flag the
    demotion choice at execution).
  - **Last-admin invariant** (the central guardrail): `remove_member`/`revoke_invite`/`change_role`-
    away-from-admin on the **only** `active company_admin` → `ValidationError("Cannot remove the last
    admin")`; the **same** op **succeeds** when a second active admin exists; promoting a second admin
    then removing the first is allowed.
  - **`verify_email` lifecycle:** a `pending` company member who verifies flips to `status="active"`
    (extend `verify_email`); a candidate verifying is unaffected (no `status` on candidates / stays as
    default — assert candidates don't get a spurious company status).
- [ ] **Step 2 — run → FAIL → implement → PASS:**
  - `_member_scoped(identity, target_user_id, users)`: load the target, raise `NotFoundError` unless
    `target.get("comp_id") == identity["comp_id"]`; return the target. (The team analogue of
    `decision._scoped`.)
  - `_guard_last_admin(identity, target, users)`: only when `target` is an `active company_admin` **and**
    the op drops them — `if await users.count_active_admins(identity["comp_id"]) <= 1: raise
    ValidationError("Cannot remove the last admin")`.
  - each mutation: `require_permission(identity, "team:manage")` → `target = await
    _member_scoped(...)` → (for reducing ops) `_guard_last_admin(...)` → mutate via the repo (+ revoke
    sessions where specified) → `audit.insert(AuditLog(entity="user", entity_id=user_id, action=…,
    comp_id=identity["comp_id"]))`. Reuse the helpers; no duplicated authz.
  - `verify_email` (in `resources/auth.py`): after `set_email_verified`, if the user is a **company
    role** (`role in {company_admin, recruiter, hiring_manager}`), also `users.set_status(sub,
    "active")`. (Candidates unaffected.)
- [ ] **Step 3 — gate green.**

### Task 6 — best-effort `last_active_at` + (optional) "new member" notify
**Files:** Modify `resources/auth.py` (login/refresh touch last-active); optionally `resources/team.py`
(notify other admins). Test: extend the relevant suites.

- [ ] **Step 1 — last-active stamp (best-effort):** in `login` (and optionally `refresh`), after a
  successful auth, call `users.touch_last_active(user_id, now)` wrapped in `try/except Exception:
  log.warning(...)` so a stamp failure never blocks login (display-only field). Assert: a successful
  login stamps `last_active_at`; a `touch_last_active` that raises does **not** fail the login.
- [ ] **Step 2 — (optional, cross-reference) "new member" notify:** if the notifications-center
  increment (`…-notifications-center.md`) has landed, `invite_member` best-effort calls `notify_event(
  user_id=<other admins>, comp_id, kind="member_invited", link="/team")` after the durable insert
  (swallow + log). If it hasn't landed, **skip** — this is a nicety, not a dependency; flag at handoff.
  (No new `_MESSAGES` key is required for the core; add `member_invited` to the center's map only if
  Step 2 is built.)
- [ ] **Step 3 — gate green.**

---

## TIER C — transport: the gRPC-web service (proto → servicer → register)

### Task 7 — `team.proto` + generate the client
**Files:** Create `routes/pb/team.proto`; run the generator.
**Deliverable:** `team_pb2.py` / `team_pb2_grpc.py` (admin) + the TS client generated for `@ip/api-client`.

- [ ] **Step 1 — `team.proto`** (`package admin.team.v1`; mirror `decision.proto` shape):
```proto
service TeamService {
  rpc ListMembers(ListMembersRequest) returns (ListMembersResponse);
  rpc InviteMember(InviteMemberRequest) returns (MemberDTO);
  rpc ResendInvite(ResendInviteRequest) returns (MemberDTO);
  rpc RevokeInvite(RevokeInviteRequest) returns (MemberDTO);
  rpc RemoveMember(RemoveMemberRequest) returns (MemberDTO);
  rpc ChangeRole(ChangeRoleRequest) returns (MemberDTO);
}
message MemberDTO {
  string id = 1; string email = 2; string role = 3; string status = 4;
  string last_active_at = 5; string invited_by = 6;
}
message ListMembersRequest { int32 page = 1; int32 page_size = 2; }
message ListMembersResponse { repeated MemberDTO members = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message InviteMemberRequest { string email = 1; string role = 2; string temp_password = 3; }
message ResendInviteRequest { string user_id = 1; }
message RevokeInviteRequest { string user_id = 1; }
message RemoveMemberRequest { string user_id = 1; }
message ChangeRoleRequest { string user_id = 1; string role = 2; }
```
- [ ] **Step 2 — generate** the Python stubs (same toolchain as the existing `pb/*` — buf/protoc) and
  the TS client via `npx pnpm@9.15.0 --filter @ip/api-client gen`. (Both are committed-style generated
  artifacts; regenerate, don't hand-edit.)
- [ ] **Step 3 — gate green** (generated stubs import cleanly).

### Task 8 — `TeamServicer` (TDD — thin adapter) + register
**Files:** Create `routes/team.py`; Modify `routes/web.py`; Test `tests/test_routes_team.py`.
**Interfaces — Consumes:** `resources/team.*`, `caller_identity`, `_STATUS` (from `routes/auth`).

- [ ] **Step 1 — failing servicer tests** (mirror the decision/aptitude servicer tests):
  `ListMembers` returns the `MemberDTO` list for an admin; `InviteMember` 200 returns the `MemberDTO`;
  `ResendInvite`/`RevokeInvite`/`RemoveMember`/`ChangeRole` shapes; **status mapping** via `_STATUS`
  (Forbidden→PERMISSION_DENIED, NotFound→NOT_FOUND, Validation→INVALID_ARGUMENT,
  Conflict→ALREADY_EXISTS); `caller_identity` enforced (no token → UNAUTHENTICATED).
- [ ] **Step 2 — implement** `TeamServicer(decision-style)`: each RPC `try`s `identity = await
  caller_identity(context, self._tokens)`, calls the resource with injected repos (`users`, `audit`,
  `tokens`, `sessions`, `notifier`), maps the result to the proto message, and `except AuthDomainError`
  → `self._abort(context, exc)`. **No authz/tenancy logic in the servicer** — it only adapts. A
  `None`/empty `last_active_at`/`invited_by` maps to `""` (proto has no null).
- [ ] **Step 3 — register in `routes/web.py`:** add
  `team_pb2_grpc.add_TeamServiceServicer_to_server(TeamServicer(users=UserRepository(db),
  audit=AuditLogRepository(db), tokens=tokens, sessions=sessions, notifier=<the existing notifier the
  auth servicer receives>, nonces=<as auth uses>), app)`. Add the `team_pb2_grpc` import to the `pb`
  import block. (Thread the **same** `sessions` + `notifier` + `nonces` the `AuthService` already
  receives, so revoke + verification-email reuse the existing wiring.)
- [ ] **Step 4 — run → PASS; gate green.**

---

## TIER D — frontend: the `/team` roster (reuse `@ip/ui`)

> **Grounding (read before coding).** Every authed read/write goes through `useAuth().api` (the typed
> `ApiClients`). The current `/team` page (`frontend/apps/company/app/team/page.tsx`) already gates on
> `identity?.role !== "company_admin"` (keep that gate) and uses `useMutation` + `toast` + `@ip/ui`
> `Card`/`Field`/`Input`/`Button`/`Badge`/`PageHeader`. The roster adds `@ip/ui` `Table`/`Select`/
> `Dialog`/`ConfirmDialog` (confirmed to exist). `useQuery`/`queryClient.invalidateQueries`/`toast`/
> `LoadingState`/`ErrorState`/`EmptyState` are the established building blocks (see
> `applicants-table.tsx`, `jobs/[id]/page.tsx`). lucide icons are **imported in the app**, never
> re-exported through `@ip/ui` (the lucide-must-be-in-app memo). The team client wraps the **gRPC-web
> `ApiClients`**, so it is built per-render (`useMemo(() => createTeamClient(api), [api])`), not a
> module singleton.

### Task 9 — `@ip/shared/team.ts` + `permissions.ts` + api-client wiring
**Files:** Create `frontend/packages/shared/src/team.ts`, `frontend/packages/shared/src/permissions.ts`;
Modify `frontend/packages/shared/src/index.ts`, `frontend/packages/api-client/src/index.ts`.
**Interfaces — Produces:** `createTeamClient(api: ApiClients)` returning `{ listMembers, inviteMember,
resendInvite, revokeInvite, removeMember, changeRole, listQueryKey }`; `can(role, scope)` + the
`PERMISSIONS` mirror; type `MemberDTO` re-exported from `@ip/api-client`'s generated `team_pb`.

- [ ] **Step 1 — api-client (after `pnpm gen`):** in `frontend/packages/api-client/src/index.ts` add
  the generated `team_pb` to (a) the import block, (b) the `export * from "./gen/team_pb.js"` re-export
  list, (c) the `ApiClients` interface as `team: Client<typeof TeamService>`, and (d) **both**
  `clientsFromTransport`'s return object — mirroring `decisions`/`recommendations` exactly.
- [ ] **Step 2 — `permissions.ts`** (the FE mirror of the `lib` matrix, kept in lock-step — spec §3.3):
  `export const PERMISSIONS: Record<Role, ReadonlySet<string>>` with the **same** three role→scope sets,
  and `export function can(role: string, scope: string): boolean` (mirrors `has_permission`: unknown
  role → false). Add a comment: *"Keep in lock-step with `lib/lib/schemas/permissions.py` — the server
  is the authority; this gates UI only."* (A tiny duplication is accepted to keep `@ip/shared` free of a
  Python dependency; the matrix is small and changes rarely.)
- [ ] **Step 3 — `team.ts`** (mirror the `create*Client` factory shape of `interview.ts`/`jd.ts`):
  `listQueryKey = () => ["team", "members"] as const`; `listMembers()` → `api.team.listMembers({})` →
  `res.members`; `inviteMember(email, role, tempPassword)` → `api.team.inviteMember({ email, role,
  tempPassword })`; `resendInvite/revokeInvite/removeMember(userId)` → the matching RPC;
  `changeRole(userId, role)` → `api.team.changeRole({ userId, role })`. Errors surface as connect
  `ConnectError` (the same class `errorMessage`/`isCode` classify) — **no try/except here**; the React
  layer renders the error.
- [ ] **Step 4 — barrel + typecheck:** export `createTeamClient`, `can`, `PERMISSIONS`, and re-export
  `MemberDTO` from `frontend/packages/shared/src/index.ts`; run `npx pnpm@9.15.0 --filter @ip/api-client
  typecheck` then `--filter @ip/shared typecheck` green (api-client first — shared depends on its
  generated types).

### Task 10 — the `/team` roster page (rebuild)
**Files:** Create `frontend/apps/company/components/team-roster.tsx`,
`frontend/apps/company/components/invite-member-dialog.tsx`; Rebuild
`frontend/apps/company/app/team/page.tsx`.

- [ ] **Step 1 — `TeamRoster` component** (`"use client"`, `team-roster.tsx`): `const { api, identity }
  = useAuth(); const team = useMemo(() => createTeamClient(api), [api]);` then `useQuery({ queryKey:
  team.listQueryKey(), queryFn: team.listMembers })`. Render a `@ip/ui` `Table`:
  - **Columns:** Member (email; append a "(you)" marker when `m.id === identity?.id`), Role (an `@ip/ui`
    `Select` bound to `m.role`, options `company_admin`/`recruiter`/`hiring_manager`; `onValueChange`
    calls `team.changeRole(m.id, next)` with optimistic update → `invalidateQueries(listQueryKey())` on
    success, rollback + `toast.error(errorMessage)` on failure), Status (a `Badge`: `active`→
    `tone="success"`, `pending`→`tone="warning"`, `revoked`→`tone="muted"`), Last active (relative time
    from `m.last_active_at`, else "Invited"/"—"), Actions.
  - **Actions per row** behind `@ip/ui` `ConfirmDialog`: **Resend** (`status === "pending"`),
    **Revoke** (`status === "pending"`), **Remove** (`status === "active"`). Each calls the matching
    client method then `invalidateQueries(listQueryKey())`; `toast` on success/error. Revoked rows show
    no actions.
  - **Last-admin disable:** compute `activeAdmins = members.filter(m => m.role === "company_admin" && m.status === "active").length`; when a row is the **only** active admin, **disable** its Remove +
    its Role `Select`'s non-admin options with a tooltip ("A company needs at least one admin"). The
    server enforces this too (§3.5) — disabling avoids a pointless round-trip.
  - **States:** `LoadingState` while the query loads; `ErrorState` + retry on error; (no empty state —
    the admin is always a row).
  - lucide icons imported **in the app**: `Trash2` (remove), `Send` (resend), `ShieldCheck`/`Ban`
    (revoke). Dark-mode via the token classes (no raw colors).
- [ ] **Step 2 — `InviteMemberDialog` component** (`invite-member-dialog.tsx`): an **Invite member**
  `Button` (`leadingIcon={UserPlus}`) opening an `@ip/ui` `Dialog` with **Email** (`Input`, the
  existing `EMAIL_RE` validation), **Role** (`Select`, default `recruiter`, options recruiter/
  hiring_manager — **not** company_admin via invite, matching the server), **Temporary password**
  (`Input`, 8-char min, the existing validation). Submit → `team.inviteMember(email, role, password)`
  via `useMutation`; on success close the dialog, `invalidateQueries(listQueryKey())` (the new
  `pending` row appears), `toast.success("Invited")`; on error `toast.error(errorMessage)`. The
  client-side validation mirrors the page's current regex + length checks (the server stays authority).
- [ ] **Step 3 — rebuild `app/team/page.tsx`:** keep the `CompanyShell` + `PageHeader` + the
  **admin-only gate** (`identity?.role !== "company_admin"` → the existing "Admins only" `Alert`).
  Replace the always-open invite form + session badge list with: the `InviteMemberDialog` trigger
  (top-right of the header area) + the `TeamRoster` table below. Drop the now-dead `invited`
  session-state, the inline form, and the `api.auth.inviteRecruiter` call (the dialog uses
  `api.team.inviteMember`).
- [ ] **Step 4 — verify build:** `npx pnpm@9.15.0 --filter @ip/company build` green; `--filter
  @ip/{ui,shared,api-client} typecheck` green (`@ip/ui` untouched — its passing typecheck proves no
  accidental coupling). Manual open shows **no console errors**, the roster renders the admin as the
  lone active row, the invite dialog opens, and a role `Select` change round-trips.
- [ ] **Step 5 — full gate + FE builds + typechecks green; update `HANDOFF.md` + memory.** Run `bash
  scripts/check.sh` + `npx pnpm@9.15.0 --filter @ip/company build` + `--filter @ip/{ui,shared,api-client}
  typecheck` (+ `--filter @ip/candidate build` if a shared package changed). Flag at handoff: (a) the
  per-job scoping **enforcement** is deferred (should-have) — only the model shipped; (b) whether the
  "new member" notify was wired to the real `notify_event` or skipped (depends on the notifications-
  center increment ordering); (c) the **demotion force-revoke** choice (§6) as built.

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**). All team logic is
   pure-Python over injected repos — fully unit-tested offline; no network in the gate.
2. **Matrix (the authority, offline):** `test_permissions.py` proves `has_permission` for **every**
   role×scope pair (admin all; recruiter all-but-team/branding; hiring_manager review/message/analytics;
   candidate/unknown → none) + `require_permission` raises with the scope.
3. **Behavior-preserving refactor (the safety net):** the existing decision/job/rubric suites stay
   green after `_require_manager` → `require_permission(scope)` (same allow/deny for the two existing
   roles); new cases prove `hiring_manager` is denied decide/post and allowed review.
4. **Team resource (the core, offline):** `test_resources_team.py` proves `team:manage` gating
   (non-admin → Forbidden), `_member_scoped` tenancy (cross-tenant `user_id` → NotFound), invite (the
   right role/status/`invited_by` + email + `member_invited` audit), lifecycle (revoke/remove → revoked
   + session-revoke + blanked hash + audit; resend re-emails), change-role (+ audit), the **last-admin
   invariant** (only-admin remove/revoke/demote → ValidationError; succeeds with a second admin), and
   the strict-subset `MemberDTO` (no `password_hash`).
5. **Legacy compat:** `test_resources_auth.py` proves `invite_recruiter` still returns the same dict +
   writes `recruiter_invited` after delegating; `verify_email` flips a pending company member to active
   (candidates unaffected).
6. **Transport:** `test_routes_team.py` proves `_STATUS` mapping + `caller_identity` + that the servicer
   holds **no** authz logic.
7. **Frontend:** `@ip/{ui,shared,api-client}` typecheck + the company build green (`@ip/ui` untouched —
   its passing typecheck proves no accidental coupling). The roster renders active/pending/revoked rows
   + the three role badges; the invite `Dialog` submits; a role `Select` change is optimistic + rolls
   back on error; the last-admin Remove is **disabled**. (Hook logic exercised against a fake
   `ApiClients`; no network.)
8. **Manual / local E2E (Chrome via preview):** an admin opens `/team` → sees themselves as the lone
   `active` admin; invites a `hiring_manager` → a `pending` row + an invite email in the
   `LoggingNotifier` sink; the invitee verifies → flips to `active`; the admin changes their role to
   `recruiter`; the admin tries to remove **themselves** as the last admin → blocked (tooltip + server
   `ValidationError`); a second admin is promoted, the first is removed → succeeds + their session is
   revoked (logged out on next refresh).

## Resolved gaps (completeness audit 2026-06-19)

Folds the `2026-06-19-v2-completeness-audit.md` Part A "core" #2 ("Team & roles/permissions depth")
into this build. Each maps to concrete tasks above; the design rationale is in
`…-team-and-permissions-design.md` (§3.1–§3.7).

- [ ] **RBAC matrix (admin/recruiter/hiring-manager)** — `PERMISSIONS` in `lib` (Task 1), documented as
  a table in the design (§3.2); shared by the admin guard + FE `can()` (Task 9 Step 2).
- [ ] **`require_permission(scope)` extends the role guards** — the matrix-driven generalization of
  `_require_manager` (Task 1) adopted across decision/job/rubric (Task 2, behavior-preserving — the
  existing tests are the proof).
- [ ] **Seat management (active/pending/revoked + last-active)** — the seat = a company `User` +
  `status`/`last_active_at`/`invited_by` (Task 3); `ListMembers` roster + the five lifecycle mutations
  (Tasks 4–5); `revoked` is a soft tombstone (session-revoke + blank hash).
- [ ] **Extend the existing invite (keep the token approach)** — `InviteMember` generalizes
  `invite_recruiter` (a shared `_invite_company_user`, reusing the verification-token path verbatim);
  `invite_recruiter` delegates, legacy RPC + `recruiter_invited` audit unchanged (Task 4).
- [ ] **Per-job scoping (should-have)** — the `member_job_assignments` model + indexes ship in the core
  (Task 3); the `job:scoped` marker + assignment editor + **read-path enforcement** are **should-have,
  deferred** (design §3.6) — flagged at handoff (Task 10 Step 5).
- [ ] **`TeamService` + `/team` roster upgrade** — the gRPC-web servicer (Tasks 7–8) + the roster page
  rebuilt with `@ip/ui` `Table`/`Select`/`Dialog`/`ConfirmDialog`/`Badge` (Tasks 9–10).
- [ ] **Robustness: every mutation admin-gated + comp-scoped + audited + can't-remove-last-admin** —
  `require_permission("team:manage")` + `_member_scoped` + `AuditLog` on every mutation +
  `_guard_last_admin` (count of `active company_admin`) on the reducing ops (Tasks 5, 8).
- [ ] **No compliance-triggering features** — pure org/RBAC; no ID/background/biometric data; a seat is
  an employee `User`, untouched by the candidate-erasure cascade (no `CandidateEraser` entry).

## Risks / re-verify at execution

- **`lib`→`app` import direction.** `ForbiddenError` lives in `src/admin/app/errors.py`; `lib` must not
  import `app`. **Plan:** keep the **matrix + `has_permission`** in `lib` (pure, dependency-free) and
  the **`require_permission` wrapper** (which raises `ForbiddenError`) in `src/admin/app/resources/
  permissions.py` over `lib`'s `has_permission`. Re-confirm the cleanest split at execution (Task 1
  Step 4).
- **Behavior-preserving guard refactor.** If **any** existing decision/job/rubric test flips after the
  `_require_manager` → `require_permission` swap, the refactor changed behavior — **stop and reconcile**
  (the two existing roles must map to identical allow/deny outcomes; only `hiring_manager` is new).
- **Legacy `status` backfill.** Existing company users predate `status`; the pydantic default is
  `pending`, which would mislabel an active admin. **Plan:** a one-shot idempotent backfill stamping
  existing `comp_id`-bearing users `active` (Task 3 Step 5) — mirror the marketplace `posted_at`
  backfill the audit calls for. Don't rely on the read-time default for existing members.
- **Last-admin under concurrency.** The pre-check `count` has a vanishingly-small double-demote race
  (spec §6). v1 uses the pre-check; the conditional-update/txn hardening is **flagged, not built** —
  re-confirm accept-and-document at execution.
- **Role-change latency.** A re-roled member keeps old scopes until their access token refreshes (no
  token schema change). The **demotion force-revoke** choice (revoke sessions on privilege reduction)
  is the v1 lean (spec §6) — confirm at execution and assert accordingly (Task 5 Step 1).
- **Proto/codegen drift.** The TS client must be regenerated (`pnpm gen`) after `team.proto`;
  hand-editing generated files will drift. Re-confirm the generator toolchain matches the existing
  `pb/*` artifacts.
- **FE matrix duplication.** `@ip/shared/permissions.ts` mirrors the `lib` matrix (to keep `@ip/shared`
  Python-free). Keep them in lock-step; the server is the authority, so a stale FE matrix only mis-gates
  UI affordances, never authz. Flag if the matrix grows (consider generating the FE copy from `lib`).
- **Notifications-center ordering.** The optional "new member" notify depends on `notify_event`
  (`…-notifications-center.md`). If not landed, **skip** it (Task 6 Step 2) — it's a nicety, not a
  dependency; flag at handoff.
- **Per-job scoping enforcement is NOT built here** (should-have, design §3.6). Do not add read-path
  assignment filtering in this increment; ship only the model + indexes + repo. Leave the company read
  repos/resources untouched so the enforcement bolts on cleanly later.
