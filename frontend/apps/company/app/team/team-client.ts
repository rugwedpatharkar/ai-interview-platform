import type { CompanyRole, MemberDTO, TeamClient } from "./types";

const LIST_KEY = ["team", "members"] as const;

/** True when `row` is the only *active* company_admin — drives the disable-Remove UX. */
export function isLastAdmin(members: MemberDTO[], row: MemberDTO): boolean {
  if (row.role !== "company_admin" || row.status !== "active") return false;
  return (
    members.filter((m) => m.role === "company_admin" && m.status === "active").length <= 1
  );
}

// Fixture: one active admin (the caller), one active recruiter, one pending hiring manager —
// enough to exercise every row state (active/pending), the last-admin disable, and "(you)".
export function makeMockTeamClient(): TeamClient {
  const members: MemberDTO[] = [
    {
      id: "u-admin",
      email: "admin@northwind.co",
      role: "company_admin",
      status: "active",
      lastActiveAt: "2026-06-20T08:00:00Z",
      invitedBy: "",
    },
    {
      id: "u-rec",
      email: "riley@northwind.co",
      role: "recruiter",
      status: "active",
      lastActiveAt: "2026-06-19T17:30:00Z",
      invitedBy: "u-admin",
    },
    {
      id: "u-hm",
      email: "morgan@northwind.co",
      role: "hiring_manager",
      status: "pending",
      lastActiveAt: "",
      invitedBy: "u-admin",
    },
  ];
  const find = (id: string): MemberDTO => {
    const m = members.find((x) => x.id === id);
    if (!m) throw new Error("Member not found");
    return m;
  };
  return {
    listMembers: async () => members.slice(),
    inviteMember: async (email, role, _tempPassword) => {
      const m: MemberDTO = {
        id: `u-${members.length}`,
        email,
        role,
        status: "pending",
        lastActiveAt: "",
        invitedBy: "u-admin",
      };
      members.push(m);
      return m;
    },
    resendInvite: async (id) => find(id),
    revokeInvite: async (id) => {
      const m = find(id);
      m.status = "revoked";
      return m;
    },
    removeMember: async (id) => {
      const m = find(id);
      m.status = "revoked";
      return m;
    },
    changeRole: async (id, role) => {
      const m = find(id);
      m.role = role;
      return m;
    },
    listQueryKey: () => LIST_KEY,
  };
}

// Structural view of the generated `api.team` surface. Defined locally so the real factory
// typechecks before `pnpm gen` lands `api.team` on ApiClients; at integration, swap the
// param type to `ApiClients` from "@ip/api-client" and drop this interface (one-line change).
interface TeamApiLike {
  team: {
    listMembers(req: Record<string, never>): Promise<{ members: MemberDTO[] }>;
    inviteMember(req: {
      email: string;
      role: string;
      tempPassword: string;
    }): Promise<MemberDTO>;
    resendInvite(req: { userId: string }): Promise<MemberDTO>;
    revokeInvite(req: { userId: string }): Promise<MemberDTO>;
    removeMember(req: { userId: string }): Promise<MemberDTO>;
    changeRole(req: { userId: string; role: string }): Promise<MemberDTO>;
  };
}

const norm = (m: MemberDTO): MemberDTO => ({
  id: m.id,
  email: m.email,
  role: m.role as CompanyRole,
  status: m.status,
  lastActiveAt: m.lastActiveAt ?? "",
  invitedBy: m.invitedBy ?? "",
});

// No try/except — the React layer renders ConnectError via errorMessage(...).
export function createTeamClient(api: TeamApiLike): TeamClient {
  const t = api.team;
  return {
    listMembers: async () => (await t.listMembers({})).members.map(norm),
    inviteMember: async (email, role, tempPassword) =>
      norm(await t.inviteMember({ email, role, tempPassword })),
    resendInvite: async (userId) => norm(await t.resendInvite({ userId })),
    revokeInvite: async (userId) => norm(await t.revokeInvite({ userId })),
    removeMember: async (userId) => norm(await t.removeMember({ userId })),
    changeRole: async (userId, role) => norm(await t.changeRole({ userId, role })),
    listQueryKey: () => LIST_KEY,
  };
}

// At integration: drop NEXT_PUBLIC_MOCK (or set =0) and return createTeamClient(api) —
// the TeamClient interface is the seam, so no component changes.
export const USE_MOCK_TEAM = process.env.NEXT_PUBLIC_MOCK === "1";

export function makeTeamClient(): TeamClient {
  return makeMockTeamClient();
}
