// Typed shape for candidate search — ported from apps/company/app/talent/sourcing-types.ts.
// SourcingService.SearchCandidates isn't in the proto yet; the page codes against this until
// `pnpm gen`. The default (empty-query) view uses the already-generated `api.talent.getTalentPool`.
//
// Privacy contract: the candidate handle is always masked (slice(0,12)… on render) — never the
// candidate's name or email; that's the policy and we never break it.

export interface CandidateHitDTO {
  candidateUserId: string;
  applicationCount: number;
  fitScore: number; // 0..1
  topStage: string; // funnel state key — mapped via applicationPillStatus for label/tone
  matchedSkills: string[];
}

export interface SearchCandidatesResult {
  hits: CandidateHitDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchCandidatesParams {
  query: string;
  stage?: string;
  minScore?: number;
  page?: number;
  pageSize?: number;
}
