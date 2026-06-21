# Team & permissions — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the team-and-permissions surface at `/company/team` from scratch in the Aperture Pro
design language. The page is the company's seat-management workspace: a **roster table**
(`.table-wrap > table.data` with member · role · status · last-active · per-row permission pills
· actions), an **Invite member** modal, and a read-only **RBAC permission matrix** (role × scope)
below the roster. The backend stays frozen — every `TeamService` RPC (`ListMembers`,
`InviteMember`, `ResendInvite`, `RevokeInvite`, `RemoveMember`, `ChangeRole`) and the shared
`PERMISSIONS` / `can()` matrix are reused verbatim, only the UI is new.

The page is **admin-only**: `useRequireRole(["company_admin"])` blocks recruiters and hiring
managers at the route level, with a truthful "Admins only" fallback that explains why and offers
a link back to the dashboard. The **last-admin invariant** is enforced server-side and mirrored in
the UI: the only active `company_admin`'s Remove and "change role to non-admin" affordances are
disabled with a tooltip.

## Route + role

`/company/team` (`apps/company/app/team/page.tsx`) · **company — ADMIN ONLY**, guarded by
`useRequireRole(["company_admin"])` (the stricter gate; recruiters and hiring managers see the
"Admins only" fallback). The sidebar **Team** nav entry is only rendered for admins.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — the `.app` company shell, `.cell` bento, `.table-wrap > table.data` data tables, `.pill`
  families for status, `.badge` for permission scopes, `.btn.btn-sm` action chips, `.tag` mono
  micro-labels, modal pattern.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design-language demo IS the reference. Task 0 below
captures the screen-specific composition (page head · roster table · permission matrix · invite
modal) as a standalone HTML preview; the React build mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/team/page.tsx` — page body (admin gate composition + roster + matrix)
- `frontend/apps/company/components/team-roster.tsx` — roster table
- `frontend/apps/company/components/invite-member-dialog.tsx` — invite modal
- `frontend/apps/company/components/permission-matrix.tsx` — RBAC grid

What is **NOT** touched: `apps/company/app/team/team-client.ts` (the `makeTeamClient` mock +
`createTeamClient(api)` real swap + `isLastAdmin` helper),
`apps/company/app/team/types.ts` (`MemberDTO`, `CompanyRole`, `SCOPES`, `PERMISSIONS`, `can()`,
`ROLE_LABELS`), `apps/company/components/company-shell.tsx` (the `.app` shell + role gate), the
backend `lib/lib/schemas/permissions.py` matrix (the FE `can()` is a UX-only mirror and must stay
in lock-step), or any `*.proto` / generated `@ip/api-client` types.

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/team/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Team** entry (admin-only) carries `aria-current="page"`. Topbar crumb = `<Company> / Team`. |
| 1 | Page head | `<TeamHead />` | h1.display "Team & permissions" + `.sub` ("Manage who can do what across your company workspace."). Trailing **Invite member** `.btn.btn-primary` (opens the `<InviteMemberDialog />`). |
| 2 | Admin gate | `<AdminGate />` | When the caller is not a `company_admin`, render a `.cell` with a `.tag` mono ("ADMINS ONLY"), a Schibsted h3 "This workspace is admin-managed", a truthful explanation ("Only company admins can change seats and roles. Ask your admin if you need access."), and a Link back to `/company`. The shell already redirects, but this is the in-page fallback if the gate is bypassed. |
| 3 | Roster table | `<TeamRoster />` | One `.cell.tight` wrapping a `.table-wrap > table.data`. Columns: **Member** (`.who .nm` mono email + `.sub` "(you)" when self) · **Role** (`select.input` with curated options — `company_admin` / `recruiter` / `hiring_manager` · `ROLE_LABELS`) · **Status** (`.pill-good` active / `.pill-warn` pending / `.pill` revoked) · **Permissions** (a compact `.badge` cloud showing the first 4 of the 8 scopes that `can(role, scope)` allows, with a "+N more" `.badge` tail when truncated; full list available via tooltip) · **Last active** (`.tnum` relative time, e.g., "2h ago") · **Actions** (`.btn.btn-ghost.btn-sm` Resend / Revoke for pending, `.btn.btn-ghost.btn-sm` destructive Remove for active — disabled on the last admin with a tooltip). The roster has no empty state — the admin is always a row. |
| 4 | Permission matrix | `<PermissionMatrix />` | One `.cell` wrapping a `.table-wrap > table.data`. Rows = the 8 `SCOPES` (label + `.sub` description); columns = the 3 roles (`ROLE_LABELS`). Cells = `✓` (teal `--teal-ink`-on-`--teal-soft`) when `can(role, scope)` is true, `—` (`--ink-3`) otherwise. The matrix is sourced from the shared FE `PERMISSIONS` constant (which mirrors `lib/lib/schemas/permissions.py`); the server is the real authority. |

The `<InviteMemberDialog />` is a centered modal — the `Dialog` primitive from `@ip/ui`,
re-styled to the design language. It carries: an email `Field` + `.input`, a role `select.input`
(curated to `recruiter` / `hiring_manager` only — admins can only invite non-admins from this
modal; promoting to admin is a separate ChangeRole flow), a temp-password `.input` (visible by
default with a "Generate" `.btn-ghost.btn-sm` chip), and a footer with **Cancel** `.btn.btn-ghost`
+ **Send invite** `.btn.btn-primary`.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.btn.btn-primary` | typography + button tokens |
| Admin gate | `.cell` + `.tag` mono + `h3` + `.btn.btn-ghost` | semantic tokens; no scary red — this is a calm explanation, not an error |
| Roster table | `.cell.tight` + `.table-wrap > table.data` | `--surface`, `--line`; `tr:hover` uses `--surface-2` |
| Status pill | `.pill-good` (active) / `.pill-warn` (pending) / `.pill` (revoked) | semantic tokens — never `bg-emerald-*` raw |
| Permission badges | `.badge` cloud (small mono+text combo) | `--surface-2`, `--ink-2`, `--line-2` |
| Action chips | `.btn.btn-ghost.btn-sm` (Resend / Revoke / Remove) | 32px height, 8px radius; Remove tone tinted via `--danger` on hover |
| Last active | `.tnum` (Geist Mono) | `--ink-3` |
| Matrix card | `.cell` + `.table-wrap > table.data` | check cell uses `--teal-soft` background + `--teal-ink` glyph |
| Modal | `Dialog` from `@ip/ui` (re-styled) | `--surface`, `--line`; backdrop = `color-mix(in oklch, var(--ink-deep) 60%, transparent)` |

All new primitives live in `@ip/ui/src/app.css` (one shared file). No new tokens — everything
resolves through the resolved accent (`--teal`) and the resolved base palette. **No
side-stripe borders** on the table rows; use the table's own `tr` border via `--line`.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| Roster | `useAuthedQuery(token, …, () => teamClient.listMembers())` where `teamClient = useState(makeTeamClient)` (single stable client per page so fixture state + invalidation never drift) | `teamClient.listQueryKey()` → `["team","members"]` | `TeamService.ListMembers` (mock today, real after `pnpm gen`) |
| Invite | `useMutation((p) => teamClient.inviteMember(p.email, p.role, p.tempPassword))` → on success: close modal + invalidate `teamClient.listQueryKey()` + `toast.success("Invite sent")` | n/a | `TeamService.InviteMember` |
| Resend | `useMutation((userId) => teamClient.resendInvite(userId))` → invalidate + `toast.success("Invite resent")` | n/a | `TeamService.ResendInvite` |
| Revoke | `useMutation((userId) => teamClient.revokeInvite(userId))` (behind `ConfirmDialog`) → invalidate + `toast.success("Invite revoked")` | n/a | `TeamService.RevokeInvite` |
| Remove | `useMutation((userId) => teamClient.removeMember(userId))` (behind `ConfirmDialog`) → invalidate + `toast.success("Member removed")` | n/a | `TeamService.RemoveMember` |
| Change role | `useMutation((p) => teamClient.changeRole(p.userId, p.role))` → invalidate + `toast.success("Role updated")` | n/a | `TeamService.ChangeRole` |

**Last-admin guard.** Before rendering Remove / "change role to non-admin", call
`isLastAdmin(members, row)` and disable the affordance with a tooltip ("Promote another admin
first — every company keeps at least one admin"). The server returns
`INVALID_ARGUMENT("Cannot remove the last admin")` if bypassed, surfaced via `toast.error`. **The
FE disable is a courtesy; the server is the real guard.**

**Anti-fiction guard.** The roster has no empty state — the admin (= the caller) is always a row.
The matrix is sourced from the real `PERMISSIONS` constant; never fabricate scopes. The Invite
modal must never auto-fill a fake email or a fake temp-password "for demo purposes".

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/team-permissions.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from the
> design language; build the page head + roster (3 sample rows: admin active "(you)", recruiter
> active, hiring-manager pending — clearly labelled "Sample") + matrix + invite modal. Verify in
> both themes at 1440×900 and 390×844 against `D-aperture-pro-{light,dark}-full.jpeg`. Commit the
> new HTML file only.

- **Task 1 — Shell + page head + admin gate.** Mount the page under `CompanyShell` with the
  `useRequireRole(["company_admin"])` gate already provided by the shell. Render `<TeamHead />`
  with the Invite trigger and `<AdminGate />` as the in-page fallback for non-admins. Verify a
  non-admin loading `/company/team` is redirected by the shell; the in-page fallback only fires
  if the redirect is bypassed. Commit `apps/company/app/team/page.tsx`,
  `apps/company/components/team/{team-head.tsx,admin-gate.tsx}`.

- **Task 2 — Roster table.** Build `<TeamRoster />` against the `["team","members"]` query.
  Render the columns above (Member · Role · Status · Permissions · Last active · Actions). Wire
  the Role `select` to the `changeRole` mutation; wire Resend / Revoke / Remove to their
  mutations. Apply the `isLastAdmin` disable + tooltip on the last admin. Use `ConfirmDialog` for
  Revoke and Remove. Verify role change, resend/revoke on pending, remove on active, last-admin
  Remove disabled, and that mutation failures surface via `toast.error`. Commit
  `apps/company/components/team/team-roster.tsx`.

- **Task 3 — Invite modal.** Build `<InviteMemberDialog />` as a centered modal with the email
  `Field`, role `select` (curated to `recruiter` / `hiring_manager`), temp-password `.input`
  (with a "Generate" `.btn-ghost.btn-sm`), and the Cancel / Send invite footer. Validate the
  email client-side (the existing `EMAIL_RE`); the server is the real guard. On success → close
  modal + invalidate the roster + `toast.success`. Verify open / submit appends a pending row;
  duplicate email → `toast.error("Already a member")`; bad role → `toast.error("Invalid role")`.
  Commit `apps/company/components/team/invite-member-dialog.tsx`.

- **Task 4 — Permission matrix.** Build `<PermissionMatrix />` from the `SCOPES` + `ROLES` +
  `can()` constants. Rows = scopes (label + `.sub` description), columns = roles (`ROLE_LABELS`).
  Each cell renders `✓` (teal) or `—` (muted) per `can(role, scope)`. Verify the matrix matches
  the backend `PERMISSIONS` (a stale FE copy only mis-gates UI; the server is the real authz). The
  matrix carries `aria-label="Role permissions matrix"` and per-cell `aria-label="allowed"` /
  `aria-label="not allowed"`. Commit `apps/company/components/team/permission-matrix.tsx`.

- **Task 5 — Page assembly + fidelity verify.**
  1. `apps/company/app/team/page.tsx` mounts `<TeamPermissions />` inside `<CompanyShell>` with
     the admin gate.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a `company_admin`, screenshot `/company/team` in both themes
     at 1440×900 and 390×844 against the Task-0 HTML and the design-language reference. Iterate
     any divergence until 1:1. Commit verify shots under
     `docs/brand/redesign-v3/verify/team-permissions-{light,dark}.jpeg`.
  4. Confirm a non-admin (`recruiter` / `hiring_manager`) is redirected by `CompanyShell`; the
     in-page `<AdminGate />` is the bypass fallback only.
  5. Confirm the mock→real seam flips from `makeTeamClient()` to `createTeamClient(api)` only —
     components unchanged; the same `MemberDTO[]` shape is rendered.

## States & a11y

- **States.** Each region behaves independently:
  - **Loading** — roster renders skeleton rows (4 placeholder rows with shimmer); matrix is
    static (no fetch).
  - **Error** — roster renders `ErrorState` + retry; mutation errors → `toast.error(errorMessage)`.
  - **Success** — roster renders real rows (no empty state — the admin is always a row); the
    matrix renders from the static `PERMISSIONS` constant.
  - **Invite pending / success / error** — Send button shows an inline spinner; success closes
    the modal + invalidates + toasts; error keeps the modal open with the field-level message
    inline.
  - **Last-admin** — the only active admin's Remove and "change role to non-admin" are disabled
    with a tooltip; the server is still the real guard.
  - **Non-admin fallback** — the in-page `<AdminGate />` (calm `.cell`, no scary red) explains
    the gate and offers a Link back to `/company`.
- **Responsive.** Sidebar collapses ≤1000px per the design language. The roster table scrolls
  inside `.table-wrap` under 760px; the matrix scrolls horizontally on narrow screens (column
  widths are intrinsic — no clipped labels). The Invite modal full-screens ≤480px.
- **Dark + light.** All color via tokens; status pills, permission badges, the matrix's
  `✓`/`—` cells, and the modal backdrop resolve cleanly in both themes and inherit per-user
  Appearance accent overrides.
- **A11y.** One `<h1>` per page (the head). `<main>` + `<table>` semantics; the table has real
  `<th scope="col">` headers and `<caption class="sr-only">` ("Team roster"). The role `select`s
  are labelled per-row via `aria-label="Role for <email>"`. Destructive Remove / Revoke use
  `ConfirmDialog` (focus-trapped, ESC-to-close). The matrix carries `aria-label="Role permissions
  matrix"` and per-cell `aria-label`. The modal is `role="dialog"` with `aria-modal="true"`, a
  labelled close, focus trap on open, and ESC-to-close. Touch targets ≥44×44. Contrast ≥4.5:1
  body (`--ink-2` on `--bg`). Focus rings: `:focus-visible` uses `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/team-permissions-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `TeamService` RPCs (`ListMembers`, `InviteMember`, `ResendInvite`,
  `RevokeInvite`, `RemoveMember`, `ChangeRole`), same `teamClient.listQueryKey()`
  (`["team","members"]`), same `isLastAdmin` guard, same `EMAIL_RE` validation, same
  `MemberDTO[]` rendering. The mock→real seam flips from `makeTeamClient()` to
  `createTeamClient(api)` only — components unchanged.
- The FE `can()` mirror is in lock-step with `lib/lib/schemas/permissions.py`; the matrix
  rendering is sourced from the shared constant — never fabricated.
- A non-admin (`recruiter` / `hiring_manager`) loading `/company/team` is still redirected by
  `CompanyShell`'s `useRequireRole(["company_admin"])`; the in-page `<AdminGate />` is the
  bypass-only fallback.
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, the `✓`
  matrix cells, focus rings, and selected-row highlights without a code change.
