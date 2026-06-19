# Team & Permissions — Design

> **v2 "complete" core module** (Part A #2 of the completeness audit). Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §4 module #1
> (Identity & Access) and §6 (compliance-ready). This systematizes **multi-recruiter orgs**: a roles &
> permissions matrix, seat management, and (should-have) per-job scoping. It **extends the existing
> `InviteRecruiter` flow** (single email + temp-password) into a full roster, and **extends the
> existing role guards** (`_require_manager`) with a `require_permission(scope)` guard. Closes the v2
> completeness audit's Part A "core" #2 (`2026-06-19-v2-completeness-audit.md`). The TDD build is
> `docs/superpowers/v2/2026-06-19-team-and-permissions.md`.
>
> **Status:** design, awaiting review. No production code yet (v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

Today a company workspace is a **flat two-role org**: `register_company` mints exactly one
`company_admin`, and that admin can `InviteRecruiter` — a single `(email, temp-password)` form
(`resources/auth.invite_recruiter`, the `/team` page) that creates a `recruiter` `User` scoped to the
admin's `comp_id`. There is **no roster** (you can't see who's on the team, who's pending, who you
revoked), **no role granularity** (every company user is either the lone admin or an
all-powerful recruiter), **no way to change a role or remove a member**, and **no notion of a
hiring manager** who reviews but can't post or manage the team. For a real multi-recruiter
organization that gap is launch-blocking — hence Part A #2.

Team & Permissions turns the flat org into a **managed team with a permission matrix**:

- A **third role** — `hiring_manager` — between `company_admin` (owns the org) and `recruiter` (runs
  hiring), for someone who **reviews applicants and views analytics but cannot post jobs, decide,
  manage the team, or edit branding**.
- A **permission matrix** mapping each role → a set of **scopes** (`job:post`, `applicant:review`,
  `applicant:decide`, `analytics:view`, `team:manage`, `branding:edit`, …), enforced by a new
  **`require_permission(scope)`** guard that **extends** the existing role guards (it is the
  matrix-driven generalization of `_require_manager`).
- A **roster / seat-management** surface: list team members (**active / pending-invite / revoked**)
  with role + last-active; **invite** (email + role, keeping the existing token approach), **resend**,
  **revoke invite**, **remove member**, and **change role**.
- A **`TeamService`** (gRPC-web on admin) + the company **`/team` page upgraded** from the basic
  invite form to a full roster (Table, role dropdowns, invite modal) reusing `@ip/ui`.
- (Should-have) **per-job scoping** — a recruiter/hiring-manager limited to specific jobs/departments;
  the **data model is designed here**, but **enforcement is marked should-have** (designed, gated, not
  a v1 deliverable — §3.6).

**In scope (v1):**

- **Roles & permissions matrix** (§3.2) — `company_admin` / `recruiter` / **new** `hiring_manager`,
  each mapped to a scope set; documented as a table. The matrix is a **single static map** in `lib`
  (the role enum's home) so admin (guard) and the FE (UI gating) share one source.
- **`require_permission(scope)` guard** (§3.3) — extends the existing `_require_manager`; the matrix
  is the single authority and `_require_manager` is re-expressed in terms of it (behavior preserved).
- **`TeamService`** (§3.4) — `ListMembers` / `InviteMember` / `ResendInvite` / `RevokeInvite` /
  `RemoveMember` / `ChangeRole`, every **mutation `team:manage`-gated (effectively `company_admin`),
  `comp_id`-scoped, and audited**; **can't remove or demote the last admin** (§3.5).
- **Seat lifecycle** (§3.1) — a member is `active` (verified, signed in) / `pending` (invited, not yet
  verified) / `revoked` (access removed); derived from existing `User` fields + a small extension, not
  a parallel store.
- **Extend the invite flow** — `InviteMember` **generalizes `invite_recruiter`** to take a `role`
  (recruiter or hiring_manager), **keeps the verification-token approach verbatim**, and adds the
  audit + roster bookkeeping. The old `InviteRecruiter` RPC stays (thin shim → `InviteMember` with
  `role=recruiter`) so nothing breaks.
- **`/team` page upgrade** (§3.7) — a roster Table (member, role `Select`, status `Badge`,
  last-active), an **invite `Dialog`** (email + role), per-row **resend / revoke / remove** actions
  behind `ConfirmDialog`, all admin-gated. Reuses `@ip/ui` `Table` / `Select` / `Dialog` /
  `ConfirmDialog` / `Badge`.
- **Per-job scoping data model** (§3.6) — a `member_job_assignments` collection (member ↔ job),
  designed + indexed; the scope **`job:scoped`** and the assignment editor are **should-have**, with
  enforcement explicitly deferred.

**Out of scope / explicit non-goals:**

- **No new identity infrastructure** — no external IdP/SCIM, no org hierarchy beyond one flat company
  per `comp_id`, no cross-company users (a `User` belongs to exactly one `comp_id`, unchanged).
- **No compliance-triggering features** — this module is pure org/RBAC management; it adds **no**
  ID/identity verification, background checks, or biometric data (excluded platform-wide, overview
  §2). A role/scope is config, not regulated data.
- **No custom roles / custom scopes in v1** — the three roles + their fixed scope sets are a **static
  matrix**. A "custom role builder" (admin-defined scope sets) is a clean follow-up behind the same
  matrix seam; v1 ships the three.
- **No billing/seat-count enforcement** — `Company.plan` exists but the demo runs free (overview Part
  A #21 "later"); seat *management* (this module) is decoupled from seat *billing* (backlog). No paid
  seat cap is enforced.
- **No SSO-provisioned team members in v1** — SSO auto-provisions **candidates** only today
  (`oauth_login`); inviting a company user stays the explicit email+token path. (SSO-for-employees is
  a later identity item, not this module.)
- **Per-job scoping *enforcement*** — designed (§3.6) but **should-have**; v1 stores assignments and
  exposes the editor only if the should-have lands, and **no read path filters by assignment** until
  then (documented so a reviewer doesn't expect job-level redaction in the core cut).
- **Account-level settings** (2FA, password/email change, session list) — that's the **sibling**
  `…-settings-and-security-design.md` (Part A #1); this module is *team* management, not *self*
  settings. The two are distinct surfaces (admin-manages-others vs. user-manages-self).

---

## 2. Where it fits

```
   Company app ──┐   gRPC-web (authed, admin-gated)   ┌──────────────────────────────────────────┐
   (/team page)  ├──────────────────────────────────►│  ADMIN  (owns MongoDB, source of truth)    │
                 │  ListMembers / InviteMember /       │  • TeamService (NEW servicer)              │
                 │  ResendInvite / RevokeInvite /      │    resources/team.py  ─────────────────────┤
                 │  RemoveMember / ChangeRole          │     require_permission("team:manage")      │
                 ◄──────────────────────────────────── │     _comp_scoped + last-admin guard        │
                                                       │  resources/auth.invite_recruiter  ─────────┤
                                  best-effort notify    │     (generalized: InviteMember reuses it)   │
                                  (invite email) ──────►│  reuse: UserRepository, AuditLog, tokens    │
                                  via the existing      └───────┬───────────────────────┬────────────┘
                                  verification-token seam        │ Mongo                 │ Mongo
                                                                 ▼                       ▼
                                                    users (role + status + last_active)  member_job_assignments
                                                    (comp_id-scoped)                     (should-have, §3.6)

   lib.schemas.permissions  ── the single PERMISSIONS matrix (role → scope set) ──► shared by:
       • admin  require_permission(scope)        (the authz guard)
       • FE     can(role, scope)                 (UI gating: hide actions a role can't do)
```

- **admin owns the team and the mutations.** The browser reaches `TeamService` over the existing
  in-process gRPC-web transport (uvicorn, no proxy) — the same surface as `DecisionService` /
  `AptitudeService`. **No new service**; Team is a new *capability* on admin: one servicer, one
  resource module, one new model (the assignment), reuse of `UserRepository` + `AuditLogRepository` +
  the token service.
- **The resource layer is the contract** (the established convention — `resources/decision.py`,
  `resources/auth.py`). All authz (`require_permission`), tenancy scoping (`comp_id`), the last-admin
  invariant, audit writes, and DTO shaping live in `resources/team.py`; the servicer is a thin
  adapter. **No query/authz logic in the servicer.**
- **The matrix is shared, decided once.** `PERMISSIONS: dict[Role, frozenset[str]]` lives in `lib`
  (next to the `Role` enum, `lib/lib/schemas/`), so the **admin guard** and the **FE UI-gating** read
  the same map. Admin enforces it (the FE gating is convenience, never trust — the server is the
  authority, exactly like the messaging body cap).
- **Identity & Access is untouched at its core.** No change to JWT minting, login, refresh, or the
  `identity` dict shape. The access token already carries `role` + `comp_id`; `require_permission`
  reads `identity["role"]` and consults the matrix — **no token schema change** (a role change takes
  effect on the member's next token refresh; §6).

---

## 3. Design

### 3.1 Data model — seat state derived from `User`, not a parallel store

A "seat" is **a company `User`** (`role in {company_admin, recruiter, hiring_manager}`, a non-null
`comp_id`). v1 does **not** add a `team_members` collection — that would duplicate the user record and
invite drift. Instead it **reuses `users`** and adds two small fields so the roster can show status +
last-active, plus a `revoked` tombstone analogous to the existing `erased` flag:

**`User` (extend `model/auth.py`) — additive, all default-safe:**

| Field | Type | Notes |
|---|---|---|
| `email` | `EmailStr` | (existing) |
| `password_hash` | `str` | (existing) |
| `role` | `Role` | (existing) — now one of three company roles for a seat. |
| `comp_id` | `str \| None` | (existing) — the tenant; non-null for every seat. |
| `email_verified` | `bool` | (existing) — **drives `active` vs `pending`** (an invited member is unverified until they accept). |
| `created_at` | `datetime` | (existing). |
| `erased` | `bool` (implicit, set by anonymize) | (existing tombstone — candidate erasure). |
| **`status`** | `"active" \| "pending" \| "revoked"` (default `"pending"`) | **NEW.** The seat lifecycle (§ below). Defaulting to `pending` is correct for an invited user; `register_company`'s self-signup admin is stamped `active`. |
| **`last_active_at`** | `datetime \| None` (default `None`) | **NEW.** Stamped on login/refresh (best-effort) so the roster shows recency. Display-only; never an authz input. |
| **`invited_by`** | `str \| None` (default `None`) | **NEW.** The admin `user_id` who invited this seat (attribution for the roster + audit). `None` for the self-signup founding admin. |

**Seat status — the three states (derived + explicit):**

| Status | Meaning | How it's set | Can sign in? |
|---|---|---|---|
| `pending` | Invited, not yet accepted (email unverified) | `InviteMember` creates the `User` with `status="pending"` (and `email_verified=False`, as `invite_recruiter` does today) | Login is blocked until verified (existing behavior — an unverified invited user can't complete login the normal way; they must accept via the verification link). |
| `active` | Accepted + in good standing | `register_company` stamps the founder `active`; a `pending` member flips to `active` when they **verify their email** (extend `verify_email` to also set `status="active"` for company roles) | Yes. |
| `revoked` | Access removed by an admin (kept as a tombstone, not deleted) | `RevokeInvite` (pending) / `RemoveMember` (active) sets `status="revoked"`, **revokes their refresh sessions**, and blanks `password_hash` (can't log in) — mirrors the `anonymize` tombstone pattern but **keeps email/role for the audit trail** (a revoked member is not a candidate-erasure) | No. |

> **Why `revoked` is a tombstone, not a delete.** Removing a member must (a) immediately kill their
> live access and (b) leave an auditable record of who was on the team. A hard delete loses the audit
> trail and orphans their authored artifacts (decisions, messages) by `sender_user_id`. So
> `RemoveMember` **soft-revokes** (status flip + session revoke + `password_hash=""`), exactly the
> shape `anonymize` already uses for erased candidates — proven pattern, reused. A future hard-delete
> of fully-offboarded seats is a follow-up, not v1.

**`MemberJobAssignment` (NEW — should-have, §3.6):** `model/team.py`.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Assignment id. |
| `comp_id` | `str` | Tenant. Copied from the member's `User` / the job. |
| `user_id` | `str` | The scoped member. |
| `job_id` | `str` | The job they're allowed to act on. |
| `created_at` | `datetime` | `default_factory` now. |
| `assigned_by` | `str` | The admin who created the assignment (audit). |

A member with **zero** assignment rows is **unrestricted** (sees all of `comp_id`'s jobs — the v1
default for every existing user); a member with ≥1 row is restricted to those jobs **once enforcement
ships**. v1 stores the rows (if the should-have lands) but **does not filter reads by them** (§3.6).

### 3.2 Roles & permissions matrix (the core deliverable)

Three company roles, each a fixed set of **scopes**. A scope is a coarse capability string
(`"{domain}:{action}"`) checked by `require_permission`. The matrix is the **single authority**, in
`lib/lib/schemas/permissions.py` next to the `Role` enum:

| Scope | What it gates | `company_admin` | `recruiter` | `hiring_manager` |
|---|---|:---:|:---:|:---:|
| `job:post` | Create / edit / open / close jobs (`JobService`) | ✅ | ✅ | — |
| `job:template` | Manage job templates (Part A #11, when it lands) | ✅ | ✅ | — |
| `applicant:review` | View applicants, reports, rubrics; open a candidate | ✅ | ✅ | ✅ |
| `applicant:decide` | Record a hire/reject/shortlist decision (`DecisionService`); override the gate | ✅ | ✅ | — |
| `messaging:send` | Message a candidate about an application (`MessagingService`) | ✅ | ✅ | ✅ |
| `analytics:view` | View the funnel / score / assessment analytics | ✅ | ✅ | ✅ |
| `branding:edit` | Edit the company profile / employer branding (Pillar A `company_profiles`) | ✅ | — | — |
| `team:manage` | Invite / remove / change-role / revoke — **all of `TeamService`'s mutations** | ✅ | — | — |
| `job:scoped` *(should)* | Marker that this member's reach is limited to assigned jobs (§3.6) | — | optional | optional |

**Reading the matrix:**

- **`company_admin`** = the org owner: **every** scope, including `team:manage` and `branding:edit`.
  The founding admin (from `register_company`) and any admin they promote.
- **`recruiter`** = runs hiring day-to-day: post jobs, review, decide, message, view analytics — but
  **cannot manage the team or edit branding** (those stay admin-only). This is **exactly today's
  recruiter** (it already can do everything via `_require_manager`), now with branding + team
  explicitly carved out — a **tightening that matches the new admin-only surfaces** (branding/team are
  new in v2; recruiters never had them).
- **`hiring_manager`** = the new reviewer role: **review, message, view analytics** — read-and-discuss,
  but **no post / decide / team / branding**. A hiring manager weighs in on candidates and reads
  reports but doesn't run the requisition. This is the role the audit explicitly calls for
  ("admin vs recruiter vs hiring-manager: post / review / decide / analytics / team").

> **Behavior-preservation note.** `recruiter` keeps every capability it has **today** — `job:post`,
> `applicant:review`, `applicant:decide`, `analytics:view`, `messaging:send`. The only scopes it
> *lacks* are `team:manage` and `branding:edit`, which **did not exist for recruiters before v2** (team
> management is this module; branding is Pillar A, already admin-oriented). So no existing recruiter
> action regresses — the matrix encodes the status quo plus the two new admin-only surfaces. This is
> the §4 "preserve the request/response contract" guarantee made concrete.

### 3.3 `require_permission(scope)` — extend the existing role guards

The codebase authorizes company actions today with `_require_manager(identity)`:

```python
# resources/decision.py / rubric.py / job.py — duplicated today
_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}

def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can ...")
```

`require_permission` is the **matrix-driven generalization** of that guard — same shape, same
`ForbiddenError`, but checks a **scope** against the matrix instead of a hard-coded role set. It lives
in `lib` (next to the matrix) so every resource shares one implementation:

```python
# lib/lib/schemas/permissions.py
from lib.schemas.enums import Role

PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.company_admin: frozenset({
        "job:post", "job:template", "applicant:review", "applicant:decide",
        "messaging:send", "analytics:view", "branding:edit", "team:manage",
    }),
    Role.recruiter: frozenset({
        "job:post", "job:template", "applicant:review", "applicant:decide",
        "messaging:send", "analytics:view",
    }),
    Role.hiring_manager: frozenset({
        "applicant:review", "messaging:send", "analytics:view",
    }),
}

def has_permission(role: str, scope: str) -> bool:
    """True if `role` (a Role value string) is granted `scope`. Unknown role → False
    (a candidate / malformed role can never hold a company scope)."""
    try:
        return scope in PERMISSIONS[Role(role)]
    except ValueError:
        return False
```

```python
# resources/team.py (and adopted by decision/job/rubric — see below)
from lib.schemas.permissions import has_permission

def require_permission(identity, scope):
    if not has_permission(identity["role"], scope):
        raise ForbiddenError(f"Missing permission: {scope}")
```

- **`_require_manager` is re-expressed, not duplicated.** "Manager" = "can review" =
  `applicant:review` (held by all three company roles) for the *read* surfaces, and the stricter
  scope for *write* surfaces. Concretely: `decision.py`'s `_require_manager` becomes
  `require_permission(identity, "applicant:decide")` (only admin+recruiter — **preserves today's
  behavior**, since hiring_manager is new and never had decide); `job.py`'s becomes
  `require_permission(identity, "job:post")` (same set today). The three duplicated `_MANAGER_ROLES`
  definitions collapse into the one matrix. **This is a behavior-preserving refactor** (the existing
  two roles map to the same allow/deny outcomes) **plus** the new role slots in — done as one commit
  per the refactor protocol (§4), with the existing decision/job/rubric tests proving no regression.
- **`require_permission` is the only new authz primitive**, and it *replaces* a hard-coded set with a
  table lookup — strictly less code across the three call sites, not more (the matrix is the dedup).
- **Tenancy is orthogonal and unchanged.** `require_permission` gates *what action*; the existing
  `comp_id` scoping gates *whose data* (`_scoped` / `get_scoped` — the application/job must match
  `identity["comp_id"]`). A team mutation needs **both**: `require_permission(identity, "team:manage")`
  **and** the target member must be in the caller's `comp_id` (§3.4). Neither subsumes the other.

### 3.4 `TeamService` — the roster + seat mutations

A new authed gRPC-web servicer on admin (`routes/team.py`, mirroring `routes/decision.py`), over the
proto pipeline (§3.8). Every RPC reads `identity` via `caller_identity`; **every mutation is
`team:manage`-gated, `comp_id`-scoped, and audited**:

| RPC | Does | Guard | Audit `action` |
|---|---|---|---|
| `ListMembers(ListMembersRequest{})` | Returns the caller's-company roster: `[MemberDTO]` (id, email, role, status, last_active_at, invited_by) — every company `User` with `comp_id == identity["comp_id"]`, desc by `created_at`; page-size **clamped** | `require_permission("team:manage")` (only admins see the full roster + actions) | — (read) |
| `InviteMember(InviteMemberRequest{email, role, temp_password})` | **Generalizes `invite_recruiter`**: validate `role ∈ {recruiter, hiring_manager}`, create a `pending` `User` scoped to `comp_id`, send the **existing** verification email, stamp `invited_by` | `require_permission("team:manage")` | `member_invited` |
| `ResendInvite(ResendInviteRequest{user_id})` | Re-sends the verification email for a `pending` member (no new user); a `409`/no-op if already `active` | `require_permission("team:manage")` + `_member_scoped` | `member_invite_resent` |
| `RevokeInvite(RevokeInviteRequest{user_id})` | Revokes a **pending** invite → `status="revoked"`, blank `password_hash`, revoke sessions | `require_permission("team:manage")` + `_member_scoped` + **not-last-admin** | `member_invite_revoked` |
| `RemoveMember(RemoveMemberRequest{user_id})` | Removes an **active** member → `status="revoked"`, blank `password_hash`, revoke sessions (soft tombstone, §3.1) | `require_permission("team:manage")` + `_member_scoped` + **not-last-admin** | `member_removed` |
| `ChangeRole(ChangeRoleRequest{user_id, role})` | Changes a member's role (e.g. promote recruiter → admin, or admin → hiring_manager); takes effect on their next token refresh | `require_permission("team:manage")` + `_member_scoped` + **not-last-admin** (if demoting an admin) | `member_role_changed` |

- **`_member_scoped(identity, target_user_id, users)`** is the team analogue of `decision._scoped`: it
  loads the target `User` and raises `NotFoundError` unless `target["comp_id"] == identity["comp_id"]`
  — so an admin can **only ever touch members of their own company**. A forged or cross-tenant
  `user_id` is a `NotFoundError`, never a leak (the cross-tenant rejection test, §5).
- **`InviteMember` reuses `invite_recruiter`'s internals verbatim** — the email normalization
  (`strip().lower()`), the duplicate-email `ConflictError`, `hash_password(temp_password)`, the
  `_send_verification` call, and the `AuditLog` write. The **only** generalizations: it takes a
  validated `role` (instead of hard-coding `Role.recruiter`) and stamps `status="pending"` +
  `invited_by`. `invite_recruiter` is **refactored to delegate** to the generalized path with
  `role=Role.recruiter` (so the legacy `InviteRecruiter` RPC keeps working unchanged — §3.9).
- **All mutations audited.** Each writes an `AuditLog(entity="user", entity_id=target_user_id,
  action=…, comp_id=identity["comp_id"])` — the exact shape `invite_recruiter` already uses. The
  roster mutation log is the team's change history (who invited/removed/re-roled whom).
- **The invite email is best-effort on the durable write.** `InviteMember`/`ResendInvite` create/keep
  the row first, then send the verification email through the existing notifier seam; an email failure
  is swallowed + logged (the member exists and can be re-sent), mirroring the funnel→notifier and
  notifications-center posture. The optional "new member" in-app notification (to other admins) routes
  through the **notifications center** (`notify_event`, `kind="member_invited"`) best-effort, **only if
  that increment has landed** — else it's a no-op stub (cross-reference, not a hard dependency).

### 3.5 The last-admin invariant (the central guardrail)

The one rule that protects the org from being locked out: **a company must always have at least one
`active` `company_admin`.** Every mutation that could remove the last admin is blocked:

- **`RemoveMember` / `RevokeInvite` / `ChangeRole`** call a shared
  `_guard_last_admin(identity, target, users)` **before** mutating. It is only consulted when the
  target **is** an `active company_admin` and the operation would drop them (remove, revoke, or
  change-role-away-from-admin). It runs
  `users.count({"comp_id": comp_id, "role": "company_admin", "status": "active"})` and raises
  `ValidationError("Cannot remove the last admin")` (→ `INVALID_ARGUMENT`) when the count is `1` (i.e.
  this target is the only one).
- **Self-demotion / self-removal is allowed only if another admin exists** — the guard makes no
  special case for "is this me"; it purely counts admins. An admin demoting themselves while another
  admin remains is fine; the lone admin trying to demote/remove themselves is blocked by the same
  count. (This also prevents the subtle "two admins, both demote each other concurrently" race — see
  the concurrency note in §6.)
- **`InviteMember` and promotions never trip it** (they can only *add* an admin or a non-admin), so
  the guard is a pure pre-check on the three reducing operations.

> **Why a count, not a flag.** A "this is the primary admin" boolean would drift and need transfer
> logic. Counting `active` admins under `comp_id` is always correct, needs no extra state, and is one
> indexed `count_documents` (the `users.comp_id` index already exists; §3.8 adds the composite). The
> count is the invariant's single source of truth.

### 3.6 Per-job scoping (should-have — designed, enforcement deferred)

The audit asks for "per-job scoping" so a recruiter can be **limited to specific jobs/departments**.
The **data model is designed here** (§3.1 `MemberJobAssignment`); **enforcement is should-have** and
**not in the v1 core cut**. The staged design:

- **The model + indexes ship** in the core increment (cheap, no behavior): a
  `member_job_assignments` collection with a unique `(user_id, job_id)` index and a `comp_id` index.
  A `MemberJobAssignmentRepository` exposes `list_for_member` / `assign` / `unassign` /
  `delete_by_user` (the last for the offboarding + erasure paths).
- **The scope marker `job:scoped`** (§3.2) records *that* a member is restricted. A member with the
  marker **and** ≥1 assignment is, conceptually, limited to those jobs.
- **Enforcement (the should-have, deferred):** when it lands, the company-side **read filters**
  (`JobRepository.list_by_company`, the applicant queue, `DecisionService`) gain an **assignment-aware
  variant** — e.g. `list_by_company` intersects with the member's assigned `job_id`s when the member
  is `job:scoped`. This is a **read-path filter addition**, isolated to those repositories/resources,
  designed to bolt on **without touching** the matrix, the guard, or `TeamService`. Until it ships,
  **every member sees all of `comp_id`'s jobs** (today's behavior, unchanged) — the assignment rows
  are inert metadata.
- **Why deferred, not cut.** Per-job scoping touches **every** company read surface (jobs, applicants,
  analytics, messaging) to be airtight — a meaningful enforcement + test surface that would bloat the
  core RBAC increment. Designing the model now (so the data shape is right and the editor can be built
  early) while deferring enforcement keeps the core cut focused and the should-have a clean, additive
  follow-up. The **enforcement gap is documented**: a reviewer must not expect job-level redaction in
  the core module — only the matrix, the roster, and the three roles.

### 3.7 The `/team` page — roster upgrade (reuse `@ip/ui`)

The current `/team` page (`frontend/apps/company/app/team/page.tsx`) is a single **invite form** +
a session-local "invited this session" badge list, admin-gated by `identity?.role !== "company_admin"`.
v1 upgrades it to a **full roster** while keeping the admin gate and the violet/dark token system:

- **Roster `Table`** (reuse `@ip/ui` `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/
  `TableCell`) fed by `useQuery(team.listQueryKey(), team.listMembers)`. Columns: **Member** (email +
  the "you" marker for the caller), **Role** (an `@ip/ui` `Select` — `company_admin` / `recruiter` /
  `hiring_manager`; changing it calls `ChangeRole` with optimistic update + rollback), **Status** (a
  `Badge`: `active` → `tone="success"`, `pending` → `tone="warning"`, `revoked` → `tone="muted"`),
  **Last active** (relative time from `last_active_at`, or "—"/"Invited" for pending), **Actions**
  (per-row).
- **Invite `Dialog`** (reuse `@ip/ui` `Dialog`) replacing the always-open form: an **Invite member**
  button opens a modal with **Email**, **Role** (`Select`, default recruiter), **Temporary password**
  (the same fields, the same client-side validation — email regex + 8-char min — already on the page),
  submitting `InviteMember`. On success the roster query invalidates so the new `pending` row appears.
- **Per-row actions behind `ConfirmDialog`** (reuse `@ip/ui` `ConfirmDialog` — destructive actions
  must confirm): **Resend invite** (pending only), **Revoke invite** (pending only), **Remove member**
  (active only). Each calls the matching RPC then invalidates the roster. The **last admin's** Remove /
  demote control is **disabled** with a tooltip ("A company needs at least one admin") — the server
  also enforces it (§3.5), but disabling client-side avoids a pointless round-trip.
- **Role/action gating reuses the matrix.** A small FE `can(role, scope)` (mirroring `has_permission`,
  fed by the **same** matrix shape re-exported to `@ip/shared`) hides actions the **caller** can't do —
  but since the whole page is already `team:manage`-gated (admins only), this mostly governs the
  **disabled-last-admin** affordance and future non-admin read views. **The server is the authority**;
  the FE gating is UX.
- **Empty / loading / error states** reuse the established `@ip/ui` `LoadingState` / `EmptyState` /
  `ErrorState` (an empty roster is impossible — the admin themselves is always a row — but the loading
  + error states are standard). lucide icons (`UserPlus`, `Trash2`, `Send`, `ShieldCheck`) are
  **imported in the app**, never re-exported through `@ip/ui` (the lucide-must-be-in-app gotcha).

### 3.8 API surface (proto pipeline) + indexes

The **proto → `pnpm --filter @ip/api-client gen` → `@ip/api-client`** pipeline is the FE contract.
`TeamService` is a `.proto` in `src/admin/app/routes/pb/team.proto`, a thin servicer in
`routes/team.py`, **registered in `routes/web.py`** (a new
`team_pb2_grpc.add_TeamServiceServicer_to_server(...)` block, with `UserRepository(db)`,
`AuditLogRepository(db)`, `tokens`, `sessions`, and the `notifier` dependencies), and the generated TS
client wired into `ApiClients` + **both** `clientsFromTransport` returns in
`frontend/packages/api-client/src/index.ts` (mirroring `decisions`/`recommendations`).

**Indexes** (declared in `infra/db.py` `INDEXES`, the single index authority — the
`users` `email`-unique and `comp_id` indexes already exist):

```python
# team — roster reads + the last-admin count
IndexSpec("users", [("comp_id", 1), ("role", 1), ("status", 1)]),  # roster filter + last-admin count
# per-job scoping (should-have; ships with the model in the core increment)
IndexSpec("member_job_assignments", [("user_id", 1), ("job_id", 1)], {"unique": True}),
IndexSpec("member_job_assignments", "comp_id"),
IndexSpec("member_job_assignments", "user_id"),  # offboarding/erasure delete-by-user
```

The existing `users.comp_id` index already backs a plain roster scan; the composite makes the
**status-filtered roster** and the **last-admin `count`** index-covered.

### 3.9 Backward compatibility — the legacy `InviteRecruiter` path

`InviteRecruiter` (the existing `AuthService` RPC + the `auth.invite_recruiter` resource) **stays**, so
nothing that calls it breaks during the staged build:

- `auth.invite_recruiter` is **refactored to delegate** to the generalized invite path
  (`team.invite_member(..., role=Role.recruiter)` or a shared `_invite_company_user` helper they both
  call) — one implementation, two entry points. Its signature, return dict, audit `action`
  (`recruiter_invited` — preserved for the existing test), and the legacy RPC are **unchanged
  observable behavior** (the new `status="pending"` + `invited_by` fields are additive and default-safe).
- The **`/team` page** moves from calling `api.auth.inviteRecruiter` to `api.team.inviteMember` (with
  a role), but a stale client hitting the old RPC still works. The new RPC is the forward path; the old
  is a thin shim.
- **Erasure cascade unaffected.** Team management adds **no candidate PII** — a seat is an employee
  `User`, not a candidate. The `CandidateEraser` cascade is untouched by this module (the assignment's
  `delete_by_user` is for **employee offboarding**, a separate admin action, **not** the candidate
  erasure path). Documented so a reviewer doesn't expect a cascade entry here.

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **A static `PERMISSIONS` matrix in `lib` (role → scope set)** | One source for the admin guard **and** FE gating; the three roles are fixed for v1; extending a dict is the minimal change | No custom/admin-defined roles in v1; a "custom role builder" is a clean follow-up behind the same matrix seam |
| **`require_permission(scope)` generalizes `_require_manager` (matrix lookup, not a role set)** | The matrix is the dedup — the three duplicated `_MANAGER_ROLES` collapse into one table; **strictly less code** at the call sites; behavior preserved for the two existing roles | One new guard primitive; mitigated by it *replacing* hard-coded sets, with existing decision/job/rubric tests proving no regression |
| **Seat = a company `User` + `status`/`last_active_at`/`invited_by`, not a `team_members` store** | Reuses the proven user record; no duplication/drift; `status` mirrors the existing `erased` tombstone pattern | Three additive fields on `User` (all default-safe); a member's lifecycle lives on the one record |
| **`RemoveMember`/`RevokeInvite` soft-revoke (tombstone), don't hard-delete** | Kills live access (session revoke + blank `password_hash`) **and** keeps the audit trail + authored-artifact references; mirrors `anonymize` | A revoked seat lingers as a row; a future hard-delete of fully-offboarded seats is a follow-up |
| **The last-admin invariant is a `count`, not a flag** | Always correct, no extra state, one indexed `count_documents`; blocks remove/revoke/demote of the only `active` admin | A pre-check on three operations; a concurrent double-demote is closed by the count re-running per call (§6) |
| **`hiring_manager` = review + message + analytics (no post/decide/team/branding)** | Exactly the audit's third role; a reviewer who weighs in without running the requisition | A new role to test across the matrix; existing two roles' outcomes are unchanged |
| **Per-job scoping: model now, enforcement should-have (deferred)** | Designing the data shape early lets the editor be built; enforcement touches every read surface and would bloat the core RBAC cut | Assignment rows are inert until enforcement ships; **documented** so no one expects job-level redaction in the core |
| **Matrix shared to the FE for UI gating, server is the authority** | Hide actions a role can't do (UX) while the resource enforces every scope | FE gating is convenience, never trust — same posture as the messaging body cap (client guard + server authority) |
| **Legacy `InviteRecruiter` kept as a thin shim → generalized invite** | Nothing that calls the old RPC breaks during the staged build; one implementation, two entry points | Two entry points to the same path; the old one is a documented shim, the new is forward |
| **Role change takes effect on next token refresh (no token schema change)** | The access token already carries `role`; no IdP/token re-plumbing; refresh re-reads the user | A re-roled member keeps their old scopes until their short-lived access token refreshes (§6) — acceptable, bounded by the access-token TTL |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (ruff format, lint+security S-rules line-88, pip-audit, pytest ×5);
**baseline 423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter
@ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`
(never `next build` while `pnpm dev` is live).

- **Permissions matrix (`lib`) — pure, exhaustive:** `has_permission` returns the right boolean for
  **every (role, scope) pair** in a table-driven test (admin holds all; recruiter holds all-but-team/
  branding; hiring_manager holds only review/message/analytics); an **unknown/`candidate` role → False
  for every scope** (a candidate can never hold a company scope); a **bogus scope string → False** for
  every role.
- **`require_permission` (guard):** grants pass silently; a missing scope raises `ForbiddenError` with
  the scope in the message; a candidate identity is rejected for every company scope.
- **Behavior-preserving refactor (the central safety check):** the **existing** decision/job/rubric
  tests stay green after `_require_manager` → `require_permission(…)` — the two pre-existing roles map
  to the **same** allow/deny outcomes (admin+recruiter allowed for decide/post; candidate denied).
  Add a case proving **`hiring_manager` is denied `applicant:decide`/`job:post`** (the new carve-out)
  and **allowed `applicant:review`** (the new grant).
- **`resources/team.py` — where most coverage lands (it is the contract):**
  - **Authz:** every mutation requires `team:manage` — a `recruiter`/`hiring_manager`/`candidate`
    caller → `ForbiddenError`; only `company_admin` passes.
  - **Tenancy (`_member_scoped`):** an admin **cannot** touch a member of **another** `comp_id` — a
    cross-tenant/forged `user_id` → `NotFoundError` (the forged-`comp_id` rejection test).
  - **`InviteMember`:** creates a `pending` `User` with the chosen `role` (recruiter **or**
    hiring_manager), `comp_id` from the caller, `invited_by` from the caller, sends the verification
    email, writes the `member_invited` audit; an **invalid role** (`company_admin` via invite, or
    `candidate`) → `ValidationError`; a **duplicate email** → `ConflictError` (reused from
    `invite_recruiter`).
  - **Seat lifecycle:** `verify_email` flips a `pending` company member to `active`; `RevokeInvite`
    (pending) / `RemoveMember` (active) set `status="revoked"`, blank `password_hash`, and **revoke the
    member's sessions** (assert `sessions.revoke_user` called); a revoked member can't log in.
  - **`ChangeRole`:** changes the role + writes the audit; the change is visible on the next
    identity read (no token schema change asserted).
  - **Last-admin invariant:** removing/revoking/demoting the **only** `active company_admin` →
    `ValidationError`; the **same** operation **succeeds** when a second active admin exists; promoting
    a second admin then demoting the first is allowed.
  - **DTO subset:** `MemberDTO` carries no `password_hash` / internal handles — a grep-test that the
    listed shape is a strict subset (email, role, status, last_active_at, invited_by, id only).
- **`TeamService` servicer (`routes/team.py`):** mirror the decision/aptitude servicer tests — `_STATUS`
  mapping (Forbidden→PERMISSION_DENIED, NotFound→NOT_FOUND, Validation→INVALID_ARGUMENT,
  Conflict→ALREADY_EXISTS), `caller_identity` enforced (no token → UNAUTHENTICATED), **no authz logic
  in the adapter**.
- **Legacy compat:** `auth.invite_recruiter` still returns the same dict + writes the
  `recruiter_invited` audit after delegating to the generalized path (the existing auth test stays
  green); the legacy `InviteRecruiter` RPC still works.
- **Per-job scoping (should-have, model-only in core):** the `member_job_assignments` repo round-trips
  `assign`/`list_for_member`/`unassign`/`delete_by_user`; the unique `(user_id, job_id)` index rejects
  a duplicate assignment. **No read-path filter test in the core** (enforcement deferred — a comment
  notes the should-have test surface).
- **Frontend:** `@ip/shared` `can()` typechecks against the shared matrix; the roster page renders a
  fake roster (active/pending/revoked rows, the three role badges), the invite `Dialog` submits, a
  role `Select` change calls `ChangeRole` (optimistic + rollback on error), the last-admin Remove is
  **disabled**; no network in unit tests.
- **Manual / local E2E (Chrome via preview):** an admin opens `/team` → sees themselves as the lone
  `active` admin; invites a `hiring_manager` (email + temp password) → a `pending` row appears + an
  invite email lands in the `LoggingNotifier` sink; the invited user verifies → flips to `active`;
  the admin changes their role to `recruiter` → the badge/Select updates; the admin tries to remove
  **themselves** as the last admin → blocked with the tooltip; a second admin is promoted, then the
  first is removed → succeeds and their session is revoked (they're logged out on next refresh).

---

## 6. Open questions / risks

- **Role-change latency (next-refresh).** A re-roled member keeps their **old** scopes until their
  short-lived **access token** refreshes (the token carries `role`; `require_permission` reads it).
  *Mitigation:* access tokens are short-lived (the refresh cadence bounds the staleness); a **forced**
  re-auth on role change would mean revoking the member's sessions on `ChangeRole` (as remove does) —
  **flagged, not built in v1** (it logs the member out, a heavier UX). **Open:** whether a *demotion*
  (privilege reduction) should force-revoke sessions immediately while a *promotion* can wait for
  refresh — lean "demotion force-revokes, promotion waits" — confirm at planning.
- **Last-admin under concurrency.** Two admins concurrently demoting/removing each other could each
  see `count == 2` and both proceed, leaving zero admins. *Mitigation:* the count re-runs **inside**
  each mutation immediately before the write; for an airtight guarantee a **conditional update**
  (`update_one({comp_id, role: admin, status: active, _id: target}, …)` combined with a re-count, or a
  small transaction) closes the window — **flagged**; v1 uses the pre-check `count` (the race needs two
  simultaneous admin self-demotions, vanishingly rare at demo scale) and documents the conditional-
  update upgrade. **Open:** whether to harden to a txn now or accept-and-document — lean
  accept-and-document for v1.
- **`hiring_manager` and existing read surfaces.** The new role must be **allowed** on the
  review/analytics/messaging reads but **denied** on post/decide/team/branding. *Mitigation:* every
  company read/write guard moves to `require_permission(scope)` (§3.3), so adding the role to the
  matrix automatically grants/denies it everywhere — but each call site must pick the **right scope**
  (review vs decide). **Open:** an audit pass over every `_require_manager` call site to assign its
  exact scope (most are `applicant:review` for reads, `applicant:decide`/`job:post` for writes) —
  enumerated in the plan.
- **Per-job scoping enforcement is deferred.** Until the should-have ships, **every member sees all of
  `comp_id`'s jobs** — the assignment rows are inert. *Mitigation:* documented as should-have (§3.6);
  the read-path filter is isolated to the company read repos/resources so it bolts on without touching
  the matrix/guard/`TeamService`. **Risk if forgotten:** a reviewer expecting job-level redaction in
  the core cut — called out explicitly here.
- **Invite email best-effort.** A failed verification email leaves a `pending` member who never gets
  the link. *Mitigation:* the row is written first (durable), `ResendInvite` re-sends, and the failure
  is logged (never `except: pass`) — same posture as the funnel→notifier and notifications-center seams.
- **Self-service vs admin-only.** v1 makes **all** of `TeamService` admin-only (`team:manage`). A
  recruiter can't even *view* the roster. *Mitigation:* that's the conservative default; a read-only
  "see your teammates" view for non-admins (a `team:view` scope) is a trivial additive follow-up if
  desired — flagged, not built. **Open:** whether non-admins get a read-only roster — lean no for v1.
- **No seat-count/billing enforcement.** Seat *management* is decoupled from seat *billing*
  (`Company.plan` exists, demo runs free). *Mitigation:* documented as backlog (overview Part A #21);
  a future plan-aware `InviteMember` could reject over-cap invites at the same boundary — additive,
  not v1.

---

## Resolved gaps (completeness audit 2026-06-19)

These close the Part A "core" #2 item from the v2 completeness audit
(`2026-06-19-v2-completeness-audit.md` → "Team & roles/permissions depth — Inc 0 / auth — seat
management (active/pending/revoked), an RBAC matrix (admin vs recruiter vs hiring-manager: post /
review / decide / analytics / team), per-job scoping. (Today `InviteRecruiter` is a single email+temp-
password.)"). Each resolution is folded into the sections above.

- **RBAC matrix (admin vs recruiter vs hiring-manager) — RESOLVED (§3.2).** A static
  `PERMISSIONS: dict[Role, frozenset[str]]` in `lib`, documented as a table: `company_admin` (all),
  `recruiter` (post/review/decide/message/analytics — **today's recruiter**, minus the new admin-only
  team/branding), **new `hiring_manager`** (review/message/analytics only). Shared by the admin guard
  and FE gating; the server is the authority.
- **`require_permission(scope)` extends the role guards — RESOLVED (§3.3).** The matrix-driven
  generalization of `_require_manager`; the three duplicated `_MANAGER_ROLES` collapse into the one
  matrix (strictly less code). A behavior-preserving refactor for the two existing roles (proven by the
  existing decision/job/rubric tests) plus the new role.
- **Seat management (active/pending/revoked) — RESOLVED (§3.1/§3.4).** A seat is a company `User` +
  `status`/`last_active_at`/`invited_by`; `ListMembers` returns the roster; `InviteMember` /
  `ResendInvite` / `RevokeInvite` / `RemoveMember` / `ChangeRole` are the lifecycle mutations.
  `revoked` is a soft tombstone (session-revoke + blank `password_hash`) mirroring `anonymize`.
- **Extend the existing invite (keep the token approach) — RESOLVED (§3.4/§3.9).** `InviteMember`
  generalizes `invite_recruiter` to take a `role` while reusing its email-normalize / duplicate-check /
  `hash_password` / `_send_verification` / audit internals **verbatim**; `invite_recruiter` is
  refactored to delegate (legacy `InviteRecruiter` RPC + its `recruiter_invited` audit unchanged).
- **Per-job scoping (should-have) — RESOLVED AS DESIGNED-NOT-ENFORCED (§3.6).** The
  `member_job_assignments` model + indexes ship in the core; the `job:scoped` marker + assignment
  editor + read-path filtering are **should-have**, **enforcement explicitly deferred** (every member
  sees all `comp_id` jobs until it lands) — documented so the gap is visible.
- **`TeamService` + `/team` roster upgrade — RESOLVED (§3.4/§3.7).** A new gRPC-web servicer (every
  mutation `team:manage`-gated, `comp_id`-scoped, audited, last-admin-protected) + the `/team` page
  upgraded from the basic invite form to a full roster (Table, role `Select`, invite `Dialog`,
  per-row `ConfirmDialog` actions) reusing `@ip/ui`.
- **Robustness (admin-gated + audited + comp-scoped + can't-remove-last-admin) — RESOLVED (§3.4/§3.5).**
  Every mutation is `team:manage`-gated **and** `_member_scoped` to `comp_id` **and** writes an
  `AuditLog`; the last-admin invariant (`count` of `active company_admin`) blocks remove/revoke/demote
  of the only admin.
- **No compliance-triggering features — CONFIRMED (§1).** This module is pure org/RBAC management; it
  adds no ID verification, background checks, or biometric data (excluded platform-wide). A role/scope
  is config, not regulated data; a seat is an employee `User`, untouched by the candidate-erasure
  cascade.
