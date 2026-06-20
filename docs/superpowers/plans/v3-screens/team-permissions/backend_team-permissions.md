# Backend — `team-permissions` (Midnight v3)

> **Screen:** Team & permissions · **FE consumer:** [`frontend_team-permissions.md`](./frontend_team-permissions.md)
> **Status:** **EXISTING — reuse `admin.team.v1.TeamService`** + the shared **RBAC matrix** in `lib`. Restated from [`../../v2-screens/team-permissions.md`](../../v2-screens/team-permissions.md) §A. **No proto delta, no new collection, no new endpoint** — the Midnight redesign is appearance-only; this page consumes the same `TeamService` + `can()` matrix it targets today.
> **Real-vs-mock today:** **mock.** The roster + invite code against `makeTeamClient()` (fixtures + a lifecycle that appends a pending row, flips to revoked, etc.). Swapping mock → real binds to `api.team.*` after `pnpm gen` — the components are unchanged. The FE `PERMISSIONS`/`can()` mirror is a UX-only copy of `lib/lib/schemas/permissions.py` (server is the authority).

## Functionalities
- **List** the company's seats (roster): every member with role + status (active / pending / revoked) + last-active + invited-by.
- **Invite** a new member (recruiter / hiring_manager only) with a temp password → a `pending` seat + verify email.
- **Resend / revoke** a pending invite; **remove** an active member; **change role** — each `team:manage`-gated, comp-scoped, audited, **last-admin-protected**.
- **Render** the read-only RBAC matrix (role × scope) — sourced from the same `PERMISSIONS` the server enforces.

## Service & RPCs (`admin.team.v1` `TeamService`, gRPC-web — every mutation `team:manage`-gated + `comp_id`-scoped + audited)
| Function | RPC | Auth/scope |
|---|---|---|
| Roster | `ListMembers(ListMembersRequest) → ListMembersResponse` | `team:manage` (⇒ `company_admin` only); own `comp_id` |
| Invite | `InviteMember(InviteMemberRequest) → MemberDTO` | `team:manage`; `role ∈ {recruiter, hiring_manager}` |
| Resend | `ResendInvite(ResendInviteRequest) → MemberDTO` | `team:manage` + `_member_scoped` |
| Revoke | `RevokeInvite(RevokeInviteRequest) → MemberDTO` | gated + scoped; **last-admin guarded** |
| Remove | `RemoveMember(RemoveMemberRequest) → MemberDTO` | gated + scoped; **last-admin guarded** |
| Change role | `ChangeRole(ChangeRoleRequest) → MemberDTO` | gated + scoped; **last-admin guarded** |

- **Auth/scope:** bearer; **company-admin only** (the `team:manage` scope ⇒ only `company_admin` holds it). The **action** is authorized with `require_permission("team:manage")`; the **target member** is scoped to the caller's `comp_id` with `_member_scoped` (cross-tenant `user_id` → `NOT_FOUND`). Both required for a mutation. A seat is an **employee** `User` (no candidate PII; untouched by the `CandidateEraser` cascade).

## Request / Response structures (camelCase per protobuf-es on the FE)
- **`MemberDTO`**: `{ id, email, role, status, lastActiveAt, invitedBy }` — `status ∈ {active, pending, revoked}`; `lastActiveAt`/`invitedBy` = `""` when absent (proto has no null). **Strict subset — no `passwordHash`** (grep-test on the servicer).
- **`ListMembersRequest`**: `{ page, pageSize }` → **`ListMembersResponse`**: `{ members: MemberDTO[], page, pageSize, total }` (page-size clamped; desc by `created_at`).
- **`InviteMemberRequest`**: `{ email, role, tempPassword }` (`role ∈ {recruiter, hiring_manager}`) → the new `pending` `MemberDTO`.
- **`ResendInvite/RevokeInvite/RemoveMemberRequest`**: `{ userId }` → `MemberDTO`. **`ChangeRoleRequest`**: `{ userId, role }` → `MemberDTO`.
- **FE mock shape** (`frontend/apps/company/app/team/types.ts`): the `TeamClient` interface (`listMembers`/`inviteMember`/`resendInvite`/`revokeInvite`/`removeMember`/`changeRole`/`listQueryKey`) satisfied by both `makeTeamClient()` (mock) and `createTeamClient(api)` (real). The matrix mirror: `SCOPES` (8), `PERMISSIONS: Record<CompanyRole, ReadonlySet<string>>`, `can(role, scope)`, `ROLE_LABELS`, `isLastAdmin(members, row)`.

## Data required
- **Collection:** `users` (employee seats) — extended `User` (`+status` default `pending` / `+last_active_at` / `+invited_by`). Composite index `("comp_id",1),("role",1),("status",1)` (roster reads + the last-admin count). `member_job_assignments` model ships (per-job scoping enforcement **deferred**). A one-shot backfill stamps existing `comp_id`-bearing users `status="active"`.
- **RBAC matrix (the single authority):** `lib/lib/schemas/permissions.py` — `PERMISSIONS: dict[Role, frozenset[str]]` over 8 scopes; `company_admin` all 8, `recruiter` all-but-`{team:manage, branding:edit}`, `hiring_manager` `{applicant:review, messaging:send, analytics:view}`. `require_permission` wrapper in `src/admin/app/resources/permissions.py`.
- **Also:** `AuditLogRepository` (every mutation audited: `member_invited`/`_invite_resent`/`_invite_revoked`/`_removed`/`_role_changed`); token + session services (demotion/removal/revoke → `sessions.revoke_user`); the notifier seam (best-effort verify email).

## Errors & edge cases
- **Last-admin invariant** (the central guardrail): a company must keep ≥1 **active `company_admin`**. Every reducing mutation pre-checks `count_active_admins(comp_id) > 1` for the only-admin target → else `INVALID_ARGUMENT("Cannot remove the last admin")`. The FE disables the affordance to avoid a pointless round-trip; the server is the real guard.
- `InviteMember`: bad `role` → `INVALID_ARGUMENT`; duplicate email → `ALREADY_EXISTS`. `ResendInvite` on an active member → `ALREADY_EXISTS`. Cross-tenant `user_id` → `NOT_FOUND`.
- **No empty state** — the admin is always a row. Mutation failures surface via `toast.error(errorMessage(err))`.

## Cross-references
- Restated contract: [`../../v2-screens/team-permissions.md`](../../v2-screens/team-permissions.md) §A.
- RBAC matrix authority: `lib/lib/schemas/permissions.py` (the FE `can()` is a UX-only mirror, kept in lock-step). The same `require_permission(scope)` re-expresses the existing decision/job/rubric guards (behavior-preserving).
- Pillar: [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md) TIER A–D. Shared enum: `Role` (gains `hiring_manager`).
