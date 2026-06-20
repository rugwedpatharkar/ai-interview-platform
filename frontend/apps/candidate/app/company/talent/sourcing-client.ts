// Sourcing client — wired 2026-06-21 to `admin.sourcing.v1.SourcingService.SearchCandidates`
// on the admin transport. The wire shape is camelCase via protobuf-es (CandidateHit fields are
// `candidateUserId | applicationCount (bigint) | fitScore | topStage | matchedSkills`); we widen
// `applicationCount` to JS `number` at the seam so the page's render math (count + " application"
// / "applications") stays simple.
//
// Privacy contract: the candidate handle is rendered as `candidateUserId.slice(0,12)…` — never
// the candidate's name or email; the BE only returns the masked handle (no PII), but the FE
// stays defensive in the render either way.
//
// NEXT_PUBLIC_MOCK=1 falls back to a small fixture for offline dev.

import { useMemo } from "react";
import type { AdminClients } from "@ip/api-client";

import { useAuth } from "../../../lib/auth";
import type {
  CandidateHitDTO,
  SearchCandidatesParams,
  SearchCandidatesResult,
} from "./sourcing-types";

export interface SourcingClient {
  search(p: SearchCandidatesParams): Promise<SearchCandidatesResult>;
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

// Fixture stands in for the company's own applicants (the only search universe — there is
// no global candidate index). A rejected applicant stays present, matching the BE invariant
// that the universe is application-existence, not current funnel state.
const FIXTURE: CandidateHitDTO[] = [
  {
    candidateUserId: "u_1a2b3c4d5e6f7g",
    applicationCount: 3,
    fitScore: 0.91,
    topStage: "interview_pending",
    matchedSkills: ["react", "typescript", "next.js"],
  },
  {
    candidateUserId: "u_7g6f5e4d3c2b1a",
    applicationCount: 1,
    fitScore: 0.64,
    topStage: "applied",
    matchedSkills: ["react", "css"],
  },
  {
    candidateUserId: "u_aaaa1111bbbb22",
    applicationCount: 2,
    fitScore: 0.22,
    topStage: "rejected",
    matchedSkills: ["go", "kubernetes"],
  },
];

export function makeMockSourcingClient(): SourcingClient {
  return {
    async search(p) {
      const q = p.query.toLowerCase();
      const hits = FIXTURE.filter((h) => !q || h.matchedSkills.some((s) => s.includes(q)))
        .filter((h) => !p.stage || h.topStage === p.stage)
        .filter((h) => !p.minScore || h.fitScore >= p.minScore);
      return { hits, total: hits.length, page: p.page ?? 1, pageSize: p.pageSize ?? 24 };
    },
  };
}

/** Real client backed by `admin.sourcing.v1.SourcingService`. CandidateHit.applicationCount is
 *  `bigint` on the wire (int64) — widened to `number` here so the page's render math is direct. */
export function makeApiSourcingClient(api: AdminClients): SourcingClient {
  return {
    async search(p) {
      const r = await api.sourcing.searchCandidates({
        query: p.query,
        stage: p.stage ?? "",
        minScore: p.minScore ?? 0,
        page: p.page ?? 0,
        pageSize: p.pageSize ?? 0,
      });
      return {
        hits: r.hits.map((h) => ({
          candidateUserId: h.candidateUserId,
          applicationCount: Number(h.applicationCount),
          fitScore: h.fitScore,
          topStage: h.topStage,
          matchedSkills: h.matchedSkills,
        })),
        total: r.total,
        page: r.page,
        pageSize: r.pageSize,
      };
    },
  };
}

/** Hook: returns the live sourcing client (or the mock under NEXT_PUBLIC_MOCK). */
export function useSourcingClient(): SourcingClient {
  const { api } = useAuth();
  return useMemo(
    () => (USE_MOCK ? makeMockSourcingClient() : makeApiSourcingClient(api)),
    [api],
  );
}
