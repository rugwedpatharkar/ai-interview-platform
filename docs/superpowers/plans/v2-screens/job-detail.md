# Screen: Job detail (public/SSR) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, marketplace).
> **Route:** `apps/candidate/app/jobs/[id]/page.tsx` (convert to public SSR) · **Mockup:** `marketplace/job-detail` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (Tier 3, Task 7)
> **Goal:** Anonymous, crawlable job-detail page that renders the full public job DTO (title, JD, location, remote mode, employment type, salary, skills, posted-at, company); **Apply** and **Save** are client islands that require sign-in.

This is the SSR sibling of [marketplace-search](./marketplace-search.md): it reads the **public REST** `/public/jobs/{id}` (no token) server-side for the initial render so the JD is in the crawlable HTML. The existing page is the **authed-gRPC** version (`api.jobs.getPublicJob({ jobId })` → `{ title, jdText }`); this plan **replaces it** with the public SSR shell + an `<ApplyIsland>` that keeps the *exact* current apply/consent contract (`api.applications.apply({ jobId, consent })`, the `job-consent:<id>` localStorage key, and the `["recommendations"]`/`["applications"]` invalidations). **Do not change the apply contract** — only move it into the island.

---

## A. Backend contract (hand this to a backend session)

**Status:** EXTEND · **Service:** the existing **`GetPublicJob`** (admin `JobService`, `api.jobs.getPublicJob`) grows to the full public DTO **and** a public REST mirror `GET /public/jobs/{id}` is added on the `/public/*` Starlette app (shared with [marketplace-search](./marketplace-search.md)'s `/public/jobs` over the same `resources/discovery.py`).

**Why both:** the SSR page reads `/public/jobs/{id}` (token-free, crawlable, `Cache-Control`); the authed island re-uses nothing from it (Apply is its own RPC). The gRPC `GetPublicJob` is extended in lockstep so any authed surface (e.g. a logged-in candidate deep-linking) gets the same shape.

**gRPC delta** — `src/admin/app/routes/pb/job.proto` (extend the existing `PublicJob` message; `GetPublicJob(GetJobRequest)` signature is unchanged, only the response grows):
```proto
// service admin.job.v1.JobService — EXTEND existing rpc (signature unchanged)
rpc GetPublicJob(GetJobRequest) returns (PublicJob);   // already exists

message PublicJob {
  string job_id          = 1;   // existing
  string title           = 2;   // existing
  string jd_text         = 3;   // existing
  string location        = 4;   // NEW (nullable → "" when unset)
  string remote_mode     = 5;   // NEW "remote" | "hybrid" | "onsite" | ""
  string employment_type = 6;   // NEW "full_time" | "part_time" | "contract" | "internship" | ""
  int64  salary_min      = 7;   // NEW 0 when unset
  int64  salary_max      = 8;   // NEW 0 when unset
  string salary_currency = 9;   // NEW "USD" | "" when unset
  repeated string skills = 10;  // NEW
  string posted_at       = 11;  // NEW ISO-8601 (backfilled for legacy jobs)
  Company company        = 12;  // NEW
}
message Company {           // NEW — the public face of the posting org
  string id   = 1;
  string name = 2;
  string logo = 3;          // logo URL or "" (links to /companies/{id})
}
```

**REST mirror** — `GET /public/jobs/{id}`:
```
GET /public/jobs/{id}
```
**Response (`200`, `Cache-Control: public, max-age=120`):**
```jsonc
{
  "job_id": "str", "title": "str", "jd_text": "str",
  "location": "str|null", "remote_mode": "remote|hybrid|onsite|null",
  "employment_type": "full_time|part_time|contract|internship|null",
  "salary_min": 0, "salary_max": 0, "salary_currency": "USD|null",
  "skills": ["str"], "posted_at": "ISO",
  "company": { "id": "str", "name": "str", "logo": "str|null" }
}
```
`404` `{"error":"not_found"}` for a missing/unpublished/draft job (opaque — never leak draft existence).

- **Auth/scope:** none (published jobs only — enforced in `resources/discovery.get_public_job_detail()`; draft/closed → `404`). Rate-limited (`lib.redis.RateLimiter`), same limiter as `/public/jobs`.
- **Backed by:** `resources/discovery.get_public_job_detail(job_id)` → Mongo `jobs` find-one where `status="published"`, projecting the public fields **only**, batched-join the `companies`/`company_profiles` doc for `{id,name,logo}`. Shares the published-only + DTO-projection logic with `search_jobs()` (single source of truth).
- **Excluded from the DTO (grep-test):** `comp_id` internals, `aptitude_config`, `required_topics`, `gate_mode`, recruiter notes, applicant counts — **only** the fields above ship. (Internal `comp_id` is mapped to the public `company.id`; never echo the raw `comp_id` field name.)
- **Proto/REST file:** `src/admin/app/routes/pb/job.proto` (extend) + `src/admin/app/routes/job.py` (`GetPublicJob` servicer maps the new fields) + `src/admin/app/routes/public_api.py` (the `/public/*` Starlette app — add the `/public/jobs/{id}` route next to `/public/jobs`).
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 7 (`/jobs/[id]` SSR detail + Apply/Save islands) and Task 1 (extended `jobs` fields: location/remote_mode/employment_type/salary/skills/posted_at).

**FE mock shape** (`apps/candidate/app/jobs/[id]/types.ts`) — the FE codes against this until the endpoint lands:
```ts
export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";

export interface PublicCompany {
  id: string;
  name: string;
  logo: string | null;
}
export interface JobDetailDTO {
  jobId: string;
  title: string;
  jdText: string;
  location: string | null;
  remoteMode: RemoteMode | null;
  employmentType: EmploymentType | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  skills: string[];
  postedAt: string;          // ISO
  company: PublicCompany;
}
```

> **Contract seam:** the SSR layer codes against `JobDetailDTO` via `getPublicJobDetail(id)` in `detail-client.ts`. When the BE lands, only that fetch function changes (mock → real `/public/jobs/{id}`); the page + island are untouched. The Apply island already targets the live `api.applications.apply` RPC, so it is real from day one.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `apps/candidate/app/jobs/[id]/types.ts` (the contract shape above)
- Create: `apps/candidate/app/jobs/[id]/detail-client.ts` (real `/public/jobs/{id}` fetch + `makeMockDetailClient()` + a pure `fmtSalary` helper)
- Modify: `apps/candidate/app/jobs/[id]/page.tsx` → **server component** (SSR detail; renders the static shell + mounts the islands)
- Create: `apps/candidate/app/jobs/[id]/apply-island.tsx` (`"use client"` — lifted verbatim from today's page: consent + Apply, unchanged contract)
- Create: `apps/candidate/components/job-meta.tsx` (presentational badge row: location/remote/type/salary/skills — reused on the marketplace card detail too)
- Create: `apps/candidate/app/jobs/[id]/detail-client.test.ts` (`fmtSalary` + mock)
- Reuse: `apps/candidate/components/save-job-button.tsx` (the optimistic toggle from [saved-jobs](./saved-jobs.md) — mounted in the header; renders **null** when no token)

**Components:** new `JobMeta`; reuse `@ip/ui` `Card/CardHeader/CardTitle/CardContent/CardDescription`, `Badge`, `Button`, `Avatar`, `Checkbox`, `LoadingState`, `ErrorState`, `toast`; reuse `SaveJobButton`.
**Query keys:** none on the SSR page (server fetch). The Apply island uses `useMutation` (no key); `SaveJobButton` reads/writes `["saved-jobs"]`.

### Task 1: Contract types + `fmtSalary` helper (pure, testable)

- [ ] **Step 1: Write the failing test** — `apps/candidate/app/jobs/[id]/detail-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fmtSalary } from "./detail-client";

describe("fmtSalary", () => {
  it("formats a min–max band in k with currency", () => {
    expect(fmtSalary({ salaryMin: 120000, salaryMax: 160000, salaryCurrency: "USD" })).toBe("USD 120k–160k");
  });
  it("returns null when the band is incomplete", () => {
    expect(fmtSalary({ salaryMin: 120000, salaryMax: null, salaryCurrency: "USD" })).toBeNull();
    expect(fmtSalary({ salaryMin: null, salaryMax: null, salaryCurrency: null })).toBeNull();
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test detail-client` → FAIL (`fmtSalary` not defined). *(If no test runner is wired in `apps/candidate`, add `vitest` to devDeps + a `test` script — fold into this task; mirror whatever [marketplace-search](./marketplace-search.md) Task 1 established.)*
- [ ] **Step 3: Implement `types.ts`** (paste the Part A shape) **and** `detail-client.ts`:
```ts
import type { JobDetailDTO } from "./types";

export function fmtSalary(j: Pick<JobDetailDTO, "salaryMin" | "salaryMax" | "salaryCurrency">): string | null {
  if (!j.salaryMin || !j.salaryMax) return null;
  return `${j.salaryCurrency ?? ""} ${(j.salaryMin / 1000) | 0}k–${(j.salaryMax / 1000) | 0}k`.trim();
}

const BASE = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

export async function getPublicJobDetail(id: string): Promise<JobDetailDTO> {
  const res = await fetch(`${BASE}/public/jobs/${encodeURIComponent(id)}`, {
    next: { revalidate: 120 },     // matches the BE Cache-Control
  });
  if (res.status === 404) throw new Error("not_found");
  if (!res.ok) throw new Error(`detail failed: ${res.status}`);
  return res.json();
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test detail-client` → PASS
- [ ] **Step 5: Commit** — `git add apps/candidate/app/jobs/\[id\] && git commit -m "feat(job-detail): public-job-detail client + salary formatter"`

### Task 2: Mock client (lets SSR build before the endpoint exists)

- [ ] **Step 1:** Add `makeMockDetailClient()` to `detail-client.ts`:
```ts
import type { JobDetailDTO } from "./types";

const FIXTURE: JobDetailDTO = {
  jobId: "1",
  title: "Senior Frontend Engineer",
  jdText:
    "We're building the Aptura candidate experience in Next.js + React.\n\n" +
    "You will own the marketplace UI end to end, partner with design on the violet/dark token system, " +
    "and ship accessible, fast surfaces.\n\nRequirements:\n• 5+ years React\n• TypeScript\n• A taste for craft.",
  location: "Remote (EU)",
  remoteMode: "remote",
  employmentType: "full_time",
  salaryMin: 120000,
  salaryMax: 160000,
  salaryCurrency: "USD",
  skills: ["react", "typescript", "next.js", "tailwind"],
  postedAt: "2026-06-18T00:00:00Z",
  company: { id: "c1", name: "Northwind", logo: null },
};

export function makeMockDetailClient() {
  return async (id: string): Promise<JobDetailDTO> => {
    if (id === "404") throw new Error("not_found");
    return { ...FIXTURE, jobId: id };
  };
}

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export const detail = USE_MOCK ? makeMockDetailClient() : getPublicJobDetail;
```
- [ ] **Step 2: Commit** — `git commit -am "feat(job-detail): mock detail client behind NEXT_PUBLIC_MOCK"`

### Task 3: `JobMeta` presentational row

- [ ] **Step 1:** Create `apps/candidate/components/job-meta.tsx`:
```tsx
import { Badge } from "@ip/ui";
import type { JobDetailDTO } from "../app/jobs/[id]/types";
import { fmtSalary } from "../app/jobs/[id]/detail-client";

/** Compact metadata badge row reused on the detail page (and the marketplace card). */
export function JobMeta({ job }: { job: Pick<JobDetailDTO, "location" | "remoteMode" | "employmentType" | "salaryMin" | "salaryMax" | "salaryCurrency" | "skills"> }) {
  const salary = fmtSalary(job);
  return (
    <div className="flex flex-wrap gap-1.5">
      {job.remoteMode && <Badge tone="info">{job.remoteMode}</Badge>}
      {job.location && <Badge variant="soft">{job.location}</Badge>}
      {job.employmentType && <Badge variant="soft">{job.employmentType.replace("_", " ")}</Badge>}
      {salary && <Badge variant="soft">{salary}</Badge>}
      {job.skills.map((s) => (
        <Badge key={s} variant="soft">{s}</Badge>
      ))}
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean. *(If typecheck flags `Badge` `tone`/`variant`, reconcile against the real `@ip/ui` `BadgeProps` — `tone` ∈ status families, `variant` ∈ `solid|soft|outline`.)*
- [ ] **Step 3: Commit** — `git commit -am "feat(job-detail): JobMeta badge row"`

### Task 4: Apply island (lift the existing client logic verbatim)

The current `page.tsx` is `"use client"` with the consent + Apply flow. Move that flow into `apply-island.tsx` **unchanged** — same consent key, same mutation, same invalidations — so the SSR page can be a server component.

- [ ] **Step 1:** Create `apps/candidate/app/jobs/[id]/apply-island.tsx`:
```tsx
"use client";

import { Button, Checkbox, toast } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../../../lib/auth";

/** Apply control — requires auth. Keeps the EXACT contract from the old page:
 * consent key `job-consent:<id>`, `api.applications.apply({ jobId, consent })`,
 * and the `["recommendations"]`/`["applications"]` invalidations on success. */
export function ApplyIsland({ jobId }: { jobId: string }) {
  const { api, token, ready } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const consentKey = `job-consent:${jobId}`;
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    setConsent(localStorage.getItem(consentKey) === "true");
  }, [consentKey]);

  function toggleConsent(v: boolean) {
    setConsent(v);
    localStorage.setItem(consentKey, String(v));
  }

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId, consent }),
    onSuccess: () => {
      toast.success("Application submitted");
      localStorage.removeItem(consentKey);
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      router.push("/");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Signed-out visitors see a sign-in CTA instead of the apply control (the page itself is public).
  if (ready && !token) {
    return (
      <Button asChild className="self-start">
        <Link href={`/login?next=/jobs/${jobId}`}>Sign in to apply</Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Checkbox checked={consent} onCheckedChange={(v) => toggleConsent(v === true)} />
        I consent to AI-assisted screening of my application.
      </label>
      <Button
        onClick={() => apply.mutate()}
        disabled={!consent || apply.isPending}
        loading={apply.isPending}
        className="self-start"
      >
        {apply.isPending ? "Applying…" : "Apply"}
      </Button>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(job-detail): ApplyIsland (consent+apply, contract preserved)"`

### Task 5: SSR detail page (server component) + mount islands

- [ ] **Step 1:** Replace `apps/candidate/app/jobs/[id]/page.tsx` with a server component:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AppShell, Avatar, Card, CardContent, CardHeader, CardTitle, CardDescription } from "@ip/ui";

import { detail } from "./detail-client";
import { JobMeta } from "../../../components/job-meta";
import { ApplyIsland } from "./apply-island";
import { SaveJobButton } from "../../../components/save-job-button";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const job = await detail(id).catch(() => null);
  if (!job) return { title: "Job · Aptura" };
  return {
    title: `${job.title} · ${job.company.name} · Aptura`,
    description: job.jdText.slice(0, 160),
  };
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await detail(id).catch((e) => {
    if (e instanceof Error && e.message === "not_found") return null;
    throw e;     // genuine fetch failure → Next error boundary (error.tsx)
  });
  if (!job) notFound();   // → not-found.tsx

  return (
    <AppShell title="Interview Platform" nav={<Link href="/jobs">Browse jobs</Link>}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar name={job.company.name} src={job.company.logo ?? undefined} size="md" />
            <div>
              <CardTitle>{job.title}</CardTitle>
              <CardDescription>
                <Link href={`/companies/${job.company.id}`} className="hover:underline">
                  {job.company.name}
                </Link>
              </CardDescription>
            </div>
          </div>
          {/* Save toggle — renders null when signed out (client island) */}
          <SaveJobButton jobId={job.jobId} />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <JobMeta job={job} />
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{job.jdText}</p>
          <ApplyIsland jobId={job.jobId} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
```
- [ ] **Step 2: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: load `/jobs/1`, confirm the JD + meta render server-side (view source → title/JD present, **no token**), the Apply control shows "Sign in to apply" when logged out and the consent+Apply flow when logged in, and `/jobs/404` renders `not-found`. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(job-detail): public SSR detail page + islands"`

### Task 6: Wire detail into the marketplace + SEO

- [ ] **Step 1:** Confirm `JobCard` (from [marketplace-search](./marketplace-search.md)) links to `/jobs/${jobId}` (it does) — no change, just verify the round-trip search→detail. **Step 2:** Extend `apps/candidate/app/sitemap.ts` (added in marketplace Task 6) to emit a `/jobs/{id}` URL per published job from `/public/jobs`. **Step 3: Verify** `--filter @ip/candidate build` clean. **Step 4: Commit** — `git commit -am "feat(job-detail): sitemap entries for job detail pages"`.

---

## C. States & acceptance
- **States:** loading (server fetch — Next streams; no client spinner on the shell), **not-found** (`notFound()` → `not-found.tsx` for draft/missing), error (genuine fetch failure → `error.tsx` boundary). The Apply island has its own pending/success/error (`toast`); signed-out → "Sign in to apply" CTA. `SaveJobButton` → null when signed out.
- **Responsive:** header stacks (avatar + title over the save button) on mobile; meta badges wrap; JD full-width.
- **Dark mode:** tokens only — automatic.
- **A11y:** company link + breadcrumb are real links; consent is a labelled checkbox; Apply is a `<button>`; avatar has a name.
- **Acceptance:** matches the `marketplace/job-detail` mockup; SSR HTML is crawlable (title + JD + company in initial HTML, token-free); the **apply/consent contract is byte-for-byte preserved** (consent key, RPC, invalidations); `--filter @ip/candidate build` + `typecheck` green; works against the mock today and against `/public/jobs/{id}` once the BE lands (flip `NEXT_PUBLIC_MOCK`).
