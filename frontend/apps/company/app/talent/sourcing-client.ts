import type {
  CandidateHitDTO,
  SearchCandidatesParams,
  SearchCandidatesResult,
} from "./sourcing-types";

export interface SourcingClient {
  search(p: SearchCandidatesParams): Promise<SearchCandidatesResult>;
}

// Fixture stands in for the company's own applicants (the only search universe — there is
// no global candidate index). A rejected applicant stays present, matching the BE invariant
// that the universe is application-existence, not current funnel state.
const FIXTURE: CandidateHitDTO[] = [
  {
    candidateUserId: "u_1a2b3c4d5e6f7g",
    applicationCount: 3,
    fitScore: 0.91,
    topStage: "interview_pending",
    matchedSkills: ["react", "typescript"],
  },
  {
    candidateUserId: "u_7g6f5e4d3c2b1a",
    applicationCount: 1,
    fitScore: 0.64,
    topStage: "applied",
    matchedSkills: ["react"],
  },
  {
    candidateUserId: "u_aaaa1111bbbb22",
    applicationCount: 2,
    fitScore: 0.22,
    topStage: "rejected",
    matchedSkills: ["go"],
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

// Real (after pnpm gen): { search: (p) => api.sourcing.searchCandidates(p) } —
// widen applicationCount via Number(...).
export const USE_MOCK_SOURCING = process.env.NEXT_PUBLIC_MOCK === "1";
