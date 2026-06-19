# Screen: Talent pool / sourcing — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1).
> **Route:** `frontend/apps/company/app/talent/page.tsx` (enhance the existing pool table with search) · **Mockup:** `aptura_talent_pool` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (TIER 6, Task 12)
> **Goal:** Above today's full talent-pool table, add a candidate **search** over the company's **own applicants only** (keyword / stage / score), returning ranked rows with **fit badges** — while keeping `GetTalentPool` as the default (no-query) view. The result set carries **no ID/background/biometric data** (human-in-the-loop only).

Today `/talent` renders `api.talent.getTalentPool({})` as a table of masked candidate handles + application counts. This plan adds a **search box above** it backed by a new `SourcingService.SearchCandidates`. The search universe is **strictly the company's own applicants** (every candidate who applied to any job owned by this `comp_id`) — there is **no global candidate index**. When the query is empty, the existing pool table renders unchanged.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.sourcing.v1` (`SourcingService`) — a small new service (or fold `SearchCandidates` onto `DiscoveryService`; this doc assumes a dedicated `SourcingService`). Keep `Talent.GetTalentPool` as-is.

**RPCs:**
```proto
// service: admin.sourcing.v1 — NEW
rpc SearchCandidates(SearchCandidatesRequest) returns (SearchCandidatesResponse);
```
```proto
message SearchCandidatesRequest {
  string query = 1;        // keyword over the applicant's profile/skills/experience text
  string stage = 2;        // optional funnel-state filter (e.g. "interview"|"offer"); "" = any
  double min_score = 3;    // optional overall-score floor; 0 = any
  int32  page = 4;
  int32  page_size = 5;    // capped server-side (≤ 50)
}
message CandidateHit {
  string candidate_user_id = 1;   // masked handle on the wire (same treatment as GetTalentPool)
  int64  application_count = 2;    // applications to THIS company
  double fit_score = 3;           // 0..1 — keyword/score relevance (the "fit" badge)
  string top_stage = 4;           // furthest funnel state reached across this candidate's apps
  repeated string matched_skills = 5;  // skills that matched the query (for fit context)
}
message SearchCandidatesResponse {
  repeated CandidateHit hits = 1;
  int32 total = 2; int32 page = 3; int32 page_size = 4;
}
```
- **Auth/scope:** bearer; **manager-scoped** (`company_admin`/`recruiter`) and **comp-scoped** — `comp_id` from the **token, never the request**. `page_size` clamped (≤ 50).
- **Search universe (the security boundary — spec §3.4):** the candidate set = **every candidate with an application to ANY job owned by this `comp_id`** — the **same seed set** `resources/talent.py` already builds for `GetTalentPool` — joined to the talent/profile repo for the skill/experience text the keyword match runs over. **Invariants (each a test):**
  - (a) a candidate of **another company never appears** (no global index path exists);
  - (b) an applicant in a **`rejected`** state **still surfaces** (the universe is application-existence, not current funnel state);
  - (c) an applicant to a **`closed`/`paused`** job **still surfaces**;
  - (d) a candidate who **never applied here is unreachable**.
- **No sensitive data:** the response carries **no ID/background/biometric fields** — only the human-in-the-loop subset above (masked handle, counts, fit score, stage, matched skills). The candidate-data scope is general recruiting-profile only.
- **Backed by:** `resources/sourcing.py` (`search_candidates(identity, query, *, stage, min_score, page, page_size)` — comp-scoped keyword match over own applicants' profile text; seeds candidate ids from the application repo scoped to the token's `comp_id`, **never** filters by funnel state so rejected/closed-job applicants stay searchable) → existing application repo (seed set) + talent/profile repo (match text). No new collection; reuses `applications` + profile data.
- **Proto delta / new files:** `src/admin/app/routes/pb/sourcing.proto` (NEW), `src/admin/app/routes/sourcing.py` (servicer), `src/admin/app/resources/sourcing.py`; register in `src/admin/app/routes/web.py`. After: `pnpm gen` + **add the `sourcing` quad** to `frontend/packages/api-client/src/index.ts` (or, if folded onto `DiscoveryService`, that client already exists once Wave-1 `DiscoveryService` lands).
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 12 (`SearchCandidates` over own-company applicants; §3.4 the universe + no-sensitive-data rule).

**FE mock shape** (`frontend/apps/company/app/talent/sourcing-types.ts`) — the search box codes against this until `pnpm gen`:
```ts
export interface CandidateHitDTO {
  candidateUserId: string;     // masked handle (slice(0,12)… on render, same as the pool)
  applicationCount: number;
  fitScore: number;            // 0..1
  topStage: string;            // funnel state key (mapped via applicationStatus for label/tone)
  matchedSkills: string[];
}
export interface SearchCandidatesResult {
  hits: CandidateHitDTO[]; total: number; page: number; pageSize: number;
}
export interface SearchCandidatesParams {
  query: string; stage?: string; minScore?: number; page?: number; pageSize?: number;
}
```

> **Integration seam:** the default (empty-query) view uses the **already-generated** `api.talent.getTalentPool` — no mock needed. Only the **search results** need a mock until `SearchCandidates` lands: `makeMockSourcingClient()` returning `CandidateHitDTO[]` filtered by the query. After `pnpm gen`, bind to `api.sourcing.searchCandidates(...)` (widen `applicationCount` bigint with `Number(...)`); the page component is unchanged.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/company/app/talent/sourcing-types.ts` (the shape above)
- Create: `frontend/apps/company/app/talent/sourcing-client.ts` (interface + `makeMockSourcingClient()` + real binding note)
- Create: `frontend/apps/company/components/candidate-search.tsx` (`"use client"` search bar + filters + results)
- Create: `frontend/apps/company/components/fit-badge.tsx` (`"use client"`-free fit-score badge)
- Create: `frontend/apps/company/app/talent/sourcing-client.test.ts` (mock filter + `fitTone` helper)
- Modify: `frontend/apps/company/app/talent/page.tsx` (mount `<CandidateSearch>` above the pool; show pool only when query is empty)

**Components:** new `CandidateSearch`, `FitBadge`; reuse `@ip/ui` `Field`, `Input`, `Select*`, `Button`, `Card`/`CardContent`, `Badge`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `EmptyState`, `LoadingState`, `Skeleton`, `applicationStatus`. Keep the existing **masked-handle** treatment (`candidateUserId.slice(0, 12)…` mono).
**Query keys:** `["talent"]` (existing pool — unchanged), `["candidate-search", params]` (new; `enabled: query.length > 0`).

### Task 1: `FitBadge` + `fitTone` helper — TDD

- [ ] **Step 1: Write the failing test** — `frontend/apps/company/app/talent/sourcing-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fitTone } from "../../components/fit-badge";
import { makeMockSourcingClient } from "./sourcing-client";

describe("fitTone", () => {
  it("buckets fit score into tones", () => {
    expect(fitTone(0.9)).toBe("success");
    expect(fitTone(0.6)).toBe("warning");
    expect(fitTone(0.2)).toBe("neutral");
  });
});

describe("makeMockSourcingClient", () => {
  it("filters hits by keyword (case-insensitive over matched skills)", async () => {
    const client = makeMockSourcingClient();
    const res = await client.search({ query: "react" });
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits.every((h) => h.matchedSkills.some((s) => s.includes("react")))).toBe(true);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/company test sourcing-client` → FAIL.
- [ ] **Step 3: Implement** `frontend/apps/company/components/fit-badge.tsx`:
```tsx
import { Badge } from "@ip/ui";

export function fitTone(score: number): "success" | "warning" | "neutral" {
  return score >= 0.8 ? "success" : score >= 0.5 ? "warning" : "neutral";
}

export function FitBadge({ score }: { score: number }) {
  return <Badge tone={fitTone(score)}>{Math.round(score * 100)}% fit</Badge>;
}
```
  and `frontend/apps/company/app/talent/sourcing-client.ts`:
```ts
import type { CandidateHitDTO, SearchCandidatesParams, SearchCandidatesResult } from "./sourcing-types";

export interface SourcingClient {
  search(p: SearchCandidatesParams): Promise<SearchCandidatesResult>;
}

const FIXTURE: CandidateHitDTO[] = [
  { candidateUserId: "u_1a2b3c4d5e6f7g", applicationCount: 3, fitScore: 0.91, topStage: "interview", matchedSkills: ["react", "typescript"] },
  { candidateUserId: "u_7g6f5e4d3c2b1a", applicationCount: 1, fitScore: 0.64, topStage: "applied", matchedSkills: ["react"] },
  { candidateUserId: "u_aaaa1111bbbb22", applicationCount: 2, fitScore: 0.22, topStage: "rejected", matchedSkills: ["go"] },
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
// Real (after pnpm gen): { search: (p) => api.sourcing.searchCandidates(p) } — widen applicationCount via Number(...).
export const USE_MOCK_SOURCING = process.env.NEXT_PUBLIC_MOCK === "1";
```
- [ ] **Step 4: Run test, verify it passes** — `--filter @ip/company test sourcing-client` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/company && git commit -m "feat(sourcing): FitBadge + mock SearchCandidates client"`

### Task 2: `CandidateSearch` (search bar + filters + results)

- [ ] **Step 1:** Create `frontend/apps/company/components/candidate-search.tsx`. It owns the query/stage/score state, runs the search only when `query` is non-empty, and renders results in the **same masked-handle shape** as the pool table — with a `FitBadge` + stage badge + matched skills:
```tsx
"use client";
import {
  Badge, Button, Card, CardContent, EmptyState, Field, Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, applicationStatus,
} from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { FitBadge } from "./fit-badge";
import { makeMockSourcingClient } from "../app/talent/sourcing-client";
import type { SearchCandidatesParams } from "../app/talent/sourcing-types";

const STAGES = [["", "Any stage"], ["applied", "Applied"], ["interview", "Interview"], ["offer", "Offer"], ["rejected", "Rejected"]] as const;

export function CandidateSearch({ onActive }: { onActive: (active: boolean) => void }) {
  const client = makeMockSourcingClient(); // swap to api.sourcing.searchCandidates after pnpm gen
  const [draft, setDraft] = useState("");
  const [params, setParams] = useState<SearchCandidatesParams>({ query: "" });
  const active = params.query.trim().length > 0;

  const results = useQuery({
    queryKey: ["candidate-search", params],
    queryFn: () => client.search(params),
    enabled: active,
  });

  function submit(next: Partial<SearchCandidatesParams>) {
    const merged = { ...params, ...next, query: (next.query ?? draft).trim() };
    setParams(merged);
    onActive(merged.query.length > 0);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => { e.preventDefault(); submit({ query: draft }); }}
        >
          <Field label="Search your applicants" htmlFor="q" className="flex-1">
            <Input id="q" value={draft} placeholder="Keyword, skill, or role…" onChange={(e) => setDraft(e.target.value)} />
          </Field>
          <Field label="Stage">
            <Select value={params.stage ?? ""} onValueChange={(v) => submit({ stage: v })}>
              <SelectTrigger className="sm:w-40"><SelectValue placeholder="Any stage" /></SelectTrigger>
              <SelectContent>{STAGES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Button type="submit" leadingIcon={Search}>Search</Button>
        </form>

        {active && results.isLoading && <Skeleton className="h-24" />}
        {active && !results.isLoading && (results.data?.hits.length ?? 0) === 0 && (
          <EmptyState title="No candidates match" description="Try a different keyword or stage." />
        )}
        {active && (results.data?.hits.length ?? 0) > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead><TableHead>Fit</TableHead>
                <TableHead>Stage</TableHead><TableHead>Skills</TableHead><TableHead>Apps</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.data!.hits.map((h) => {
                const stage = applicationStatus(h.topStage);
                return (
                  <TableRow key={h.candidateUserId}>
                    <TableCell className="font-mono text-xs" aria-label={`Candidate ${h.candidateUserId}`}>
                      {h.candidateUserId.slice(0, 12)}…
                    </TableCell>
                    <TableCell><FitBadge score={h.fitScore} /></TableCell>
                    <TableCell><Badge tone={stage.tone}>{stage.label}</Badge></TableCell>
                    <TableCell className="flex flex-wrap gap-1">
                      {h.matchedSkills.slice(0, 4).map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}
                    </TableCell>
                    <TableCell className="tabular-nums">{Number(h.applicationCount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean (confirm `Field` accepts `className`; confirm `applicationStatus` maps the stage keys you use — `applied`/`interview`/`offer`/`rejected` — and `Badge tone` values; adjust to the real status map).
- [ ] **Step 3: Commit** — `git commit -am "feat(sourcing): CandidateSearch (search + stage filter + fit results)"`

### Task 3: Wire `/talent` — search above the pool, pool as the default view

- [ ] **Step 1:** Modify `frontend/apps/company/app/talent/page.tsx` to mount `CandidateSearch` above the existing pool, and **hide the full pool table while a search is active** (so results replace it, per the pillar):
```tsx
"use client";
import {
  Badge, Card, CardContent, EmptyState, ErrorState, LoadingState, PageHeader,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@ip/ui";
import { Users } from "lucide-react";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { useState } from "react";
import { CandidateSearch } from "../../components/candidate-search";
import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

export default function TalentPage() {
  const { api, token } = useAuth();
  const [searching, setSearching] = useState(false);
  const pool = useAuthedQuery(token, { queryKey: ["talent"], queryFn: () => api.talent.getTalentPool({}) });
  const entries = pool.data?.entries ?? [];

  return (
    <CompanyShell>
      <PageHeader title="Talent pool" description="Search and browse candidates who have applied to your jobs." />
      <div className="flex flex-col gap-6">
        <CandidateSearch onActive={setSearching} />

        {/* The full pool is the default view; a live search replaces it with ranked hits. */}
        {!searching && (
          <>
            {pool.isLoading && <LoadingState />}
            {pool.isError && <ErrorState message={errorMessage(pool.error)} retry={() => pool.refetch()} />}
            {!pool.isLoading && !pool.isError && entries.length === 0 && (
              <EmptyState icon={Users} title="No candidates yet" description="Candidates appear here once they apply to your jobs." />
            )}
            {entries.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Candidate</TableHead><TableHead>Applications</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.candidateUserId}>
                          <TableCell className="font-mono text-xs" aria-label={`Candidate ${e.candidateUserId}`}>
                            {e.candidateUserId.slice(0, 12)}…
                          </TableCell>
                          <TableCell className="tabular-nums">{Number(e.applicationCount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </CompanyShell>
  );
}
```
> The original mobile-stacked card variant (`sm:hidden`) can be preserved as-is — omitted here for brevity; keep it if you want the ~375px treatment for the default pool. The search results `Table` is already responsive within its `Card`.
- [ ] **Step 2: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company build` clean; preview loop: load `/talent`, confirm the pool table renders by default; type "react" + Search → results table with fit badges replaces the pool; clear the query → pool returns; pick a stage filter → results narrow; empty query/no-match → `EmptyState`. Screenshot the results with fit badges.
- [ ] **Step 3: Commit** — `git commit -am "feat(sourcing): candidate search on /talent above the pool"`

### Task 4: Swap mock → real (after BE lands + `pnpm gen`)

- [ ] **Step 1:** After `SourcingService` lands, `npx pnpm@9.15.0 --filter @ip/api-client gen`; add the **`sourcing` quad** to `frontend/packages/api-client/src/index.ts` (import `SourcingService` from `./gen/sourcing_pb.js`; `export *`; `sourcing: Client<typeof SourcingService>` on `ApiClients`; `sourcing: createClient(SourcingService, transport)` in `clientsFromTransport`). *(If `SearchCandidates` was folded onto `DiscoveryService`, no new quad — use `api.discovery.searchCandidates`.)*
- [ ] **Step 2:** In `candidate-search.tsx`, replace `makeMockSourcingClient()` with `{ search: (p) => api.sourcing.searchCandidates(p) }` (pull `api` from `useAuth()`); map `applicationCount` via `Number(...)`. `--filter @ip/api-client typecheck` + `--filter @ip/company build` green.
- [ ] **Step 3: Commit** — `git commit -am "feat(sourcing): bind candidate search to SourcingService"`

---

## C. States & acceptance
- **States:** default = the existing pool (`LoadingState`/`ErrorState`+retry/`EmptyState`/table); search active = `Skeleton` while fetching → results `Table` (fit badge + stage badge + matched skills + app count) → `EmptyState` ("No candidates match") when empty. The search query only fires when non-empty (`enabled: query.length > 0`); clearing it restores the pool.
- **Responsive:** the search form is `sm:flex-row` (stacks at ~375px); both tables live inside `Card`s and scroll within their container; the default pool's mobile-card variant is preserved if kept.
- **Dark mode:** tokens only (`Badge tone`, `font-mono text-muted-foreground`) — automatic.
- **A11y:** the search bar is a `<form>` with labelled `Field`s; candidate handles carry `aria-label`; fit + stage are `Badge`s with text (not colour-only).
- **Privacy:** results render **only** the masked handle + counts + fit + stage + matched skills — **no ID/background/biometric data** (the contract excludes it; the handle is `slice(0,12)…` exactly like the pool). The search universe is the company's own applicants only — never a global index.
- **Acceptance:** matches `aptura_talent_pool`; `GetTalentPool` remains the default view; builds against the sourcing mock today and against `SearchCandidates` after `pnpm gen` (only the client binding flips); `--filter @ip/company build` + `typecheck` green.
