# Screen: Job alerts (saved searches) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, marketplace).
> **Route:** `apps/candidate/app/alerts/page.tsx` (NEW, authed) · **Mockup:** `marketplace/job-alerts` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (Tier 3 Task 7 + Tier 4 Task 9, `JobAlertsService`)
> **Goal:** Signed-in candidates save a search (keyword + filters + frequency) as a named **job alert** and manage the list (create / list / delete-with-confirm). The scheduled "run alerts → notify" sweep is a **backend pillar task**, not FE.

Authed gRPC (the canonical pattern), same family as [saved-jobs](./saved-jobs.md). An alert is just a persisted `SearchJobsParams` (reusing the marketplace [search params shape](./marketplace-search.md)) plus a `frequency`. The FE is CRUD over `api.jobAlerts`; it does **not** run the searches or send notifications.

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** new **`JobAlertsService`** (admin gRPC, `api.jobAlerts`). All RPCs are **candidate-scoped** (owner = caller, from the token).

**gRPC** — `src/admin/app/routes/pb/job_alerts.proto` (NEW file):
```proto
syntax = "proto3";
package admin.job_alerts.v1;

// JobAlertsService — a candidate's saved searches. The owner is derived from the
// bearer token (caller_identity); `candidate_user_id` is NEVER a request field.
// Running the searches + emitting notifications is a SCHEDULED BACKEND SWEEP
// (pillar task), not part of this service's request path.
service JobAlertsService {
  rpc CreateAlert(CreateAlertRequest) returns (JobAlert);
  rpc ListAlerts(ListAlertsRequest)   returns (ListAlertsResponse);
  rpc DeleteAlert(DeleteAlertRequest) returns (DeleteAlertResponse);
}

// Filters mirror SearchJobsParams (marketplace-search) so an alert == a saved search.
message AlertFilters {
  string location        = 1;   // "" when unset
  string remote_mode     = 2;   // "remote"|"hybrid"|"onsite"|""
  string employment_type = 3;   // "" when unset
  string experience_level= 4;   // "" when unset
  repeated string skills = 5;
}

message CreateAlertRequest {
  string keyword    = 1;        // the `q` of the saved search ("" allowed → filter-only alert)
  AlertFilters filters = 2;
  string frequency  = 3;        // "daily" | "weekly"  (validated at the boundary)
}

message JobAlert {
  string alert_id   = 1;
  string keyword    = 2;
  AlertFilters filters = 3;
  string frequency  = 4;
  string created_at = 5;        // ISO
  string last_run_at= 6;        // ISO or "" (written by the sweep; FE shows "Never run yet")
}

message ListAlertsRequest {}
message ListAlertsResponse { repeated JobAlert alerts = 1; }

message DeleteAlertRequest  { string alert_id = 1; }
message DeleteAlertResponse { bool deleted = 1; }
```

- **Auth/scope:** bearer required (candidate role). `caller_identity` yields the owner; create/list/delete are scoped to it. Delete of another candidate's alert (or a missing id) → `NotFound` (never reveal cross-tenant existence). Per-candidate **cap** on active alerts (e.g. 20) enforced in the resource → `FailedPrecondition` when exceeded. `frequency` ∉ {`daily`,`weekly`} → `InvalidArgument` (boundary validation — untrusted input).
- **Backed by:** `resources/job_alerts.py` over collection **`job_alerts`**, index `(candidate_user_id, created_at desc)` for the list + a `(frequency, last_run_at)` index the **sweep** scans (the index lives in the single authority `infra/db.py`). `CreateAlert` persists the normalized `SearchJobsParams` + `frequency`; `last_run_at` starts unset.
- **The sweep (BE pillar task — NOT this service, NOT FE):** a scheduled job re-runs each alert's saved search over `resources/discovery.search_jobs()`, diffs against `last_run_at`, and emits a `NotificationService` event per new match (→ the [notifications](./notifications.md) pillar). Documented here only so the FE knows `last_run_at` is sweep-written and **the FE never triggers a run**.
- **Excluded from the DTO (grep-test):** `candidate_user_id`, internal cursor/dedupe state — only the `JobAlert` fields above ship.
- **Proto/REST file:** `src/admin/app/routes/pb/job_alerts.proto` (NEW) + `src/admin/app/routes/job_alerts.py` (NEW servicer, mirrors `job.py`'s `caller_identity` + `_abort`) + register in `main.py`. Collection `job_alerts`.
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Tier 4 Task 9 (`JobAlertsService`) + Tier 3 Task 7 Step 6 (the `/alerts` CRUD page; alert *execution* is the scheduled sweep).

**FE mock shape** (`apps/candidate/app/alerts/types.ts`) — the FE codes against this until `pnpm gen` exposes `api.jobAlerts`:
```ts
export type AlertFrequency = "daily" | "weekly";
export interface AlertFilters {
  location?: string;
  remoteMode?: "remote" | "hybrid" | "onsite";
  employmentType?: string;
  experienceLevel?: string;
  skills?: string[];
}
export interface JobAlertDTO {
  alertId: string;
  keyword: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  createdAt: string;          // ISO
  lastRunAt: string | null;   // null → "Never run yet"
}
export interface CreateAlertInput {
  keyword: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
}
export interface JobAlertsClient {
  list(): Promise<JobAlertDTO[]>;
  create(input: CreateAlertInput): Promise<JobAlertDTO>;
  remove(alertId: string): Promise<void>;
}
```

> **Contract seam:** the FE codes against `JobAlertsClient`. Today it's `makeMockJobAlertsClient()` (module-level array); after `pnpm gen`, the binding adapts `api.jobAlerts.create/list/delete` — the form + list components are unchanged.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `apps/candidate/app/alerts/types.ts` (the contract shapes above)
- Create: `apps/candidate/lib/job-alerts-client.ts` (the `JobAlertsClient` binding: `makeMockJobAlertsClient()` now; `makeApiJobAlertsClient(api)` after gen) + a pure `summarizeAlert` helper
- Create: `apps/candidate/app/alerts/page.tsx` (`"use client"` authed CRUD page under `CandidateShell`)
- Create: `apps/candidate/components/alert-form.tsx` (keyword `Input` + filter `Select`s + frequency `Select` + Create `Button`)
- Create: `apps/candidate/components/alert-row.tsx` (one saved alert: summary + last-run + `ConfirmDialog`-gated Delete)
- Modify: `apps/candidate/components/candidate-shell.tsx` (add `Alerts` → `/alerts` to `NAV`)
- Create: `apps/candidate/lib/job-alerts-client.test.ts` (`summarizeAlert` + mock CRUD)

**Components:** new `AlertForm`, `AlertRow`; reuse `@ip/ui` `Input`, `Select/SelectTrigger/SelectValue/SelectContent/SelectItem`, `Button`, `Card/CardContent`, `Badge`, `EmptyState`, `Skeleton`, `ConfirmDialog`, `toast`.
**Query keys:** `["job-alerts"]` (the list). Create + delete invalidate it.

### Task 1: Client binding + `summarizeAlert` (testable seam)

- [ ] **Step 1: Write the failing test** — `apps/candidate/lib/job-alerts-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeMockJobAlertsClient, summarizeAlert } from "./job-alerts-client";

describe("summarizeAlert", () => {
  it("renders keyword + active filters as a human label", () => {
    expect(summarizeAlert({
      alertId: "a1", keyword: "react", frequency: "daily", createdAt: "", lastRunAt: null,
      filters: { remoteMode: "remote", skills: ["ts", "react"] },
    })).toBe('"react" · remote · ts, react');
  });
  it("falls back to 'All jobs' when keyword + filters are empty", () => {
    expect(summarizeAlert({
      alertId: "a2", keyword: "", frequency: "weekly", createdAt: "", lastRunAt: null, filters: {},
    })).toBe("All jobs");
  });
});

describe("makeMockJobAlertsClient", () => {
  it("create → list includes it; remove drops it", async () => {
    const c = makeMockJobAlertsClient();
    const a = await c.create({ keyword: "go", filters: {}, frequency: "weekly" });
    expect((await c.list()).map((x) => x.alertId)).toContain(a.alertId);
    await c.remove(a.alertId);
    expect((await c.list()).map((x) => x.alertId)).not.toContain(a.alertId);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test job-alerts-client` → FAIL (not defined).
- [ ] **Step 3: Implement `types.ts`** (paste Part A) **and** `job-alerts-client.ts`:
```ts
import type { CreateAlertInput, JobAlertDTO, JobAlertsClient } from "../app/alerts/types";

/** Compact human summary of a saved search, e.g. `"react" · remote · ts, react`. */
export function summarizeAlert(a: JobAlertDTO): string {
  const parts: string[] = [];
  if (a.keyword) parts.push(`"${a.keyword}"`);
  if (a.filters.remoteMode) parts.push(a.filters.remoteMode);
  if (a.filters.location) parts.push(a.filters.location);
  if (a.filters.employmentType) parts.push(a.filters.employmentType.replace("_", " "));
  if (a.filters.experienceLevel) parts.push(a.filters.experienceLevel);
  if (a.filters.skills?.length) parts.push(a.filters.skills.join(", "));
  return parts.length ? parts.join(" · ") : "All jobs";
}

let seq = 100;
const SEED: JobAlertDTO[] = [
  { alertId: "a1", keyword: "frontend", frequency: "daily", createdAt: "2026-06-18T00:00:00Z",
    lastRunAt: "2026-06-19T06:00:00Z", filters: { remoteMode: "remote", skills: ["react", "typescript"] } },
];

/** In-memory job-alerts client for building the screen before `api.jobAlerts` lands. */
export function makeMockJobAlertsClient(): JobAlertsClient {
  const alerts: JobAlertDTO[] = [...SEED];
  return {
    list: async () => [...alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    create: async (input: CreateAlertInput) => {
      const a: JobAlertDTO = { alertId: `a${++seq}`, ...input, createdAt: new Date().toISOString(), lastRunAt: null };
      alerts.unshift(a);
      return a;
    },
    remove: async (alertId: string) => {
      const i = alerts.findIndex((x) => x.alertId === alertId);
      if (i >= 0) alerts.splice(i, 1);
    },
  };
}

// Real adapter — wired after `pnpm gen` exposes api.jobAlerts.
// import type { ApiClients } from "@ip/api-client";
// export function makeApiJobAlertsClient(api: ApiClients): JobAlertsClient {
//   return {
//     list: async () => (await api.jobAlerts.list({})).alerts as unknown as JobAlertDTO[],
//     create: async (input) => (await api.jobAlerts.create(input)) as unknown as JobAlertDTO,
//     remove: async (alertId) => void (await api.jobAlerts.delete({ alertId })),
//   };
// }

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export const jobAlertsClient = makeMockJobAlertsClient();  // swap to makeApiJobAlertsClient(api) post-gen
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test job-alerts-client` → PASS
- [ ] **Step 5: Commit** — `git add apps/candidate/app/alerts apps/candidate/lib/job-alerts-client.ts && git commit -m "feat(job-alerts): JobAlertsClient seam + mock + summarizeAlert"`

### Task 2: `AlertForm` (create a saved search)

- [ ] **Step 1:** Create `apps/candidate/components/alert-form.tsx`:
```tsx
"use client";

import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ip/ui";
import { useState } from "react";
import type { AlertFrequency, CreateAlertInput } from "../app/alerts/types";

const REMOTE = ["remote", "hybrid", "onsite"] as const;

/** Controlled create form. Reports a CreateAlertInput up; the page owns the mutation. */
export function AlertForm({ onCreate, pending }: { onCreate: (input: CreateAlertInput) => void; pending: boolean }) {
  const [keyword, setKeyword] = useState("");
  const [remote, setRemote] = useState<string>("");
  const [frequency, setFrequency] = useState<AlertFrequency>("daily");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCreate({
      keyword: keyword.trim(),
      filters: remote ? { remoteMode: remote as (typeof REMOTE)[number] } : {},
      frequency,
    });
    setKeyword("");
    setRemote("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Keyword</span>
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. frontend engineer" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Remote</span>
        <Select value={remote} onValueChange={setRemote}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Any" /></SelectTrigger>
          <SelectContent>
            {REMOTE.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Frequency</span>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as AlertFrequency)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button type="submit" loading={pending} disabled={pending}>Create alert</Button>
    </form>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean. *(Reconcile `Select` sub-component props against the real `@ip/ui` API if flagged.)*
- [ ] **Step 3: Commit** — `git commit -am "feat(job-alerts): AlertForm (keyword+remote+frequency)"`

### Task 3: `AlertRow` (summary + last-run + confirm-delete)

- [ ] **Step 1:** Create `apps/candidate/components/alert-row.tsx`:
```tsx
"use client";

import { Badge, Button, Card, CardContent, ConfirmDialog } from "@ip/ui";
import { Trash2 } from "lucide-react";
import type { JobAlertDTO } from "../app/alerts/types";
import { summarizeAlert } from "../lib/job-alerts-client";

export function AlertRow({ alert, onDelete, deleting }: { alert: JobAlertDTO; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">{summarizeAlert(alert)}</span>
          <span className="text-xs text-muted-foreground">
            {alert.frequency === "daily" ? "Daily" : "Weekly"} ·{" "}
            {alert.lastRunAt ? `last run ${new Date(alert.lastRunAt).toLocaleDateString()}` : "Never run yet"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="soft">{alert.frequency}</Badge>
          <ConfirmDialog
            title="Delete this alert?"
            description="You'll stop receiving notifications for this saved search."
            confirmLabel="Delete"
            onConfirm={() => onDelete(alert.alertId)}
            trigger={
              <Button variant="ghost" size="sm" aria-label="Delete alert" loading={deleting}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean. *(Reconcile `ConfirmDialog`'s prop names — `trigger`/`onConfirm`/`confirmLabel` — against the real `@ip/ui` `ConfirmDialog` signature; adjust if it uses children/render-prop instead.)* Ensure `lucide-react` is declared in `apps/candidate/package.json`.
- [ ] **Step 3: Commit** — `git commit -am "feat(job-alerts): AlertRow with confirm-gated delete"`

### Task 4: `/alerts` authed CRUD page

- [ ] **Step 1:** Create `apps/candidate/app/alerts/page.tsx`:
```tsx
"use client";

import { EmptyState, Skeleton, toast } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CandidateShell } from "../../components/candidate-shell";
import { AlertForm } from "../../components/alert-form";
import { AlertRow } from "../../components/alert-row";
import { useAuth } from "../../lib/auth";
import { jobAlertsClient } from "../../lib/job-alerts-client";
import type { CreateAlertInput } from "./types";

export default function JobAlertsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready, "/login");
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["job-alerts"], queryFn: () => jobAlertsClient.list(), enabled: !!token });

  const create = useMutation({
    mutationFn: (input: CreateAlertInput) => jobAlertsClient.create(input),
    onSuccess: () => {
      toast.success("Alert created");
      qc.invalidateQueries({ queryKey: ["job-alerts"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => jobAlertsClient.remove(id),
    onSuccess: () => {
      toast.success("Alert deleted");
      qc.invalidateQueries({ queryKey: ["job-alerts"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!token) return null;     // hydration guard
  const alerts = q.data ?? [];

  return (
    <CandidateShell>
      <h1 className="font-display text-xl font-medium text-foreground">Job alerts</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Save a search and we'll notify you when new matching roles are posted.
      </p>

      <div className="mt-5 rounded-lg border border-border bg-surface p-4">
        <AlertForm onCreate={(input) => create.mutate(input)} pending={create.isPending} />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {q.isLoading && (<><Skeleton className="h-16" /><Skeleton className="h-16" /></>)}
        {q.isError && <EmptyState title="Couldn't load alerts" description={errorMessage(q.error)} />}
        {!q.isLoading && !q.isError && alerts.length === 0 && (
          <EmptyState title="No alerts yet" description="Create your first saved search above." />
        )}
        {alerts.map((a) => (
          <AlertRow
            key={a.alertId}
            alert={a}
            onDelete={(id) => remove.mutate(id)}
            deleting={remove.isPending && remove.variables === a.alertId}
          />
        ))}
      </div>
    </CandidateShell>
  );
}
```
- [ ] **Step 2:** Add `Alerts` to `CandidateShell`'s `NAV` (`apps/candidate/components/candidate-shell.tsx`) — between `Saved` and `Profile`:
```tsx
  { href: "/alerts", label: "Alerts" },
```
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: load `/alerts`, confirm the seeded alert renders with its summary + "last run" line, submitting the form prepends a new alert (`toast` "Alert created"), the Delete button opens a `ConfirmDialog` and removing drops the row, and the empty state shows once all are gone. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(job-alerts): /alerts CRUD page + nav entry"`

---

## C. States & acceptance
- **States:** loading (`Skeleton`), empty (`EmptyState` "No alerts yet"), error (`EmptyState` with the error message), success (form + `AlertRow` list). Create/delete are mutations with `toast` feedback + `["job-alerts"]` invalidation; delete is **confirm-gated** (`ConfirmDialog`). `lastRunAt === null` → "Never run yet" (the sweep writes it; the FE never runs alerts).
- **Responsive:** the form stacks vertically on mobile (`sm:flex-row`); rows are full-width cards.
- **Dark mode:** tokens only — automatic.
- **A11y:** the form is a `<form>` with labelled fields; frequency/remote are labelled `Select`s; Delete has an `aria-label` and a confirm step; page has a real `<h1>`.
- **Acceptance:** matches the `marketplace/job-alerts` mockup; create/list/delete round-trip against the mock; delete requires confirmation; **the FE never triggers a run** (sweep is BE); `--filter @ip/candidate build` + `typecheck` green; works against the mock today and against `api.jobAlerts` once `pnpm gen` lands (swap `jobAlertsClient` to `makeApiJobAlertsClient(api)`).
