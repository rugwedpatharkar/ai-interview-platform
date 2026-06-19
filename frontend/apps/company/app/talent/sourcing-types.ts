// Typed shape for candidate search. `SourcingService.SearchCandidates` isn't in the proto
// yet — the search box codes against this until `pnpm gen`. The default (empty-query) view
// still uses the already-generated `api.talent.getTalentPool`; only search needs a mock.

export interface CandidateHitDTO {
  candidateUserId: string; // masked handle (slice(0,12)… on render, same as the pool)
  applicationCount: number;
  fitScore: number; // 0..1
  topStage: string; // funnel state key (mapped via applicationStatus for label/tone)
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
