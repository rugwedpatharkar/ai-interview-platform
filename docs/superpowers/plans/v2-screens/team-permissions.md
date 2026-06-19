# Screen: Team & Permissions — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 4).
> **Route:** `apps/company/app/team/page.tsx` (ENHANCE — basic invite form → full seat management + RBAC) · **Mockup:** `aptura_team_permissions` · **Pillar:** [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md)
> **Goal:** Turn the bare invite form into a real **roster** — every company member with their **status** (active / invited / revoked) and **role** badge — plus **seat mutations** (invite / resend / revoke / remove / change-role) and a **permission-matrix grid** showing what each role can do. Backed by a new `TeamService` over a shared **RBAC matrix** in `lib`, with a **last-admin guard** so a company can never lock itself out.

This screen follows the **authed-gRPC** pattern: `"use client"` → `useAuth`/`useRequireRole(["company_admin"])` (keep the existing admin gate) → `createTeamClient(api)` (a thin wrapper over the generated `api.team.*` gRPC-web client) → TanStack Query/Mutation → `@ip/ui` `Table`/`Select`/`Dialog`/`ConfirmDialog`/`Badge`. Company app only (the candidate app is untouched).

> **Pillar mapping.** This screen is the **FE/contract slice** of the full [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md) plan (TIER A–D). That plan is the source of truth for the backend: the `PERMISSIONS` matrix + `Role.hiring_manager` + `require_permission` (TIER A), the seat model + `resources/team.py` with the last-admin guard (TIER B), the proto + servicer (TIER C), and the FE client + roster (TIER D). This doc pins the **exact RPC surface + matrix shape + FE mock + the screen's TDD build**, and adds the **permission-matrix grid** (a read-only `can()` table the pillar mentions but doesn't lay out). The backend-shared **RBAC matrix lives in `lib/lib/schemas/permissions.py`** (the single authority); the FE mirrors it in `@ip/shared/permissions.ts` (kept in lock-step — server is the authority, FE gating is UX only).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.team.v1.TeamService` (gRPC-web on admin, in-process) + a shared **RBAC matrix** in `lib`. All team logic (authz / tenancy / last-admin / lifecycle / audit / DTO) lives in `resources/team.py`; the servicer is a thin adapter (mirrors `routes/decision.py`).

**Authoritative build:** [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md) TIER A–C (this contract = its matrix Task 1 + the resource Tasks 4–6 + the proto Task 7 + the servicer Task 8). Implement that plan; this is the **interface freeze**.

### The RBAC matrix (the single authority — `lib`)

```python
# lib/lib/schemas/permissions.py  (NEW — pure, dependency-free; exported from lib/lib/schemas/__init__.py)
from lib.lib.schemas.enums import Role   # Role gains: hiring_manager = "hiring_manager"

# 8 scopes; admin holds all, recruiter all-but-{team:manage, branding:edit}, hiring_manager a read/comms subset.
PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.company_admin:  frozenset({"team:manage", "branding:edit", "job:post", "job:template",
                                    "applicant:review", "applicant:decide", "messaging:send", "analytics:view"}),
    Role.recruiter:      frozenset({"job:post", "job:template", "applicant:review",
                                    "applicant:decide", "messaging:send", "analytics:view"}),
    Role.hiring_manager: frozenset({"applicant:review", "messaging:send", "analytics:view"}),
}

def has_permission(role: str, scope: str) -> bool:
    try:
        return scope in PERMISSIONS.get(Role(role), frozenset())
    except ValueError:           # unknown role string (e.g. "candidate") → no permissions
        return False

# require_permission(identity, scope) raising ForbiddenError lives in src/admin/app/resources/permissions.py
# (lib must not import app.errors) — it wraps has_permission. See the pillar Task 1 Step 4.
```

- `company_admin` → all 8 scopes. `recruiter` → all **except** `team:manage` + `branding:edit`. `hiring_manager` (**new**) → only `{applicant:review, messaging:send, analytics:view}`. `candidate`/unknown → none. The matrix is **behavior-preserving** for the two existing roles (the existing decision/job/rubric guard tests are the proof — pillar Task 2) and adds `hiring_manager` purely.

### RPCs (every mutation `team:manage`-gated, `comp_id`-scoped, audited, last-admin-protected)

```proto
// src/admin/app/routes/pb/team.proto  — package admin.team.v1  (mirror decision.proto shape)
service TeamService {
  rpc ListMembers(ListMembersRequest) returns (ListMembersResponse);
  rpc InviteMember(InviteMemberRequest) returns (MemberDTO);
  rpc ResendInvite(ResendInviteRequest) returns (MemberDTO);
  rpc RevokeInvite(RevokeInviteRequest) returns (MemberDTO);
  rpc RemoveMember(RemoveMemberRequest) returns (MemberDTO);
  rpc ChangeRole(ChangeRoleRequest) returns (MemberDTO);
}
message MemberDTO {
  string id = 1; string email = 2; string role = 3; string status = 4;   // status: active | pending | revoked
  string last_active_at = 5; string invited_by = 6;                       // empty string when absent (proto has no null)
}
message ListMembersRequest  { int32 page = 1; int32 page_size = 2; }
message ListMembersResponse { repeated MemberDTO members = 1; int32 page = 2; int32 page_size = 3; int32 total = 4; }
message InviteMemberRequest { string email = 1; string role = 2; string temp_password = 3; }  // role ∈ {recruiter, hiring_manager}
message ResendInviteRequest { string user_id = 1; }
message RevokeInviteRequest { string user_id = 1; }
message RemoveMemberRequest { string user_id = 1; }
message ChangeRoleRequest   { string user_id = 1; string role = 2; }
```

### Field semantics + validation (boundary = contract surface)

| RPC | Request | Response | Validation / behavior |
|---|---|---|---|
| `ListMembers` | `page`, `page_size` | `members[]`, paging | `require_permission("team:manage")`; only the caller's `comp_id`; desc by `created_at`; page-size **clamped**; DTO is a **strict subset** (id/email/role/status/last_active_at/invited_by — **no `password_hash`**, grep-test). |
| `InviteMember` | `email`, `role`, `temp_password` | `MemberDTO` (the new `pending` member) | `team:manage`-gated; `role ∈ {recruiter, hiring_manager}` else `INVALID_ARGUMENT`; normalize email; duplicate → `ALREADY_EXISTS`; create a `pending` `User` (`comp_id` from caller, `email_verified=false`, `invited_by=caller`), send the verification email (best-effort), audit `member_invited`. Delegates to the shared `_invite_company_user` (same body `auth.invite_recruiter` uses). |
| `ResendInvite` | `user_id` | `MemberDTO` | `team:manage` + `_member_scoped` (cross-tenant `user_id` → `NOT_FOUND`); a **pending** member → re-send the verify email, audit `member_invite_resent`; an **active** member → `ALREADY_EXISTS` ("Already active"). |
| `RevokeInvite` | `user_id` | `MemberDTO` | gated + scoped; a **pending** member → `status="revoked"`, blank `password_hash`, `sessions.revoke_user`, audit `member_invite_revoked`; **last-admin guarded**. |
| `RemoveMember` | `user_id` | `MemberDTO` | gated + scoped; an **active** member → `status="revoked"`, blank hash, `sessions.revoke_user`, audit `member_removed`; **last-admin guarded**. |
| `ChangeRole` | `user_id`, `role` | `MemberDTO` | gated + scoped; `set_role` + audit `member_role_changed`; a **demotion** (privilege reduction) revokes sessions, a promotion doesn't (v1 lean — flag at execution); **last-admin guarded** when changing the only admin away from `company_admin`. |

- **Last-admin invariant** (the central guardrail): a company must always keep ≥1 **active `company_admin`**. Every reducing mutation (`RemoveMember` / `RevokeInvite` / `ChangeRole`-away-from-admin) pre-checks `count_active_admins(comp_id) > 1` for the only-admin target → else `INVALID_ARGUMENT("Cannot remove the last admin")`. The same op **succeeds** once a second active admin exists.
- **Auth/scope:** bearer; **company-admin only** (the `team:manage` scope ⇒ only `company_admin` holds it). `caller_identity` enforced on every RPC. The **action** is authorized with `require_permission("team:manage")`; the **target member** is scoped to the caller's `comp_id` with `_member_scoped` (the team analogue of `decision._scoped`). Both required for a mutation. No candidate PII; a seat is an **employee** `User` (untouched by the `CandidateEraser` cascade).
- **Backed by:** `resources/team.py` over `UserRepository` (extended `User`: `+status` (`active`/`pending`/`revoked`, default `pending`) / `+last_active_at` / `+invited_by`; `+list_company`/`+set_status`/`+set_role`/`+touch_last_active`/`+count_active_admins`/`+revoke_seat`), `AuditLogRepository`, the token + session services, the existing notifier seam. The should-have **`member_job_assignments`** model + repo + indexes ship (per-job scoping **enforcement deferred**). `auth.invite_recruiter` refactors to **delegate** to the shared `_invite_company_user` (legacy `InviteRecruiter` RPC + `recruiter_invited` audit unchanged). `verify_email` flips a pending company member → `active`. Existing decision/job/rubric guards re-expressed over `require_permission(scope)` (behavior-preserving).
- **Collections/indexes:** `users` gains a composite `IndexSpec("users", [("comp_id",1),("role",1),("status",1)])` (roster reads + the last-admin count). `member_job_assignments`: `[("user_id",1),("job_id",1)]` unique + `comp_id` + `user_id` (model ships; enforcement deferred). A one-shot **backfill** stamps existing `comp_id`-bearing users `status="active"` (so the roster shows them active, not the `pending` default — mirror the marketplace `posted_at` backfill).
- **Proto/REST file:** `src/admin/app/routes/pb/team.proto` (NEW) → generated `team_pb2*.py` (admin) + `team_pb.ts` (`@ip/api-client`, via `pnpm gen`). Servicer `src/admin/app/routes/team.py`; registered in `routes/web.py` (thread the **same** `sessions`/`notifier`/`nonces` the `AuthService` already receives). Matrix in `lib/lib/schemas/permissions.py`; `require_permission` wrapper in `src/admin/app/resources/permissions.py`.
- **Pillar cross-ref:** [team-and-permissions](../../v2/2026-06-19-team-and-permissions.md) — matrix Task 1, refactor Task 2, seat model Task 3, resource Tasks 4–6, transport Tasks 7–8, the FE client + roster Tasks 9–10 (this doc supersedes those FE tasks with the roster + matrix-grid build).

**FE mock shape** (`apps/company/app/team/types.ts`) — the FE codes against this until `pnpm gen` exposes `api.team.*` (camelCase per protobuf-es: `lastActiveAt`, `invitedBy`, `tempPassword`, `userId`, `pageSize`):

```ts
export type MemberStatus = "active" | "pending" | "revoked";
export type CompanyRole = "company_admin" | "recruiter" | "hiring_manager";
export interface MemberDTO {
  id: string; email: string; role: CompanyRole; status: MemberStatus;
  lastActiveAt: string;   // ISO, or "" when never active / still pending
  invitedBy: string;      // user id, or "" for original members
}
// The interface the roster codes against — the real client (createTeamClient(api)) and the
// mock (makeMockTeamClient()) both satisfy it, so component code never changes at integration.
export interface TeamClient {
  listMembers(): Promise<MemberDTO[]>;
  inviteMember(email: string, role: Exclude<CompanyRole, "company_admin">, tempPassword: string): Promise<MemberDTO>;
  resendInvite(userId: string): Promise<MemberDTO>;
  revokeInvite(userId: string): Promise<MemberDTO>;
  removeMember(userId: string): Promise<MemberDTO>;
  changeRole(userId: string, role: CompanyRole): Promise<MemberDTO>;
  listQueryKey(): readonly string[];
}

// The RBAC matrix mirrored for the FE — kept in lock-step with lib/lib/schemas/permissions.py.
// The server is the authority; this gates UI affordances + powers the permission grid only.
export const SCOPES = [
  { scope: "team:manage", label: "Manage team & roles" },
  { scope: "branding:edit", label: "Edit company branding" },
  { scope: "job:post", label: "Post & edit jobs" },
  { scope: "job:template", label: "Manage job templates" },
  { scope: "applicant:review", label: "Review applicants & reports" },
  { scope: "applicant:decide", label: "Shortlist / reject / hire" },
  { scope: "messaging:send", label: "Message candidates" },
  { scope: "analytics:view", label: "View analytics" },
] as const;
export const PERMISSIONS: Record<CompanyRole, ReadonlySet<string>> = {
  company_admin:  new Set(SCOPES.map((s) => s.scope)),
  recruiter:      new Set(["job:post", "job:template", "applicant:review", "applicant:decide", "messaging:send", "analytics:view"]),
  hiring_manager: new Set(["applicant:review", "messaging:send", "analytics:view"]),
};
export function can(role: string, scope: string): boolean {
  return PERMISSIONS[role as CompanyRole]?.has(scope) ?? false;
}
export const ROLE_LABELS: Record<CompanyRole, string> = {
  company_admin: "Admin", recruiter: "Recruiter", hiring_manager: "Hiring manager",
};
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/company/app/team/types.ts` (the contract shape + the FE matrix above)
- Create: `frontend/apps/company/app/team/team-client.ts` (`createTeamClient(api)` real + `makeMockTeamClient()` mock; `NEXT_PUBLIC_MOCK` toggle)
- Create: `frontend/apps/company/app/team/team-client.test.ts` (the `can()` matrix + the mock lifecycle + the last-admin helper)
- Create: `frontend/apps/company/components/team-roster.tsx` (the roster `Table` + role `Select` + status `Badge` + per-row actions)
- Create: `frontend/apps/company/components/invite-member-dialog.tsx` (the invite modal: email + role `Select` + temp password)
- Create: `frontend/apps/company/components/permission-matrix.tsx` (the read-only role×scope grid via `can()`)
- Rebuild: `frontend/apps/company/app/team/page.tsx` (keep the admin gate; swap the invite form for the roster + dialog + matrix)
- (At integration) Modify: `frontend/packages/api-client/src/index.ts` (+`team_pb`), `frontend/packages/shared/src/{index.ts,permissions.ts}` (the shared matrix + `can()`, if hoisted out of the app)

**Components:** new `TeamRoster`, `InviteMemberDialog`, `PermissionMatrix`; reuse `@ip/ui` `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle`/`DialogDescription`, `ConfirmDialog`, `Badge`, `Button`, `Field`, `Input`, `Alert`, `Tooltip`/`TooltipProvider`/`TooltipRoot`/`TooltipTrigger`/`TooltipContent`, `LoadingState`/`ErrorState`/`PageHeader`, `toast`. lucide icons (`UserPlus`, `Trash2`, `Send`, `ShieldCheck`, `Ban`, `Check`) imported **in the app** (the lucide-must-be-in-app rule).
**Query key:** `["team","members"]` (via the client's `listQueryKey()` so view + invalidation never drift).

> **Keep the existing gate.** `app/team/page.tsx` already calls `useRequireRole(identity?.role, ["company_admin"], ready)` and renders an "Admins only" `Alert` fallback — **keep both**. The company shell already shows the `/team` nav entry only for `company_admin`. The rebuild swaps the inline invite form + session-badge list for the roster table + invite dialog + matrix grid, and replaces `api.auth.inviteRecruiter` with `api.team.inviteMember`.

### Task 1: Contract types + the FE matrix + the last-admin helper (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/apps/company/app/team/team-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { can } from "./types";
import { isLastAdmin, makeMockTeamClient } from "./team-client";

describe("can (RBAC matrix mirror)", () => {
  it("company_admin holds team:manage; recruiter does not", () => {
    expect(can("company_admin", "team:manage")).toBe(true);
    expect(can("recruiter", "team:manage")).toBe(false);
  });
  it("hiring_manager reviews but cannot decide or post", () => {
    expect(can("hiring_manager", "applicant:review")).toBe(true);
    expect(can("hiring_manager", "applicant:decide")).toBe(false);
    expect(can("hiring_manager", "job:post")).toBe(false);
  });
  it("unknown role / bogus scope → false", () => {
    expect(can("candidate", "analytics:view")).toBe(false);
    expect(can("company_admin", "bogus:scope")).toBe(false);
  });
});

describe("isLastAdmin", () => {
  it("true when the row is the only active admin", () => {
    const members = [
      { id: "a", role: "company_admin", status: "active" },
      { id: "b", role: "recruiter", status: "active" },
    ] as any;
    expect(isLastAdmin(members, members[0])).toBe(true);
    expect(isLastAdmin(members, members[1])).toBe(false);
  });
  it("false once a second active admin exists", () => {
    const members = [
      { id: "a", role: "company_admin", status: "active" },
      { id: "b", role: "company_admin", status: "active" },
    ] as any;
    expect(isLastAdmin(members, members[0])).toBe(false);
  });
});

describe("makeMockTeamClient", () => {
  it("invite appends a pending row; remove flips to revoked", async () => {
    const c = makeMockTeamClient();
    const before = await c.listMembers();
    await c.inviteMember("new@co.com", "recruiter", "temp1234");
    const after = await c.listMembers();
    expect(after.length).toBe(before.length + 1);
    expect(after.some((m) => m.email === "new@co.com" && m.status === "pending")).toBe(true);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/company test team-client` → FAIL. *(If the company app has no test runner wired, add `vitest` + a `test` script first — fold into this task.)*
- [ ] **Step 3: Implement `types.ts`** (paste Part A's shape) **and** the pure helpers in `team-client.ts` (the real client + mock follow in Task 2):
```ts
import type { MemberDTO, TeamClient } from "./types";

/** True when `row` is the only *active* company_admin — drives the disable-Remove UX. */
export function isLastAdmin(members: MemberDTO[], row: MemberDTO): boolean {
  if (row.role !== "company_admin" || row.status !== "active") return false;
  return members.filter((m) => m.role === "company_admin" && m.status === "active").length <= 1;
}

const LIST_KEY = ["team", "members"] as const;

export function makeMockTeamClient(): TeamClient {
  const members: MemberDTO[] = [
    { id: "u-admin", email: "admin@northwind.co", role: "company_admin", status: "active",
      lastActiveAt: "2026-06-20T08:00:00Z", invitedBy: "" },
    { id: "u-rec",   email: "riley@northwind.co", role: "recruiter", status: "active",
      lastActiveAt: "2026-06-19T17:30:00Z", invitedBy: "u-admin" },
    { id: "u-hm",    email: "morgan@northwind.co", role: "hiring_manager", status: "pending",
      lastActiveAt: "", invitedBy: "u-admin" },
  ];
  const find = (id: string) => members.find((m) => m.id === id)!;
  return {
    listMembers: async () => members.slice(),
    inviteMember: async (email, role, _pw) => {
      const m: MemberDTO = { id: `u-${members.length}`, email, role, status: "pending", lastActiveAt: "", invitedBy: "u-admin" };
      members.push(m); return m;
    },
    resendInvite: async (id) => find(id),
    revokeInvite: async (id) => { const m = find(id); m.status = "revoked"; return m; },
    removeMember: async (id) => { const m = find(id); m.status = "revoked"; return m; },
    changeRole: async (id, role) => { const m = find(id); m.role = role; return m; },
    listQueryKey: () => LIST_KEY,
  };
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/company test team-client` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/company/app/team && git commit -m "feat(team): contract types + FE RBAC matrix + last-admin helper + mock client"`

### Task 2: Real gRPC client wrapper + mock toggle

- [ ] **Step 1:** Add `createTeamClient(api)` to `team-client.ts` (mirrors the `interview.ts`/`jd.ts` factory shape; **no try/except** here — the React layer renders `ConnectError` via `errorMessage`):
```ts
import type { ApiClients } from "@ip/api-client"; // after pnpm gen exposes api.team
import type { CompanyRole, MemberDTO, TeamClient } from "./types";

const norm = (m: MemberDTO): MemberDTO => ({
  id: m.id, email: m.email, role: m.role as CompanyRole, status: m.status,
  lastActiveAt: m.lastActiveAt ?? "", invitedBy: m.invitedBy ?? "",
});

export function createTeamClient(api: ApiClients): TeamClient {
  const t = api.team; // Client<typeof TeamService> after gen
  return {
    listMembers: async () => (await t.listMembers({})).members.map(norm),
    inviteMember: async (email, role, tempPassword) => norm(await t.inviteMember({ email, role, tempPassword })),
    resendInvite: async (userId) => norm(await t.resendInvite({ userId })),
    revokeInvite: async (userId) => norm(await t.revokeInvite({ userId })),
    removeMember: async (userId) => norm(await t.removeMember({ userId })),
    changeRole: async (userId, role) => norm(await t.changeRole({ userId, role })),
    listQueryKey: () => ["team", "members"],
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export function useTeamClient(api: ApiClients): TeamClient {
  return USE_MOCK ? makeMockTeamClient() : createTeamClient(api);
}
```
- [ ] **Step 2: Verify** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company typecheck` clean (if typecheck flags the missing `api.team` member pre-gen, guard the real factory behind `USE_MOCK` so it's tree-shaken, or stub a local `ApiClientsLike` interface — note at handoff).
- [ ] **Step 3: Commit** — `git commit -am "feat(team): real gRPC client wrapper behind NEXT_PUBLIC_MOCK"`

### Task 3: `InviteMemberDialog` component

- [ ] **Step 1:** Create `frontend/apps/company/components/invite-member-dialog.tsx` — an **Invite member** `Button` (`leadingIcon={UserPlus}`) opening a `@ip/ui` `Dialog` with **Email** (`Input`, the existing `EMAIL_RE` from the current page), **Role** (`Select`, default `recruiter`, options recruiter / hiring_manager — **not** company_admin via invite, matching the server), **Temporary password** (`Input`, 8-char min). Submit → `inviteMember(email, role, password)` via `useMutation`; on success close, `invalidateQueries(listQueryKey())` (the new `pending` row appears), `toast.success("Invited")`; on error `toast.error(errorMessage)`:
```tsx
"use client";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ip/ui";
import { errorMessage, toast } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { CompanyRole, TeamClient } from "../app/team/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberDialog({ client }: { client: TeamClient }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<CompanyRole, "company_admin">>("recruiter");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const invite = useMutation({
    mutationFn: () => client.inviteMember(email.trim(), role, password),
    onSuccess: () => { qc.invalidateQueries({ queryKey: client.listQueryKey() });
      toast.success("Invited"); setOpen(false); setEmail(""); setPassword(""); setErrors({}); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "At least 8 characters.";
    setErrors(next);
    if (!next.email && !next.password) invite.mutate();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button leadingIcon={UserPlus}>Invite member</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>They sign in with this email + temporary password, then set their own.</DialogDescription>
        <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="invite-email" error={errors.email}>
            <Input id="invite-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email) || undefined} />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger id="invite-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiter">Recruiter</SelectItem>
                <SelectItem value="hiring_manager">Hiring manager</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Temporary password" htmlFor="invite-pw" error={errors.password} hint="At least 8 characters.">
            <Input id="invite-pw" type="password" minLength={8} autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password) || undefined} />
          </Field>
          <Button type="submit" className="self-start" loading={invite.isPending}
            disabled={!email.trim() || !password || invite.isPending}>Send invite</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean (confirm `Dialog`/`Select`/`Button` prop names against `@ip/ui`).
- [ ] **Step 3: Commit** — `git commit -am "feat(team): InviteMemberDialog (email + role + temp password)"`

### Task 4: `TeamRoster` component (the roster Table + role change + lifecycle actions + last-admin disable)

- [ ] **Step 1:** Create `frontend/apps/company/components/team-roster.tsx`:
```tsx
"use client";
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ip/ui";
import { errorMessage, toast } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "../lib/auth";
import { useTeamClient, isLastAdmin } from "../app/team/team-client";
import { ROLE_LABELS, type CompanyRole, type MemberDTO } from "../app/team/types";

const STATUS_TONE = { active: "success", pending: "warning", revoked: "muted" } as const;
const rel = (iso: string) => iso
  ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round((Date.parse(iso) - Date.now()) / 86_400_000), "day")
  : "Invited";

export function TeamRoster() {
  const { api, identity } = useAuth();
  const client = useMemo(() => useTeamClient(api), [api]);
  const qc = useQueryClient();
  const key = client.listQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.listMembers() });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: CompanyRole }) => client.changeRole(id, role),
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const lifecycle = (fn: (id: string) => Promise<MemberDTO>, ok: string) => useMutation({
    mutationFn: fn, onSuccess: () => { toast.success(ok); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resend = lifecycle(client.resendInvite, "Invite resent");
  const revoke = lifecycle(client.revokeInvite, "Invite revoked");
  const remove = lifecycle(client.removeMember, "Member removed");

  if (q.isLoading) return <LoadingState label="Loading team…" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const members = q.data ?? [];

  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>Member</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last active</TableHead><TableHead /></TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => {
          const lastAdmin = isLastAdmin(members, m);
          const you = m.id === identity?.id;
          return (
            <TableRow key={m.id}>
              <TableCell>{m.email}{you && <span className="ml-1 text-muted-foreground">(you)</span>}</TableCell>
              <TableCell>
                <Select value={m.role} disabled={m.status === "revoked" || lastAdmin}
                  onValueChange={(role) => changeRole.mutate({ id: m.id, role: role as CompanyRole })}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="company_admin">{ROLE_LABELS.company_admin}</SelectItem>
                    <SelectItem value="recruiter">{ROLE_LABELS.recruiter}</SelectItem>
                    <SelectItem value="hiring_manager">{ROLE_LABELS.hiring_manager}</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell><Badge tone={STATUS_TONE[m.status]} variant="subtle">{m.status}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{rel(m.lastActiveAt)}</TableCell>
              <TableCell className="text-right">
                {m.status === "pending" && (
                  <span className="inline-flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => resend.mutate(m.id)}>Resend</Button>
                    <ConfirmDialog trigger={<Button variant="outline" size="sm">Revoke</Button>}
                      title="Revoke this invite?" confirmLabel="Revoke" onConfirm={() => revoke.mutate(m.id)} />
                  </span>
                )}
                {m.status === "active" && (
                  <ConfirmDialog
                    trigger={<Button variant="destructive" size="sm" disabled={lastAdmin}
                      title={lastAdmin ? "A company needs at least one admin" : undefined}>Remove</Button>}
                    title="Remove this member?" description="Their access is revoked and they're signed out."
                    confirmLabel="Remove" destructive busy={remove.isPending} onConfirm={() => remove.mutate(m.id)} />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean (adjust `Badge` `tone` values to the real `BadgeTone` union — confirm `muted`/`success`/`warning` exist; the `useMemo(() => useTeamClient(...))` should instead call the hook at top-level — `useTeamClient` returns a stable mock or memoize `createTeamClient(api)` directly; fix per the real hook rules). Last-admin Remove + the non-admin role options are disabled with a tooltip.
- [ ] **Step 3: Commit** — `git commit -am "feat(team): TeamRoster (roster + role change + lifecycle + last-admin disable)"`

### Task 5: `PermissionMatrix` grid (read-only role×scope)

- [ ] **Step 1:** Create `frontend/apps/company/components/permission-matrix.tsx` — a read-only grid: rows = the 8 `SCOPES`, columns = the 3 roles, cells = a `Check` (lucide) when `can(role, scope)` else a muted dash. Drives understanding ("what can a hiring manager do?") and stays in lock-step with the server matrix:
```tsx
"use client";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ip/ui";
import { Check } from "lucide-react";
import { can, ROLE_LABELS, SCOPES, type CompanyRole } from "../app/team/types";

const ROLES: CompanyRole[] = ["company_admin", "recruiter", "hiring_manager"];

export function PermissionMatrix() {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">What each role can do</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              {ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_LABELS[r]}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {SCOPES.map((s) => (
              <TableRow key={s.scope}>
                <TableCell className="text-foreground">{s.label}</TableCell>
                {ROLES.map((r) => (
                  <TableCell key={r} className="text-center">
                    {can(r, s.scope)
                      ? <Check className="mx-auto size-4 text-success" aria-label="allowed" />
                      : <span className="text-muted-foreground" aria-label="not allowed">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean (confirm the `text-success` token exists; else use a `Badge tone="success"` icon wrapper).
- [ ] **Step 3: Commit** — `git commit -am "feat(team): PermissionMatrix (read-only role×scope grid)"`

### Task 6: Rebuild `app/team/page.tsx` (roster + dialog + matrix)

- [ ] **Step 1:** Rebuild `frontend/apps/company/app/team/page.tsx` — **keep** the `CompanyShell` + `PageHeader` + the **admin-only gate** (`useRequireRole(identity?.role, ["company_admin"], ready)` + the "Admins only" `Alert` fallback). Replace the inline invite form + session-badge list with: the `InviteMemberDialog` trigger (top-right of the header `action`) + the `TeamRoster` table + the `PermissionMatrix` below. Drop the dead `invited` session-state, the inline form, and the `api.auth.inviteRecruiter` call:
```tsx
"use client";
import { Alert, PageHeader } from "@ip/ui";
import { useRequireRole } from "@ip/shared";
import { useMemo } from "react";
import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";
import { useTeamClient } from "./team-client";
import { TeamRoster } from "../../components/team-roster";
import { InviteMemberDialog } from "../../components/invite-member-dialog";
import { PermissionMatrix } from "../../components/permission-matrix";

export default function TeamPage() {
  const { api, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["company_admin"], ready);
  const client = useMemo(() => useTeamClient(api), [api]); // or call useTeamClient(api) directly per hook rules

  if (identity?.role !== "company_admin") {
    return (
      <CompanyShell>
        <PageHeader title="Team" />
        <Alert tone="info" title="Admins only">Only company admins can manage the team.</Alert>
      </CompanyShell>
    );
  }
  return (
    <CompanyShell>
      <PageHeader title="Team & permissions" description="Manage who can access your workspace and what they can do."
        action={<InviteMemberDialog client={client} />} />
      <div className="mt-4 flex flex-col gap-6">
        <TeamRoster />
        <PermissionMatrix />
      </div>
    </CompanyShell>
  );
}
```
- [ ] **Step 2: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company build` clean; via the preview loop: start dev, load `/team`, confirm the roster renders 3 mock rows (admin active + "(you)", recruiter active, hiring-manager pending), the status `Badge`s + role `Select`s render, the invite dialog opens + submitting appends a pending row, the pending row shows Resend/Revoke, the active member shows Remove, the **only-admin** row's Remove + non-admin role options are **disabled** (tooltip), and the permission matrix renders the role×scope grid. A non-admin (impersonate via role) sees the "Admins only" `Alert`. No console errors. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(team): rebuild /team page (roster + invite dialog + permission matrix)"`

### Task 7: Wire the real client + the shared matrix at integration (after `pnpm gen`)

- [ ] **Step 1: api-client** — once `team.proto` is generated, in `frontend/packages/api-client/src/index.ts` add `team_pb` to (a) the import block, (b) the `export * from "./gen/team_pb.js"` list, (c) `ApiClients` as `team: Client<typeof TeamService>`, and (d) the `clientsFromTransport` return — mirroring `decisions`/`recommendations` exactly.
- [ ] **Step 2: (optional) hoist the matrix to `@ip/shared`** — if other surfaces need `can()` (nav gating, action-hiding), move `PERMISSIONS`/`can()`/`SCOPES` into `frontend/packages/shared/src/permissions.ts` + re-export from the barrel, and have `app/team/types.ts` re-export from `@ip/shared`. Add the lock-step comment ("keep in sync with `lib/lib/schemas/permissions.py` — server is the authority"). If only `/team` needs it, leave it app-local. Decide at integration.
- [ ] **Step 3: flip the toggle** — drop `NEXT_PUBLIC_MOCK` (or `=0`); the page swaps to `createTeamClient(api)` with **no component change** (the `TeamClient` interface is the seam). `--filter @ip/api-client typecheck` → `--filter @ip/shared typecheck` → `--filter @ip/company build` green.
- [ ] **Step 4: Commit** — `git commit -am "feat(team): integrate real TeamService client (pnpm gen)"`
- [ ] **Step 5: gate + handoff** — `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` (+ `--filter @ip/candidate build` if a shared package changed) all green. Flag at handoff: (a) per-job scoping **enforcement** is deferred (model only); (b) whether the matrix was hoisted to `@ip/shared` or kept app-local; (c) the **demotion force-revoke** choice as built; (d) `NEXT_PUBLIC_MOCK` removed; (e) the FE matrix must stay in lock-step with `lib/lib/schemas/permissions.py` (a stale FE copy only mis-gates UI, never authz).

---

## C. States & acceptance

- **States:** loading (`LoadingState`), error (`ErrorState` + retry on the roster query; mutation errors → `toast.error(errorMessage(err))`), success (the roster table). **No empty state** — the admin is always a row. Role-change + lifecycle mutations invalidate `["team","members"]` and toast.
- **RBAC posture:** the **server enforces** every mutation (`team:manage` + `_member_scoped` + last-admin); the FE gating (disable the only-admin Remove + the non-admin role options, hide nav for non-admins, the matrix grid) is **UX only**, never trust — exactly the messaging-body-cap posture. The FE `PERMISSIONS` mirror is kept in lock-step with `lib`.
- **Last-admin:** the only active `company_admin`'s **Remove** + **Role→non-admin** are disabled with a tooltip ("A company needs at least one admin"); the server returns `INVALID_ARGUMENT` if bypassed (the disable avoids a pointless round-trip). Promoting a second admin re-enables them.
- **Responsive:** the roster `Table` scrolls under `md:`; the invite dialog is a centered modal; the matrix grid scrolls horizontally on narrow screens.
- **Dark mode:** tokens only (`text-muted-foreground`, `text-success`, `border-border`, `tone=` Badge families) — automatic.
- **A11y:** the roster is a `Table` with header cells; role `Select`s are labelled; destructive Remove/Revoke use `ConfirmDialog`; the matrix cells carry `aria-label="allowed"/"not allowed"`; the admin gate redirects + shows an explanatory `Alert`.
- **Acceptance:** matches `aptura_team_permissions` (roster with status + role badges + the permission-matrix grid); the existing **admin-only gate is preserved**; invite/resend/revoke/remove/change-role round-trip; the last-admin invariant is enforced both UI-side (disabled) and server-side (`ValidationError`); `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green (`@ip/ui` untouched — its passing typecheck proves no accidental coupling); works against the mock today and against `TeamService` once the BE lands (flip `NEXT_PUBLIC_MOCK`).
