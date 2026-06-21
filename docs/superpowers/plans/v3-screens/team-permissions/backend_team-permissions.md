# Team & permissions — Backend contract (v3 · frozen)

> **Screen.** `/company/team` team-and-permissions admin surface. **FE consumer:** [`frontend_team-permissions.md`](./frontend_team-permissions.md).
> **Status:** **EXISTING — reuse `admin.team.v1.TeamService`** + the shared **RBAC matrix** in
> `lib`. Restated from [`../../v2-screens/team-permissions.md`](../../v2-screens/team-permissions.md)
> §A. The Aperture Pro v3 redesign is **appearance-only** — no proto delta, no new collection, no
> new endpoint beyond what v2 already ships.
> **Anti-fiction reminder:** Aptura is pre-launch. The roster renders only what `ListMembers`
> returns; never auto-fill a fake invite email or temp-password "for demo purposes". The matrix is
> sourced from the real `PERMISSIONS` constant; never fabricate scopes. See the anti-fiction rule
> in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **mock.** The roster + invite code against `makeTeamClient()` (fixtures
> + a lifecycle that appends a pending row, flips to revoked, etc.). Swapping mock → real binds to
> `api.team.*` after `pnpm gen` — the components are unchanged. The FE `PERMISSIONS` / `can()`
> mirror is a UX-only copy of `lib/lib/schemas/permissions.py` (server is the authority).

## Functionalities

- **List** the company's seats (roster): every member with role + status (active / pending /
  revoked) + last-active + invited-by.
- **Invite** a new member (`recruiter` / `hiring_manager` only) with a temp password → a `pending`
  seat + verify email.
- **Resend** a pending invite; **revoke** a pending invite; **remove** an active member; **change
  role** — each `team:manage`-gated, comp-scoped, audited, **last-admin-protected**.
- **Render** the read-only RBAC matrix (role × scope) — sourced from the same `PERMISSIONS` the
  server enforces.

## Service & RPCs

`admin.team.v1.TeamService` (gRPC-web). Every mutation is **`team:manage`-gated** (⇒ `company_admin`
only) + **`comp_id`-scoped** (target member must belong to the caller's company; cross-tenant
`user_id` → `NOT_FOUND`) + **audited**. `comp_id` derived from the **token, never the request**.

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| Roster | `TeamService.ListMembers({ page, pageSize }) → { members: MemberDTO[], page, pageSize, total }` | EXISTING | `team:manage` (⇒ `company_admin` only); own `comp_id`; `pageSize` clamped |
| Invite | `TeamService.InviteMember({ email, role, tempPassword }) → MemberDTO` | EXISTING | `team:manage`; `role ∈ {recruiter, hiring_manager}` |
| Resend | `TeamService.ResendInvite({ userId }) → MemberDTO` | EXISTING | `team:manage` + `_member_scoped` |
| Revoke | `TeamService.RevokeInvite({ userId }) → MemberDTO` | EXISTING | gated + scoped; **last-admin guarded** |
| Remove | `TeamService.RemoveMember({ userId }) → MemberDTO` | EXISTING | gated + scoped; **last-admin guarded** |
| Change role | `TeamService.ChangeRole({ userId, role }) → MemberDTO` | EXISTING | gated + scoped; **last-admin guarded** |

- **Auth/scope.** Bearer; **company-admin only** (the `team:manage` scope ⇒ only `company_admin`
  holds it). The **action** is authorized with `require_permission("team:manage")`; the **target
  member** is scoped to the caller's `comp_id` with `_member_scoped` (cross-tenant `user_id` →
  `NOT_FOUND`). Both required for a mutation. A seat is an **employee** `User` (no candidate PII;
  untouched by the `CandidateEraser` cascade).

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`MemberDTO`**: `{ id: string, email: string, role: "company_admin"|"recruiter"|"hiring_manager",
  status: "active"|"pending"|"revoked", lastActiveAt: string /*ISO or ""*/, invitedBy: string /*"" when absent*/ }`.
  **Strict subset — no `passwordHash`** (grep-test on the servicer enforces this invariant).
- **`ListMembersRequest`**: `{ page: number, pageSize: number }` → **`ListMembersResponse`**:
  `{ members: MemberDTO[], page, pageSize, total: bigint }` (page-size clamped; desc by `created_at`).
- **`InviteMemberRequest`**: `{ email: string, role: "recruiter"|"hiring_manager", tempPassword: string }`
  → the new `pending` `MemberDTO`.
- **`ResendInviteRequest` / `RevokeInviteRequest` / `RemoveMemberRequest`**: `{ userId: string }`
  → `MemberDTO`.
- **`ChangeRoleRequest`**: `{ userId: string, role: "company_admin"|"recruiter"|"hiring_manager" }`
  → `MemberDTO`.
- **FE mock shape** (`apps/company/app/team/types.ts`): the `TeamClient` interface
  (`listMembers` / `inviteMember` / `resendInvite` / `revokeInvite` / `removeMember` /
  `changeRole` / `listQueryKey`) satisfied by both `makeTeamClient()` (mock) and
  `createTeamClient(api)` (real). The matrix mirror:
  ```ts
  export const SCOPES = [
    "jobs:write", "applicant:review", "messaging:send",
    "analytics:view", "team:manage", "branding:edit",
    "rubrics:write", "decision:override",
  ] as const;
  export const PERMISSIONS: Record<CompanyRole, ReadonlySet<string>> = {
    company_admin:   new Set(SCOPES),
    recruiter:       new Set(SCOPES.filter(s => s !== "team:manage" && s !== "branding:edit")),
    hiring_manager:  new Set(["applicant:review", "messaging:send", "analytics:view"]),
  };
  export const can  = (role: CompanyRole, scope: string) => PERMISSIONS[role].has(scope);
  export const ROLE_LABELS: Record<CompanyRole, string> = { ... };
  export const isLastAdmin = (members: MemberDTO[], row: MemberDTO) =>
    row.role === "company_admin" && row.status === "active" &&
    members.filter(m => m.role === "company_admin" && m.status === "active").length <= 1;
  ```

## Data required

- **Collection:** `users` (employee seats) — extended `User` (`+status` default `pending` /
  `+last_active_at` / `+invited_by`). Composite index `("comp_id",1), ("role",1), ("status",1)`
  (roster reads + the last-admin count). `member_job_assignments` model ships (per-job scoping
  enforcement **deferred**). A one-shot backfill stamps existing `comp_id`-bearing users
  `status="active"`.
- **RBAC matrix (the single authority):** `lib/lib/schemas/permissions.py` —
  `PERMISSIONS: dict[Role, frozenset[str]]` over 8 scopes; `company_admin` all 8, `recruiter`
  all-but-`{team:manage, branding:edit}`, `hiring_manager`
  `{applicant:review, messaging:send, analytics:view}`. `require_permission` wrapper in
  `src/admin/app/resources/permissions.py`.
- **Also:** `AuditLogRepository` (every mutation audited:
  `member_invited` / `_invite_resent` / `_invite_revoked` / `_removed` / `_role_changed`); token
  + session services (demotion / removal / revoke → `sessions.revoke_user`); the notifier seam
  (best-effort verify email).

## Errors & edge cases

- **Last-admin invariant** (the central guardrail): a company must keep ≥1 **active
  `company_admin`**. Every reducing mutation pre-checks `count_active_admins(comp_id) > 1` for the
  only-admin target → else `INVALID_ARGUMENT("Cannot remove the last admin")`. The FE disables
  the affordance to avoid a pointless round-trip; the server is the real guard.
- **`InviteMember`**: bad `role` → `INVALID_ARGUMENT`; duplicate email → `ALREADY_EXISTS`.
- **`ResendInvite`** on an active member → `ALREADY_EXISTS`.
- **Cross-tenant `user_id`** → `NOT_FOUND` (comp-scoping enforced via `_member_scoped`).
- **Non-admin caller** → `PERMISSION_DENIED` server-side; the shell already redirects, so this
  only fires if the gate is bypassed.
- **No empty state** — the admin is always a row. Mutation failures surface via
  `toast.error(errorMessage(err))`.

## Cross-references

- Restated contract: [`../../v2-screens/team-permissions.md`](../../v2-screens/team-permissions.md) §A.
- RBAC matrix authority: `lib/lib/schemas/permissions.py` (the FE `can()` is a UX-only mirror,
  kept in lock-step). The same `require_permission(scope)` re-expresses the existing decision /
  job / rubric guards (behavior-preserving).
- Pillar: [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md) TIER A–D.
- Shared enum: `Role` (gains `hiring_manager`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
