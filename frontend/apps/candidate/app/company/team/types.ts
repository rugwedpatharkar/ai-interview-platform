// Typed contract for TeamService — ported from apps/company/app/team/types.ts.
// The proto/servicer aren't generated yet, so the roster, invite dialog, and permission cloud
// code against this shape until `pnpm gen` exposes `api.team.*`. camelCase mirrors protobuf-es.

export type MemberStatus = "active" | "pending" | "revoked";
export type CompanyRole = "company_admin" | "recruiter" | "hiring_manager";

export interface MemberDTO {
  id: string;
  email: string;
  role: CompanyRole;
  status: MemberStatus;
  lastActiveAt: string; // ISO, or "" when never active / still pending
  invitedBy: string; // user id, or "" for original members
}

export interface TeamClient {
  listMembers(): Promise<MemberDTO[]>;
  inviteMember(
    email: string,
    role: Exclude<CompanyRole, "company_admin">,
    tempPassword: string,
  ): Promise<MemberDTO>;
  resendInvite(userId: string): Promise<MemberDTO>;
  revokeInvite(userId: string): Promise<MemberDTO>;
  removeMember(userId: string): Promise<MemberDTO>;
  changeRole(userId: string, role: CompanyRole): Promise<MemberDTO>;
  listQueryKey(): readonly string[];
}

// RBAC matrix mirrored for the FE — kept in lock-step with lib/lib/schemas/permissions.py.
// The server is the authority; this gates UI affordances + powers the permission cloud only.
// A stale copy only mis-renders UI, never authz.
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
  company_admin: new Set(SCOPES.map((s) => s.scope)),
  recruiter: new Set([
    "job:post",
    "job:template",
    "applicant:review",
    "applicant:decide",
    "messaging:send",
    "analytics:view",
  ]),
  hiring_manager: new Set(["applicant:review", "messaging:send", "analytics:view"]),
};

export function can(role: string, scope: string): boolean {
  return PERMISSIONS[role as CompanyRole]?.has(scope) ?? false;
}

export const ROLE_LABELS: Record<CompanyRole, string> = {
  company_admin: "Admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
};
