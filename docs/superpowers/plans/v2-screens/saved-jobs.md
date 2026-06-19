# Screen: Saved jobs — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, marketplace).
> **Route:** `apps/candidate/app/saved/page.tsx` (NEW, authed) · **Mockup:** `marketplace/saved-jobs` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (Tier 3 Task 7 + Tier 4 Task 9, `SavedJobsService`)
> **Goal:** Signed-in candidates bookmark jobs from any card/detail and review them on `/saved`; the toggle is a reusable `SaveJobButton` with an **optimistic** mutation so the bookmark flips instantly.

This screen is **authed gRPC** (the canonical pattern), unlike the public-SSR [job-detail](./job-detail.md)/[company-profile](./company-profile.md). The headline FE work is the **optimistic toggle** (`useMutation` with `onMutate`/`onError`/`onSettled` over the `["saved-jobs"]` cache) shared by `JobCard` (via its `action` slot), the job-detail header, and the `/saved` list itself.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** new **`SavedJobsService`** (admin gRPC, `api.savedJobs`). All RPCs are **candidate-scoped** (the saver = the caller, from the token; never trust a client-supplied user id).

**gRPC** — `src/admin/app/routes/pb/saved_jobs.proto` (NEW file):
```proto
syntax = "proto3";
package admin.saved_jobs.v1;

// SavedJobsService — a candidate's job bookmarks. Every RPC derives the
// candidate from the bearer token (caller_identity); `candidate_user_id` is
// NEVER a request field. Save is idempotent (unique (candidate_user_id, job_id)).
service SavedJobsService {
  rpc SaveJob(SaveJobRequest) returns (SaveJobResponse);
  rpc UnsaveJob(UnsaveJobRequest) returns (UnsaveJobResponse);
  rpc ListSavedJobs(ListSavedJobsRequest) returns (ListSavedJobsResponse);
}

message SaveJobRequest   { string job_id = 1; }
message SaveJobResponse  { bool saved = 1; }            // true (idempotent)
message UnsaveJobRequest { string job_id = 1; }
message UnsaveJobResponse{ bool saved = 1; }            // false
message ListSavedJobsRequest {}

message SavedJob {                                       // a saved entry = the job card + when saved
  string job_id          = 1;
  string title           = 2;
  string company_name    = 3;
  string company_id      = 4;
  string location        = 5;   // "" when unset
  string remote_mode     = 6;   // "remote"|"hybrid"|"onsite"|""
  string employment_type = 7;   // "" when unset
  int64  salary_min      = 8;
  int64  salary_max      = 9;
  string salary_currency = 10;
  repeated string skills = 11;
  string posted_at       = 12;  // ISO
  string snippet         = 13;  // first ~160 chars of jd
  string saved_at        = 14;  // ISO (when the candidate bookmarked it)
}
message ListSavedJobsResponse { repeated SavedJob jobs = 1; }
```

- **Auth/scope:** bearer required (candidate role). `caller_identity(context, tokens)` yields the candidate user id; saves/unsaves/lists are scoped to it. A save for a **non-published or non-existent** job → `NotFound` (don't let a candidate bookmark a draft). Unsave of a not-saved job is idempotent (`saved=false`, no error).
- **Backed by:** `resources/saved_jobs.py` over collection **`saved_jobs`** with a **unique** index `(candidate_user_id, job_id)` (the index lives in the single authority `infra/db.py`). `ListSavedJobs` joins each saved `job_id` to the **same `JobCardDTO` projection** as `resources/discovery.search_jobs()` (published-only; a job that went unpublished after saving is filtered out of the list, leaving the bookmark row harmless). Sort `saved_at desc`.
- **Excluded from the DTO (grep-test):** `candidate_user_id`, `comp_id` internals, draft fields — only the `SavedJob` fields above ship.
- **Proto/REST file:** `src/admin/app/routes/pb/saved_jobs.proto` (NEW) + `src/admin/app/routes/saved_jobs.py` (NEW servicer, mirrors `job.py`'s `caller_identity` + `_abort` shape) + register in `main.py`. Collection `saved_jobs` (unique `(candidate_user_id, job_id)`).
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Tier 4 Task 9 (`SavedJobsService`) + Tier 3 Task 7 Step 4 (the optimistic `SaveJobButton` over `["saved-jobs"]`).

**FE mock shape** (`apps/candidate/app/saved/types.ts`) — the FE codes against this until `pnpm gen` exposes `api.savedJobs`:
```ts
import type { JobCardDTO } from "../jobs/types";   // the shared marketplace card DTO

export interface SavedJobDTO extends JobCardDTO {
  savedAt: string;   // ISO
}
export interface SavedJobsClient {
  list(): Promise<SavedJobDTO[]>;
  save(jobId: string): Promise<void>;
  unsave(jobId: string): Promise<void>;
}
```

> **Contract seam:** the FE codes against `SavedJobsClient`. Today it's `makeMockSavedJobsClient()` (module-level `Set` + fixtures); after `pnpm gen`, the binding becomes a thin adapter over `api.savedJobs.listSaved/save/unsave` — the component code (`SaveJobButton`, `/saved`) is unchanged. `SavedJobDTO extends JobCardDTO` so the list renders with the **same `JobCard`** as search.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `apps/candidate/app/saved/types.ts` (the contract shapes above)
- Create: `apps/candidate/lib/saved-jobs-client.ts` (the `SavedJobsClient` binding: `makeMockSavedJobsClient()` now; `makeApiSavedJobsClient(api)` after gen)
- Create: `apps/candidate/lib/use-saved-set.ts` (`useSavedSet()` — a `["saved-jobs","ids"]` query returning a `Set<string>` for fast `isSaved` lookups)
- Create: `apps/candidate/components/save-job-button.tsx` (`"use client"` optimistic toggle — **the reusable control**, also consumed by [job-detail](./job-detail.md) + [company-profile](./company-profile.md) + [marketplace-search](./marketplace-search.md))
- Create: `apps/candidate/app/saved/page.tsx` (`"use client"` authed list under `CandidateShell`)
- Modify: `apps/candidate/components/candidate-shell.tsx` (add `Saved` → `/saved` to `NAV`)
- Create: `apps/candidate/components/save-job-button.test.tsx` (optimistic flip + rollback-on-error)

**Components:** new `SaveJobButton`; reuse `@ip/ui` `Button`, `Card`, `EmptyState`, `Skeleton`, `toast`, `Icon` (or `lucide-react` `Bookmark`/`BookmarkCheck` — declared per-app); reuse `JobCard`.
**Query keys:** `["saved-jobs"]` (the full list, for `/saved`) and `["saved-jobs","ids"]` (the id `Set`, for `SaveJobButton` `isSaved`). Both invalidated on save/unsave settle.

### Task 1: Client binding + mock (testable seam)

- [ ] **Step 1: Write the failing test** — `apps/candidate/lib/saved-jobs-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeMockSavedJobsClient } from "./saved-jobs-client";

describe("makeMockSavedJobsClient", () => {
  it("save then list includes the job; unsave removes it", async () => {
    const c = makeMockSavedJobsClient();
    await c.save("1");
    expect((await c.list()).map((j) => j.jobId)).toContain("1");
    await c.unsave("1");
    expect((await c.list()).map((j) => j.jobId)).not.toContain("1");
  });
  it("save is idempotent", async () => {
    const c = makeMockSavedJobsClient();
    await c.save("1");
    await c.save("1");
    expect((await c.list()).filter((j) => j.jobId === "1")).toHaveLength(1);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test saved-jobs-client` → FAIL (not defined).
- [ ] **Step 3: Implement `types.ts`** (paste Part A) **and** `saved-jobs-client.ts`:
```ts
import type { SavedJobDTO, SavedJobsClient } from "../app/saved/types";

const FIXTURES: SavedJobDTO[] = [
  { jobId: "1", title: "Senior Frontend Engineer", companyName: "Northwind", companyId: "c1",
    location: "Remote", remoteMode: "remote", employmentType: "full_time",
    salaryMin: 120000, salaryMax: 160000, salaryCurrency: "USD",
    skills: ["react", "typescript"], postedAt: "2026-06-18T00:00:00Z",
    snippet: "Own the marketplace UI…", savedAt: "2026-06-19T00:00:00Z" },
  { jobId: "2", title: "Backend Engineer (Go)", companyName: "Northwind", companyId: "c1",
    location: "Berlin", remoteMode: "hybrid", employmentType: "full_time",
    salaryMin: 110000, salaryMax: 150000, salaryCurrency: "EUR",
    skills: ["go", "mongodb"], postedAt: "2026-06-17T00:00:00Z",
    snippet: "Scale the funnel services…", savedAt: "2026-06-19T00:00:00Z" },
];

/** In-memory saved-jobs client for building the screen before `api.savedJobs` lands. */
export function makeMockSavedJobsClient(): SavedJobsClient {
  const saved = new Map<string, SavedJobDTO>(FIXTURES.map((j) => [j.jobId, j]));
  const byId = new Map<string, SavedJobDTO>(FIXTURES.map((j) => [j.jobId, j]));
  return {
    list: async () => [...saved.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    save: async (jobId) => {
      const job = byId.get(jobId) ?? { ...FIXTURES[0], jobId, savedAt: new Date().toISOString() };
      saved.set(jobId, { ...job, savedAt: new Date().toISOString() });
    },
    unsave: async (jobId) => void saved.delete(jobId),
  };
}

// Real adapter — wired after `pnpm gen` exposes api.savedJobs (mapping snake→camel happens in proto-es).
// import type { ApiClients } from "@ip/api-client";
// export function makeApiSavedJobsClient(api: ApiClients): SavedJobsClient {
//   return {
//     list: async () => (await api.savedJobs.listSaved({})).jobs as unknown as SavedJobDTO[],
//     save: async (jobId) => void (await api.savedJobs.save({ jobId })),
//     unsave: async (jobId) => void (await api.savedJobs.unsave({ jobId })),
//   };
// }

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export const savedJobsClient = makeMockSavedJobsClient();  // swap to makeApiSavedJobsClient(api) post-gen
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test saved-jobs-client` → PASS
- [ ] **Step 5: Commit** — `git add apps/candidate/app/saved apps/candidate/lib/saved-jobs-client.ts && git commit -m "feat(saved-jobs): SavedJobsClient seam + in-memory mock"`

### Task 2: `useSavedSet` query (the id `Set` for fast `isSaved`)

- [ ] **Step 1:** Create `apps/candidate/lib/use-saved-set.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { savedJobsClient } from "./saved-jobs-client";

/** A Set of saved job ids — backs SaveJobButton's `isSaved` without re-listing per card. */
export function useSavedSet() {
  const { token } = useAuth();
  const q = useQuery({
    queryKey: ["saved-jobs", "ids"],
    queryFn: async () => new Set((await savedJobsClient.list()).map((j) => j.jobId)),
    enabled: !!token,                 // signed-out → no fetch; SaveJobButton renders null
  });
  return q.data ?? new Set<string>();
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(saved-jobs): useSavedSet id-set query"`

### Task 3: `SaveJobButton` — the optimistic toggle (the headline)

- [ ] **Step 1: Write the failing test** — `apps/candidate/components/save-job-button.test.tsx` (optimistic flip immediately; rollback when the mutation rejects). Use `@testing-library/react` + a `QueryClientProvider`; stub `savedJobsClient.save` to reject and assert the button reverts to "unsaved". *(If RTL isn't wired in `apps/candidate`, fold its devDep + jsdom env into this step.)*
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SaveJobButton } from "./save-job-button";
import * as client from "../lib/saved-jobs-client";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("SaveJobButton optimism", () => {
  it("rolls back to unsaved when save fails", async () => {
    vi.spyOn(client.savedJobsClient, "save").mockRejectedValueOnce(new Error("boom"));
    // (auth/token mocked so the button renders; see test setup)
    wrap(<SaveJobButton jobId="1" />);
    const btn = await screen.findByRole("button", { name: /save/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument());
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test save-job-button` → FAIL.
- [ ] **Step 3:** Create `apps/candidate/components/save-job-button.tsx`:
```tsx
"use client";

import { Button, toast } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { useAuth } from "../lib/auth";
import { savedJobsClient } from "../lib/saved-jobs-client";
import { useSavedSet } from "../lib/use-saved-set";

/** Reusable bookmark toggle. Optimistic: flips the `["saved-jobs","ids"]` cache on
 * click, rolls back on error, and invalidates the list + id-set on settle. Renders
 * null when signed out (the surrounding page may be public). */
export function SaveJobButton({ jobId }: { jobId: string }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const saved = useSavedSet().has(jobId);

  const toggle = useMutation({
    mutationFn: () => (saved ? savedJobsClient.unsave(jobId) : savedJobsClient.save(jobId)),
    // Optimistic update: snapshot → mutate the id Set → return the snapshot for rollback.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["saved-jobs", "ids"] });
      const prev = qc.getQueryData<Set<string>>(["saved-jobs", "ids"]) ?? new Set<string>();
      const next = new Set(prev);
      saved ? next.delete(jobId) : next.add(jobId);
      qc.setQueryData(["saved-jobs", "ids"], next);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx) qc.setQueryData(["saved-jobs", "ids"], ctx.prev);   // roll back
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs", "ids"] });
      qc.invalidateQueries({ queryKey: ["saved-jobs"] });          // the /saved list
    },
  });

  if (!token) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={saved}
      aria-label={saved ? "Saved — click to remove" : "Save job"}
      onClick={(e) => {
        e.preventDefault();      // the card is a <Link> — don't navigate on toggle
        e.stopPropagation();
        toggle.mutate();
      }}
    >
      {saved ? <BookmarkCheck className="size-4" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
      <span className="sr-only">{saved ? "Saved" : "Save"}</span>
    </Button>
  );
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test save-job-button` → PASS
- [ ] **Step 5: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean. **Ensure `lucide-react` is in `apps/candidate/package.json`** (per-app declaration; it already is for `candidate-shell`).
- [ ] **Step 6: Commit** — `git commit -am "feat(saved-jobs): optimistic SaveJobButton (flip+rollback over [saved-jobs,ids])"`

### Task 4: `/saved` authed list page

- [ ] **Step 1:** Create `apps/candidate/app/saved/page.tsx`:
```tsx
"use client";

import { EmptyState, Skeleton } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { CandidateShell } from "../../components/candidate-shell";
import { JobCard } from "../../components/job-card";
import { SaveJobButton } from "../../components/save-job-button";
import { useAuth } from "../../lib/auth";
import { savedJobsClient } from "../../lib/saved-jobs-client";

export default function SavedJobsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready, "/login");
  const q = useQuery({
    queryKey: ["saved-jobs"],
    queryFn: () => savedJobsClient.list(),
    enabled: !!token,
  });
  if (!token) return null;     // hydration guard

  const jobs = q.data ?? [];
  return (
    <CandidateShell>
      <h1 className="font-display text-xl font-medium text-foreground">Saved jobs</h1>
      <div className="mt-4 flex flex-col gap-3">
        {q.isLoading && (<><Skeleton className="h-24" /><Skeleton className="h-24" /></>)}
        {q.isError && <EmptyState title="Couldn't load saved jobs" description={errorMessage(q.error)} />}
        {!q.isLoading && !q.isError && jobs.length === 0 && (
          <EmptyState
            title="No saved jobs yet"
            description="Bookmark roles as you browse and they'll show up here."
            action={<Link href="/jobs">Browse jobs</Link>}
          />
        )}
        {jobs.map((j) => (
          <JobCard key={j.jobId} job={j} action={<SaveJobButton jobId={j.jobId} />} />
        ))}
      </div>
    </CandidateShell>
  );
}
```
- [ ] **Step 2:** Add `Saved` to `CandidateShell`'s `NAV` in `apps/candidate/components/candidate-shell.tsx`:
```tsx
const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/saved", label: "Saved" },
  { href: "/profile", label: "Profile" },
  { href: "/account", label: "Account" },
] as const;
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: load `/saved`, confirm the bookmarked fixtures render as `JobCard`s, clicking a card's bookmark **un-saves it and it disappears from the list** (optimistic), the empty state shows after clearing all, and the nav highlights `Saved`. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(saved-jobs): /saved authed list + nav entry"`

### Task 5: Wire `SaveJobButton` into the card `action` slot everywhere

- [ ] **Step 1:** Confirm `JobCard` accepts `action?: ReactNode` and renders it top-right (the [marketplace-search](./marketplace-search.md) Task 3 card). Drop `<SaveJobButton jobId={job.jobId} />` into the `action` slot at the marketplace grid, the company page grid ([company-profile](./company-profile.md)), and the detail header ([job-detail](./job-detail.md)). **Step 2: Verify** `--filter @ip/candidate build` clean; in preview, saving from the marketplace then opening `/saved` shows the job. **Step 3: Commit** — `git commit -am "feat(saved-jobs): mount SaveJobButton across marketplace/company/detail"`.

---

## C. States & acceptance
- **States:** loading (`Skeleton`), empty (`EmptyState` "No saved jobs yet" → link to `/jobs`), error (`EmptyState` with the error message), success (`JobCard` grid). The toggle is **optimistic** — the bookmark flips instantly and rolls back on failure (`toast` on error only).
- **Responsive:** single-column card list; bookmark button stays in the card's top-right `action` slot.
- **Dark mode:** tokens only — automatic.
- **A11y:** `SaveJobButton` is `aria-pressed` + `aria-label`; it `preventDefault`s so the wrapping card-link doesn't navigate on toggle; `/saved` has a real `<h1>`.
- **Acceptance:** matches the `marketplace/saved-jobs` mockup; the optimistic toggle flips immediately and rolls back on error; the same `SaveJobButton` works on search, company, and detail; `--filter @ip/candidate build` + `typecheck` green; works against the mock today and against `api.savedJobs` once `pnpm gen` lands (swap `savedJobsClient` to `makeApiSavedJobsClient(api)`).
