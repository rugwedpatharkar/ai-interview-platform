# Frontend — `team-permissions` (Midnight v3)

> **Screen:** Team & permissions · **Goal:** reskin the existing seat-management screen to the **Midnight Intelligence** `.app` company shell — a **roster table** (member · role · status · last-active · actions), an **invite dialog**, and a read-only **RBAC permission matrix** (role × scope) — **reusing every handler/query/guard verbatim** (presentational only, zero behavior change).
> **Unified route + role:** `/company/team` · company **admin only** (`useRequireRole(["company_admin"])` + the "Admins only" `Alert` fallback are **preserved**). Mounted under the `.app` shell at `/company/*`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/team-permissions.html` (roster `table.data` + status `.pill`s + role `Select` + invite `.btn-primary` + a role×scope matrix card with `✓`/`—` cells).
> **Existing code it reskins:**
> - `frontend/apps/company/app/team/page.tsx` (the admin gate + `makeTeamClient` single client + `PageHeader action={<InviteMemberDialog/>}` + `TeamRoster` + `PermissionMatrix`)
> - `frontend/apps/company/components/team-roster.tsx` (the roster `Table` + role `Select` + status `Badge` + per-row lifecycle actions + last-admin disable)
> - `frontend/apps/company/components/invite-member-dialog.tsx` (the invite modal: email + role `Select` + temp password → `client.inviteMember`)
> - `frontend/apps/company/components/permission-matrix.tsx` (the read-only role×scope grid via `can()`)
> - `frontend/apps/company/app/team/team-client.ts` (`makeTeamClient()` mock; `createTeamClient(api)` real after `pnpm gen`; `isLastAdmin` helper)
> - `frontend/apps/company/app/team/types.ts` (`MemberDTO` / `CompanyRole` / `SCOPES` / `PERMISSIONS` / `can()` / `ROLE_LABELS`)
> - `frontend/apps/company/components/company-shell.tsx` (the `.app` shell + `Team` nav entry, admin-gated — reskinned to Midnight)

## Layout & components
- **Shell:** the `.app` **sidebar + topbar** shell (`CompanyShell`). `Team` is the active `.navitem`. `.page-head` carries "Team & permissions" + sub + a top-right **Invite member** `.btn-primary` (the `InviteMemberDialog` trigger).
- **Roster:** `.table-wrap` → `table.data` — columns **Member** (`.who .nm`/`.sub` for email + "(you)"), **Role** (a `Select` styled to `.input`), **Status** (`.pill .pill-good`/`.pill-warn`/`.pill-neutral` for active/pending/revoked), **Last active** (`.tnum` relative time), **Actions** (`.btn-sm .btn-ghost` Resend/Revoke for pending; `.btn-sm` destructive Remove for active, disabled on the last admin with a tooltip).
- **Invite dialog:** the `@ip/ui` `Dialog` reskinned — `Field`+`Input` (email), role `Select` (recruiter / hiring_manager only), temp-password `Input`, submit `.btn-primary`.
- **Permission matrix:** a `.card` wrapping a `table.data` — rows = the 8 `SCOPES`, columns = the 3 roles, cells = a `✓` (accent) when `can(role, scope)` else a muted `—`.
- **New vs reused:** **no new components** — `CompanyShell`, `TeamRoster`, `InviteMemberDialog`, `PermissionMatrix`, `Table*`, `Select*`, `Dialog*`, `ConfirmDialog`, `Badge`, `Button`, `Field`, `Input`, `Alert`, `PageHeader`, `LoadingState`/`ErrorState`, `toast`, `Tooltip*` all reused; only token classes/markup change. lucide icons stay imported **in the app** (the lucide-must-be-in-app rule).

## Data wiring (kept identical to today)
- **Client/seam:** one stable `makeTeamClient()` per page (`useState(makeTeamClient)`), shared by the roster + dialog so fixture state + invalidation never drift. Swap → `createTeamClient(api)` (binds `api.team.listMembers/inviteMember/resendInvite/revokeInvite/removeMember/changeRole`) after `pnpm gen`.
- **TanStack query key:** `["team","members"]` (via `client.listQueryKey()` so view + invalidation never drift); every mutation `invalidateQueries(listQueryKey())`.
- **Consumes** (`backend_team-permissions.md`): `listMembers()` → `MemberDTO[]` (`id, email, role, status, lastActiveAt, invitedBy`); `inviteMember(email, role, tempPassword)`; `resendInvite/revokeInvite/removeMember(userId)`; `changeRole(userId, role)`. The FE `PERMISSIONS`/`can()` mirror (UX-only) stays in lock-step with `lib/lib/schemas/permissions.py`. **No field added or removed.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/team-permissions.html` against `tokens.css` + `app.css`: the `.app` shell with `Team` active, a `.page-head` with an Invite `.btn-primary`, a `.table-wrap` roster (3 rows: admin active "(you)", recruiter active, hiring-manager pending) with status `.pill`s + role `Select`s + lifecycle `.btn-sm`s (last-admin Remove disabled), and a permission-matrix `.card` (role×scope `✓`/`—`). Browser-verify on the `:4173` preview (dark **and** light). Commit `docs/brand/redesign-v2/team-permissions.html`.
- [ ] **Task 1 — wrap in the shell + keep the gate.** In `team/page.tsx`, keep `CompanyShell`/`PageHeader`/`useRequireRole(["company_admin"])`/the "Admins only" `Alert`/`useState(makeTeamClient)`/the `action` + roster + matrix composition **verbatim**; swap ad-hoc classes → token component classes to match the mockup. Build + browser-verify `/company/team` (admin sees roster; non-admin sees the `Alert`); commit explicit path.
- [ ] **Task 2 — reskin `TeamRoster`.** Swap the `Table`/`Badge`/`Select`/action-button classes for `.table-wrap`/`table.data`/`.pill`/`.btn-sm` to match the mockup. Keep `useQuery(["team","members"])`, the `changeRole`/`resend`/`revoke`/`remove` mutations, the `isLastAdmin` disable + tooltip, and the `ConfirmDialog`s **verbatim**. Build + browser-verify (role change, resend/revoke on pending, remove on active, last-admin Remove disabled); commit.
- [ ] **Task 3 — reskin `InviteMemberDialog`.** Swap the dialog/field/button classes to match the mockup. Keep `EMAIL_RE` validation, the role options (recruiter / hiring_manager), the `inviteMember` `useMutation`, success-close + invalidate + toast **verbatim**. Build + browser-verify (open, submit appends a pending row); commit.
- [ ] **Task 4 — reskin `PermissionMatrix`.** Swap to a `.card` + `table.data` with `✓` (accent) / `—` (muted) cells matching the mockup. Keep `SCOPES`/`ROLES`/`can()` **verbatim** (UX-only mirror). Build + browser-verify the grid; commit.

> **Restyle discipline:** the diff per file is markup/classes only. If a task touches a mutation, the `can()`/`isLastAdmin` logic, the admin gate, or an RPC call — **stop**, it's out of scope. The FE matrix mirror must stay in lock-step with `lib` (a stale copy only mis-gates UI, never authz).

## States & a11y
- **States (preserved, named):** **loading** (`LoadingState` on the roster query); **error** (`ErrorState` + retry; mutation errors → `toast.error(errorMessage)`); **success** (the roster table — **no empty state**, the admin is always a row); **invite** pending/success/error; **last-admin** (the only active `company_admin`'s Remove + role→non-admin are **disabled** with a tooltip; the server still returns `INVALID_ARGUMENT` if bypassed).
- **Responsive:** the roster `table.data` scrolls under `md:`; the invite dialog is a centered modal; the matrix grid scrolls horizontally on narrow screens.
- **Dark + light:** all tokens (`.pill` families carry their own `[data-theme="dark"]` variants; `--accent`/`--ink` for `✓`/`—`) — auto-themes.
- **A11y:** the roster + matrix are real `<table>`s with header cells; role `Select`s are labelled; destructive Remove/Revoke use `ConfirmDialog`; matrix cells carry `aria-label="allowed"/"not allowed"`; the admin gate shows an explanatory `Alert`; focus ring `--accent-strong`; contrast ≥4.5:1.

## Acceptance
- Matches `team-permissions.html`; build/typecheck green; **zero functional diff** (invite/resend/revoke/remove/change-role round-trip; the last-admin invariant is enforced UI-side disabled + server-side; the admin gate is preserved); mock→real path unchanged (flip `makeTeamClient()` → `createTeamClient(api)` only).
