import type { ApiClients } from "@ip/api-client";

import type { CompanyRole, MemberDTO, MemberStatus, TeamClient } from "./types";

const LIST_KEY = ["team", "members"] as const;

/** True when `row` is the only *active* company_admin — drives the disable-Remove UX.
 * Server is authoritative; this gate avoids a pointless round-trip when we already know. */
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
    changeRole: async (id, role: CompanyRole) => {
      const m = find(id);
      m.role = role;
      return m;
    },
    listQueryKey: () => LIST_KEY,
  };
}

// Gen `MemberDTO` exposes `role` and `status` as `string` (proto). The FE seam narrows them
// to discriminated unions — remap at the boundary so the rest of the screen reads the seam
// shape verbatim. An unknown status falls back to "active" (server is the authority; this
// only mis-colors a pill in the unlikely race that the server adds a new state without a UI).
type GenMember = Omit<MemberDTO, "role" | "status"> & { role: string; status: string };
function adaptMember(m: GenMember): MemberDTO {
  return {
    id: m.id,
    email: m.email,
    role: m.role as CompanyRole,
    status: (["active", "pending", "revoked"].includes(m.status)
      ? m.status
      : "active") as MemberStatus,
    lastActiveAt: m.lastActiveAt,
    invitedBy: m.invitedBy,
  };
}

/** Real TeamService client over the admin transport. Plain object literals are accepted at
 *  the call boundary (protobuf-es). No try/except — the React layer renders ConnectError via
 *  errorMessage(...) and the last-admin guard surfaces as FAILED_PRECONDITION. */
export function makeApiTeamClient(api: ApiClients): TeamClient {
  const t = api.team;
  return {
    listMembers: async () => {
      // ListMembers is paginated; the roster screen reads page 1 with a generous size.
      // 100 covers every realistic seat count; the server caps server-side too.
      const r = await t.listMembers({ page: 1, pageSize: 100 });
      return r.members.map((row) => adaptMember(row as GenMember));
    },
    inviteMember: async (email, role, tempPassword) =>
      adaptMember((await t.inviteMember({ email, role, tempPassword })) as GenMember),
    resendInvite: async (userId) =>
      adaptMember((await t.resendInvite({ userId })) as GenMember),
    revokeInvite: async (userId) =>
      adaptMember((await t.revokeInvite({ userId })) as GenMember),
    removeMember: async (userId) =>
      adaptMember((await t.removeMember({ userId })) as GenMember),
    changeRole: async (userId, role) =>
      adaptMember((await t.changeRole({ userId, role })) as GenMember),
    listQueryKey: () => LIST_KEY,
  };
}

// Mock when NEXT_PUBLIC_MOCK=1 (fixture-driven dev), else the live gRPC client.
export const USE_MOCK_TEAM = process.env.NEXT_PUBLIC_MOCK === "1";

/** Returns the active TeamClient for the calling component. Live by default; mock when
 *  NEXT_PUBLIC_MOCK=1. The consumer memoizes so the mock's in-memory roster survives
 *  re-renders. */
export function makeTeamClient(api: ApiClients): TeamClient {
  return USE_MOCK_TEAM ? makeMockTeamClient() : makeApiTeamClient(api);
}
