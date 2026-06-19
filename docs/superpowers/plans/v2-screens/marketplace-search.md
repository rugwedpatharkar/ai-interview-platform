# Screen: Job marketplace / search — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, headline screen).
> **Route:** `frontend/apps/candidate/app/jobs/page.tsx` · **Mockup:** `aptura_landing_page` search + the marketplace screen · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md)
> **Goal:** Anonymous candidates search/browse the published job catalog with filters + facets; clicking a job opens its public detail; "Apply" requires sign-in.

This screen is the **one public, SSR, crawlable** surface (SEO), so it diverges from the authed-gRPC pattern: it reads the **public REST** `/public/jobs` (no token) server-side for the initial render + client-side for filter interactions.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** ai-agents-style public REST on **admin** via the `/public/*` Starlette app (`_oauth_dispatcher` precedent) — shares the `resources/discovery.py` layer with the authed `DiscoveryService` gRPC.

**Endpoint:**
```
GET /public/jobs?q=<str>&location=<str>&remote=<remote|hybrid|onsite>
                 &type=<full_time|…>&level=<str>&skills=<csv>
                 &sort=<relevance|recent>&page=<int>&page_size=<int≤24>
```
**Response (`200`, `Cache-Control: public, max-age=60`):**
```jsonc
{
  "jobs": [{
    "job_id": "str", "title": "str", "company_name": "str", "company_id": "str",
    "location": "str|null", "remote_mode": "remote|hybrid|onsite|null",
    "employment_type": "str|null", "salary_min": 0, "salary_max": 0, "salary_currency": "USD|null",
    "skills": ["str"], "posted_at": "ISO", "snippet": "str"      // first ~160 chars of jd
  }],
  "facets": {
    "remote_mode": [{"value":"remote","count":12}, …],
    "employment_type": [{"value":"full_time","count":40}, …],
    "experience_level": [{"value":"senior","count":8}, …]
  },
  "total": 124, "page": 1, "page_size": 24
}
```
- **Auth/scope:** none (published jobs only — enforced in the resource). Rate-limited (`lib.redis.RateLimiter`), page_size capped at 24.
- **Backed by:** `resources/discovery.search_jobs()` → Mongo `$text`(title,jd_text,skills) + `$facet` aggregation over `jobs` where `status="published"`; secondary sort `posted_at desc` on textScore tie; `posted_at` **backfilled** for legacy jobs.
- **Excluded from the DTO (grep-test):** `comp_id` internals, draft jobs, `aptitude_config`, `required_topics` — only the fields above ship.
- **Proto/REST file:** `src/admin/app/routes/public_api.py` (the Starlette `/public/*` app, mounted in `main.py`). The authed mirror `DiscoveryService.SearchJobs` (`routes/pb/discovery.proto`) shares `resources/discovery.py`.
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (Inc 1, search-tech = Mongo `$text`+`$facet`).

**FE mock shape** (`frontend/apps/candidate/app/jobs/types.ts`) — the FE codes against this until the endpoint lands:
```ts
export type RemoteMode = "remote" | "hybrid" | "onsite";
export interface JobCardDTO {
  jobId: string; title: string; companyName: string; companyId: string;
  location: string | null; remoteMode: RemoteMode | null; employmentType: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null;
  skills: string[]; postedAt: string; snippet: string;
}
export interface FacetBucket { value: string; count: number; }
export interface SearchJobsResult {
  jobs: JobCardDTO[];
  facets: { remoteMode: FacetBucket[]; employmentType: FacetBucket[]; experienceLevel: FacetBucket[] };
  total: number; page: number; pageSize: number;
}
export interface SearchJobsParams {
  q?: string; location?: string; remote?: RemoteMode; type?: string; level?: string;
  skills?: string[]; sort?: "relevance" | "recent"; page?: number; pageSize?: number;
}
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/candidate/app/jobs/types.ts` (the contract shape above)
- Create: `frontend/apps/candidate/app/jobs/search-client.ts` (real `/public/jobs` fetch + `makeMockSearchClient()`)
- Create: `frontend/apps/candidate/app/jobs/page.tsx` (SSR server component — initial results)
- Create: `frontend/apps/candidate/app/jobs/marketplace.tsx` (`"use client"` interactive island — filters + pagination)
- Create: `frontend/apps/candidate/components/job-card.tsx`, `filter-sidebar.tsx`, `job-search-bar.tsx`
- Create: `frontend/apps/candidate/app/jobs/search-client.test.ts` (params→querystring + mock)

**Components:** new `JobCard`, `FilterSidebar`, `JobSearchBar`, `Pagination`; reuse `@ip/ui` `Card`, `Badge`, `Input`, `Select`, `Checkbox`, `Button`, `EmptyState`, `Skeleton`.
**Query keys:** `["public-jobs", params]` (TanStack Query in the client island).

### Task 1: Contract types + querystring builder (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/apps/candidate/app/jobs/search-client.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { toQuery } from "./search-client";

describe("toQuery", () => {
  it("serializes params, drops empties, joins skills", () => {
    expect(toQuery({ q: "react", remote: "remote", skills: ["ts","react"], page: 2 }))
      .toBe("q=react&remote=remote&skills=ts%2Creact&page=2");
  });
  it("returns empty string for no params", () => {
    expect(toQuery({})).toBe("");
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test search-client` → FAIL (`toQuery` not defined). *(If the app has no test runner wired, add `vitest` to `apps/candidate` devDeps + a `test` script first — fold into this task.)*
- [ ] **Step 3: Implement `types.ts`** (paste the contract shape from Part A) **and** `search-client.ts`:
```ts
import type { SearchJobsParams, SearchJobsResult } from "./types";

export function toQuery(p: SearchJobsParams): string {
  const u = new URLSearchParams();
  if (p.q) u.set("q", p.q);
  if (p.location) u.set("location", p.location);
  if (p.remote) u.set("remote", p.remote);
  if (p.type) u.set("type", p.type);
  if (p.level) u.set("level", p.level);
  if (p.skills?.length) u.set("skills", p.skills.join(","));
  if (p.sort) u.set("sort", p.sort);
  if (p.page && p.page > 1) u.set("page", String(p.page));
  if (p.pageSize) u.set("page_size", String(p.pageSize));
  return u.toString();
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

export async function searchJobs(p: SearchJobsParams, signal?: AbortSignal): Promise<SearchJobsResult> {
  const res = await fetch(`${BASE}/public/jobs?${toQuery(p)}`, { signal });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test search-client` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/candidate/app/jobs && git commit -m "feat(marketplace): public-jobs search client + querystring builder"`

### Task 2: Mock client (lets the screen build before the endpoint exists)

- [ ] **Step 1:** Add `makeMockSearchClient()` to `search-client.ts`:
```ts
import type { JobCardDTO, SearchJobsResult, SearchJobsParams } from "./types";
const FIXTURE: JobCardDTO[] = [
  { jobId:"1", title:"Senior Frontend Engineer", companyName:"Northwind", companyId:"c1",
    location:"Remote", remoteMode:"remote", employmentType:"full_time",
    salaryMin:120000, salaryMax:160000, salaryCurrency:"USD",
    skills:["react","typescript"], postedAt:"2026-06-18T00:00:00Z",
    snippet:"Build the Aptura candidate experience…" },
  // …5–6 more varied fixtures…
];
export function makeMockSearchClient() {
  return async (p: SearchJobsParams): Promise<SearchJobsResult> => {
    const jobs = FIXTURE.filter(j => !p.q || j.title.toLowerCase().includes(p.q.toLowerCase()));
    return { jobs, total: jobs.length, page: p.page ?? 1, pageSize: 24,
      facets: { remoteMode:[{value:"remote",count:3}], employmentType:[{value:"full_time",count:5}], experienceLevel:[{value:"senior",count:2}] } };
  };
}
```
- [ ] **Step 2:** Toggle in `search-client.ts`: `export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";` and an exported `query = USE_MOCK ? makeMockSearchClient() : searchJobs;`
- [ ] **Step 3: Commit** — `git commit -am "feat(marketplace): mock search client behind NEXT_PUBLIC_MOCK"`

### Task 3: `JobCard` component

- [ ] **Step 1:** Create `frontend/apps/candidate/components/job-card.tsx`:
```tsx
import Link from "next/link";
import { Card, Badge } from "@ip/ui";
import type { JobCardDTO } from "../app/jobs/types";

const salary = (j: JobCardDTO) =>
  j.salaryMin && j.salaryMax ? `${j.salaryCurrency ?? ""} ${(j.salaryMin/1000)|0}k–${(j.salaryMax/1000)|0}k` : null;

export function JobCard({ job }: { job: JobCardDTO }) {
  return (
    <Link href={`/jobs/${job.jobId}`}>
      <Card className="p-4 hover:border-border-strong transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-medium text-foreground">{job.title}</h3>
            <p className="text-sm text-muted-foreground">{job.companyName}</p>
          </div>
          {job.remoteMode && <Badge tone="info">{job.remoteMode}</Badge>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{job.snippet}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.location && <Badge variant="soft">{job.location}</Badge>}
          {salary(job) && <Badge variant="soft">{salary(job)}</Badge>}
          {job.skills.slice(0,3).map(s => <Badge key={s} variant="soft">{s}</Badge>)}
        </div>
      </Card>
    </Link>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean (adjust `Badge` `variant`/`tone` props to the real `@ip/ui` API if typecheck flags them).
- [ ] **Step 3: Commit** — `git commit -am "feat(marketplace): JobCard"`

### Task 4: `FilterSidebar` + `JobSearchBar`

- [ ] **Step 1:** Create `filter-sidebar.tsx` (controlled: takes `facets` + `value` + `onChange`) using `@ip/ui` `Checkbox` + `Select` for remote/type/level/skills. *(Full code: a `<form>` of facet groups; each `Checkbox` toggles a value in the `SearchJobsParams`.)*
- [ ] **Step 2:** Create `job-search-bar.tsx` (keyword `Input` + location `Input` + `Button`; calls `onSearch(params)`).
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(marketplace): FilterSidebar + JobSearchBar"`

### Task 5: SSR page + interactive client island

- [ ] **Step 1:** Create `frontend/apps/candidate/app/jobs/page.tsx` (server component — SSR initial results, crawlable):
```tsx
import { searchJobs } from "./search-client";
import { Marketplace } from "./marketplace";

export const metadata = { title: "Jobs · Aptura" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  const sp = await searchParams;
  const initial = await searchJobs({ q: sp.q, location: sp.location }).catch(() => null);
  return <Marketplace initial={initial} initialParams={{ q: sp.q, location: sp.location }} />;
}
```
- [ ] **Step 2:** Create `frontend/apps/candidate/app/jobs/marketplace.tsx` (`"use client"` — filters + pagination via TanStack Query, seeded by `initial`):
```tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandidateShell } from "../../components/candidate-shell";
import { PageHeader, EmptyState, Skeleton } from "@ip/ui";
import { JobCard } from "../../components/job-card";
import { FilterSidebar } from "../../components/filter-sidebar";
import { JobSearchBar } from "../../components/job-search-bar";
import { query } from "./search-client";
import type { SearchJobsParams, SearchJobsResult } from "./types";

export function Marketplace({ initial, initialParams }: { initial: SearchJobsResult | null; initialParams: SearchJobsParams }) {
  const [params, setParams] = useState<SearchJobsParams>(initialParams);
  const q = useQuery({ queryKey: ["public-jobs", params], queryFn: () => query(params), initialData: sameAs(params, initialParams) ? initial ?? undefined : undefined });
  const jobs = q.data?.jobs ?? [];
  return (
    <CandidateShell>
      <PageHeader title="Find your next role" />
      <JobSearchBar value={params} onSearch={setParams} />
      <div className="mt-4 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <FilterSidebar facets={q.data?.facets} value={params} onChange={setParams} />
        <div className="flex flex-col gap-3">
          {q.isLoading && <><Skeleton className="h-24"/><Skeleton className="h-24"/></>}
          {!q.isLoading && jobs.length === 0 && <EmptyState title="No matching jobs" description="Try broadening your filters." />}
          {jobs.map(j => <JobCard key={j.jobId} job={j} />)}
        </div>
      </div>
    </CandidateShell>
  );
}
const sameAs = (a: SearchJobsParams, b: SearchJobsParams) => JSON.stringify(a) === JSON.stringify(b);
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: start dev, load `/jobs`, confirm SSR list renders, typing in the search bar re-queries, filters narrow results, empty state shows when no match. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(marketplace): SSR /jobs page + interactive filter island"`

### Task 6: SEO surface

- [ ] **Step 1:** Add `frontend/apps/candidate/app/sitemap.ts` + `robots.ts` sourcing published jobs from `/public/jobs`. **Step 2:** Verify `--filter @ip/candidate build` clean. **Step 3:** Commit.

---

## C. States & acceptance
- **States:** loading (`Skeleton`), empty (`EmptyState`), error (catch → inline message), success (cards). Filter changes re-query; URL reflects `?q=&…` (shareable).
- **Responsive:** sidebar collapses under the results on mobile (`md:` grid); search bar stacks.
- **Dark mode:** tokens only — automatic.
- **A11y:** search bar is a `<form>` with labels; facet checkboxes labelled; cards are links.
- **Acceptance:** matches the marketplace mockup; SSR HTML is crawlable (job titles in initial HTML, token-free); `--filter @ip/candidate build` + `typecheck` green; works against the mock today and against `/public/jobs` once the BE lands (flip `NEXT_PUBLIC_MOCK`).
