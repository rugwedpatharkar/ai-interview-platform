# Screen: Company profile page (public/SSR) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, marketplace).
> **Route:** `apps/candidate/app/companies/[id]/page.tsx` (NEW, public SSR) · **Mockup:** `marketplace/company-profile` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (Tier 3, Task 7; Company-profile resource)
> **Goal:** Anonymous, crawlable company page — branding (name, about, website, logo, locations) plus the company's published jobs and **funnel-derived trust signals** ("actively reviewing", "responds in ~X days") that differentiate Aptura's anti-ghosting promise.

Same public-SSR family as [job-detail](./job-detail.md): reads the **public REST** `/public/companies/{id}` + `/public/companies/{id}/jobs` (token-free) server-side. The job list reuses the **same `JobCardDTO` + `JobCard`** from [marketplace-search](./marketplace-search.md) (one card component across search, company page, and saved). The trust signals are computed from **funnel ground-truth** (real application-state timings), never self-reported — that is the whole point.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** new **`CompanyProfileService`** (admin gRPC, `api.companyProfile`) for the authed/editor path, plus its public REST mirror `GET /public/companies/{id}` + `GET /public/companies/{id}/jobs` on the `/public/*` Starlette app (shared `resources/company_profile.py`).

**gRPC** — `src/admin/app/routes/pb/company_profile.proto` (NEW file):
```proto
syntax = "proto3";
package admin.company_profile.v1;

// CompanyProfileService — public read of an employer's branding + trust signals.
// GetCompanyProfile is an UNAUTHENTICATED read of a published company (the public
// REST mirror shares the resource). Upsert/logo-presign live in the company app
// (company-branding.md) and are recruiter-scoped — out of scope for THIS screen.
service CompanyProfileService {
  rpc GetCompanyProfile(GetCompanyProfileRequest) returns (CompanyProfile);
}

message GetCompanyProfileRequest { string comp_id = 1; }

message CompanyProfile {
  string id        = 1;   // public company id (maps from internal comp_id)
  string name      = 2;
  string about     = 3;   // markdown/plaintext blurb ("" when unset)
  string website   = 4;   // "" when unset
  string logo      = 5;   // logo URL or ""
  repeated string locations = 6;   // ["Berlin", "Remote (EU)", …]
  TrustSignals trust = 7;
}

// Computed from funnel ground-truth (application state-transition timings) —
// NEVER self-reported. `actively_reviewing` = ≥1 application moved out of
// `applied` in the trailing window; `responds_in_days` = median applied→first-decision.
message TrustSignals {
  bool   actively_reviewing = 1;
  int32  responds_in_days   = 2;   // 0 when not enough data → FE hides the chip
  int32  open_jobs          = 3;
}
```

**REST mirror:**
```
GET /public/companies/{id}            → CompanyProfile (Cache-Control: public, max-age=300)
GET /public/companies/{id}/jobs?page=&page_size=≤24   → { jobs: JobCardDTO[], total, page, page_size }
```
`GET /public/companies/{id}` response (`200`):
```jsonc
{
  "id": "str", "name": "str", "about": "str|null", "website": "str|null",
  "logo": "str|null", "locations": ["str"],
  "trust": { "actively_reviewing": true, "responds_in_days": 4, "open_jobs": 7 }
}
```
`GET /public/companies/{id}/jobs` response: the **same** `jobs[]` element shape as `/public/jobs` (`JobCardDTO`) so `JobCard` is reused as-is. `404` `{"error":"not_found"}` for a company with no published presence.

- **Auth/scope:** none on both reads (a company is "public" once it has ≥1 published job, or a published profile — enforced in the resource). Rate-limited (shared `lib.redis.RateLimiter`), `page_size` capped at 24.
- **Backed by:** `resources/company_profile.py`:
  - `get_company_profile(comp_id)` → `company_profiles` find-one (branding) + `companies` (name) + a **trust aggregation** over `applications` (state-transition timings) for `{actively_reviewing, responds_in_days, open_jobs}`. The trust aggregation is read-only over the funnel; `responds_in_days` = median(`applied`→first non-`applied` transition) in the trailing window; `0` when n is below the min-sample threshold.
  - `list_company_jobs(comp_id, page)` → reuses `resources/discovery.search_jobs(comp_id=…, status="published")` projection (same `JobCardDTO`).
- **Excluded from the DTO (grep-test):** internal `comp_id` field name (mapped to public `id`), recruiter PII, draft jobs, raw funnel rows, applicant identities — only branding + aggregate trust ship.
- **Proto/REST file:** `src/admin/app/routes/pb/company_profile.proto` (NEW) + `src/admin/app/routes/company_profile.py` (NEW servicer) + `src/admin/app/routes/public_api.py` (add the two `/public/companies/*` routes). Collection: **`company_profiles`** (unique `comp_id`) — the index lives in the single authority `infra/db.py`.
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 7 (`/companies/[id]`) + the company-profile resource; trust signals trace to the anti-ghosting differentiator (no-ghosting KPIs).

**FE mock shape** (`apps/candidate/app/companies/[id]/types.ts`) — the FE codes against this until the endpoints land:
```ts
import type { JobCardDTO } from "../../jobs/types";   // the shared marketplace card DTO

export interface TrustSignals {
  activelyReviewing: boolean;
  respondsInDays: number;    // 0 → FE hides the "responds in ~X" chip
  openJobs: number;
}
export interface CompanyProfileDTO {
  id: string;
  name: string;
  about: string | null;
  website: string | null;
  logo: string | null;
  locations: string[];
  trust: TrustSignals;
}
export interface CompanyJobsResult {
  jobs: JobCardDTO[];
  total: number;
  page: number;
  pageSize: number;
}
```

> **Contract seam:** the SSR page codes against `CompanyProfileDTO` + `CompanyJobsResult` via `company-client.ts`. When the BE lands, only those two fetch functions swap (mock → real `/public/companies/{id}` and `/public/companies/{id}/jobs`); the page + `JobCard` are untouched. Reusing `JobCardDTO`/`JobCard` means the job grid is identical to search.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `apps/candidate/app/companies/[id]/types.ts` (the contract shapes above)
- Create: `apps/candidate/app/companies/[id]/company-client.ts` (real `/public/companies/{id}` + `/public/companies/{id}/jobs` fetch + `makeMockCompanyClient()` + a pure `trustChips` helper)
- Create: `apps/candidate/app/companies/[id]/page.tsx` (server component — SSR profile + job grid)
- Create: `apps/candidate/components/trust-badges.tsx` (presentational trust-signal chips)
- Create: `apps/candidate/app/companies/[id]/company-client.test.ts` (`trustChips` derivation + mock)
- Reuse: `apps/candidate/components/job-card.tsx` (from [marketplace-search](./marketplace-search.md)) + `apps/candidate/components/save-job-button.tsx` (from [saved-jobs](./saved-jobs.md), in each card's `action` slot)

**Components:** new `TrustBadges`; reuse `@ip/ui` `Card/CardHeader/CardTitle/CardContent`, `Badge`, `Avatar`, `Button`, `EmptyState`, `Skeleton`; reuse `JobCard`, `SaveJobButton`.
**Query keys:** none on the SSR page. (Any "load more" client island would use `["company-jobs", id, page]`.)

### Task 1: Contract types + `trustChips` helper (pure, testable)

- [ ] **Step 1: Write the failing test** — `apps/candidate/app/companies/[id]/company-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { trustChips } from "./company-client";

describe("trustChips", () => {
  it("emits 'actively reviewing' + 'responds in' when present", () => {
    expect(trustChips({ activelyReviewing: true, respondsInDays: 4, openJobs: 7 }))
      .toEqual(["Actively reviewing", "Responds in ~4 days", "7 open roles"]);
  });
  it("hides the responds chip when respondsInDays is 0 (insufficient data)", () => {
    expect(trustChips({ activelyReviewing: false, respondsInDays: 0, openJobs: 1 }))
      .toEqual(["1 open role"]);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test company-client` → FAIL (`trustChips` not defined).
- [ ] **Step 3: Implement `types.ts`** (paste the Part A shapes) **and** `company-client.ts`:
```ts
import type { CompanyProfileDTO, CompanyJobsResult, TrustSignals } from "./types";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Funnel-derived trust chips. Order: reviewing → responsiveness → open roles. */
export function trustChips(t: TrustSignals): string[] {
  const out: string[] = [];
  if (t.activelyReviewing) out.push("Actively reviewing");
  if (t.respondsInDays > 0) out.push(`Responds in ~${t.respondsInDays} days`);
  out.push(plural(t.openJobs, "open role"));
  return out;
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

export async function getCompanyProfile(id: string): Promise<CompanyProfileDTO> {
  const res = await fetch(`${BASE}/public/companies/${encodeURIComponent(id)}`, { next: { revalidate: 300 } });
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`company failed: ${res.status}`);
  return res.json();
}

export async function getCompanyJobs(id: string, page = 1): Promise<CompanyJobsResult> {
  const res = await fetch(`${BASE}/public/companies/${encodeURIComponent(id)}/jobs?page=${page}`, { next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`company jobs failed: ${res.status}`);
  return res.json();
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test company-client` → PASS
- [ ] **Step 5: Commit** — `git add apps/candidate/app/companies && git commit -m "feat(company-profile): public company client + trust-chip derivation"`

### Task 2: Mock client (lets SSR build before the endpoints exist)

- [ ] **Step 1:** Add `makeMockCompanyClient()` to `company-client.ts`:
```ts
import type { CompanyProfileDTO, CompanyJobsResult } from "./types";
import type { JobCardDTO } from "../../jobs/types";

const PROFILE: CompanyProfileDTO = {
  id: "c1",
  name: "Northwind",
  about: "We build developer tools used by 2M engineers. Remote-first, async by default.",
  website: "https://northwind.example",
  logo: null,
  locations: ["Berlin", "Remote (EU)"],
  trust: { activelyReviewing: true, respondsInDays: 4, openJobs: 3 },
};
const JOBS: JobCardDTO[] = [
  { jobId: "1", title: "Senior Frontend Engineer", companyName: "Northwind", companyId: "c1",
    location: "Remote (EU)", remoteMode: "remote", employmentType: "full_time",
    salaryMin: 120000, salaryMax: 160000, salaryCurrency: "USD",
    skills: ["react", "typescript"], postedAt: "2026-06-18T00:00:00Z", snippet: "Own the marketplace UI…" },
  { jobId: "2", title: "Backend Engineer (Go)", companyName: "Northwind", companyId: "c1",
    location: "Berlin", remoteMode: "hybrid", employmentType: "full_time",
    salaryMin: 110000, salaryMax: 150000, salaryCurrency: "EUR",
    skills: ["go", "mongodb"], postedAt: "2026-06-17T00:00:00Z", snippet: "Scale the funnel services…" },
];

export function makeMockCompanyClient() {
  return {
    profile: async (id: string): Promise<CompanyProfileDTO> => {
      if (id === "404") throw new Error("not_found");
      return { ...PROFILE, id };
    },
    jobs: async (id: string, page = 1): Promise<CompanyJobsResult> =>
      ({ jobs: JOBS, total: JOBS.length, page, pageSize: 24 }),
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
const mock = makeMockCompanyClient();
export const companyProfile = USE_MOCK ? mock.profile : getCompanyProfile;
export const companyJobs = USE_MOCK ? mock.jobs : getCompanyJobs;
```
- [ ] **Step 2: Commit** — `git commit -am "feat(company-profile): mock company client behind NEXT_PUBLIC_MOCK"`

### Task 3: `TrustBadges` component

- [ ] **Step 1:** Create `apps/candidate/components/trust-badges.tsx`:
```tsx
import { Badge } from "@ip/ui";
import type { TrustSignals } from "../app/companies/[id]/types";
import { trustChips } from "../app/companies/[id]/company-client";

/** Funnel-derived trust signals. The first chip ("Actively reviewing") gets the
 * success tone to anchor the anti-ghosting promise; the rest are neutral. */
export function TrustBadges({ trust }: { trust: TrustSignals }) {
  const chips = trustChips(trust);
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c, i) => (
        <Badge key={c} tone={i === 0 && trust.activelyReviewing ? "success" : undefined} variant="soft">
          {c}
        </Badge>
      ))}
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean. *(Reconcile `Badge` `tone`/`variant` against the real `@ip/ui` `BadgeProps` if flagged.)*
- [ ] **Step 3: Commit** — `git commit -am "feat(company-profile): TrustBadges"`

### Task 4: SSR company page (server component) + reused job grid

- [ ] **Step 1:** Create `apps/candidate/app/companies/[id]/page.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, Avatar, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@ip/ui";

import { companyProfile, companyJobs } from "./company-client";
import { TrustBadges } from "../../../components/trust-badges";
import { JobCard } from "../../../components/job-card";
import { SaveJobButton } from "../../../components/save-job-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = await companyProfile(id).catch(() => null);
  return c ? { title: `${c.name} · Aptura`, description: c.about ?? undefined } : { title: "Company · Aptura" };
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await companyProfile(id).catch((e) => {
    if (e instanceof Error && e.message === "not_found") return null;
    throw e;
  });
  if (!company) notFound();
  const { jobs } = await companyJobs(id).catch(() => ({ jobs: [], total: 0, page: 1, pageSize: 24 }));

  return (
    <AppShell title="Interview Platform" nav={<Link href="/jobs">Browse jobs</Link>}>
      <Card>
        <CardHeader className="flex flex-row items-start gap-4">
          <Avatar name={company.name} src={company.logo ?? undefined} size="lg" />
          <div className="flex flex-col gap-2">
            <CardTitle>{company.name}</CardTitle>
            {company.website && (
              <Button asChild variant="ghost" size="sm" className="self-start px-0">
                <a href={company.website} target="_blank" rel="noopener noreferrer">{company.website}</a>
              </Button>
            )}
            <TrustBadges trust={company.trust} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {company.about && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{company.about}</p>}
          {company.locations.length > 0 && (
            <p className="text-sm text-muted-foreground">📍 {company.locations.join(" · ")}</p>
          )}
        </CardContent>
      </Card>

      <section className="mt-6 flex flex-col gap-3">
        <h2 className="font-display text-lg font-medium text-foreground">Open roles</h2>
        {jobs.length === 0 ? (
          <EmptyState title="No open roles right now" description="Check back soon or browse other companies." />
        ) : (
          jobs.map((j) => <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />)
        )}
      </section>
    </AppShell>
  );
}
```
- [ ] **Step 2: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: load `/companies/c1`, confirm branding + trust chips + the reused `JobCard` grid render server-side (view source → company name + job titles present, token-free), each card links to its `/jobs/{id}`, and `/companies/404` renders `not-found`. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(company-profile): public SSR company page + reused job grid"`

### Task 5: Link-in + SEO

- [ ] **Step 1:** Confirm `JobCard` + the job-detail header (from [job-detail](./job-detail.md)) link the company name to `/companies/{companyId}` — verify the round-trip job→company→job. **Step 2:** Extend `apps/candidate/app/sitemap.ts` to emit `/companies/{id}` for each company with published jobs (dedupe from `/public/jobs`). **Step 3: Verify** `--filter @ip/candidate build` clean. **Step 4: Commit** — `git commit -am "feat(company-profile): sitemap entries for company pages"`.

> **Note (FE scope):** `JobCard` must accept an optional `action?: ReactNode` slot (the marketplace plan, Task 3, already specifies this for `SaveJobButton`). If it doesn't yet, add the prop in that shared component — one line — rather than forking the card here.

---

## C. States & acceptance
- **States:** loading (server fetch — Next streams), **not-found** (`notFound()` for a company with no published presence), error (genuine fetch failure → `error.tsx`); job grid has its own empty state ("No open roles right now"); trust chips degrade gracefully (responsiveness chip hidden when `respondsInDays === 0`).
- **Responsive:** header stacks (logo over name/website/trust) on mobile; job cards single-column.
- **Dark mode:** tokens only — automatic.
- **A11y:** website is an external link (`rel="noopener noreferrer"`); avatar named; cards are links; "Open roles" is a real `<h2>`.
- **Acceptance:** matches the `marketplace/company-profile` mockup; SSR HTML crawlable (name + about + job titles in initial HTML, token-free); **trust signals are funnel-derived, never self-reported**; `JobCardDTO`/`JobCard` reused verbatim from search; `--filter @ip/candidate build` + `typecheck` green; works against the mock today and against `/public/companies/{id}` + `/public/companies/{id}/jobs` once the BE lands.
