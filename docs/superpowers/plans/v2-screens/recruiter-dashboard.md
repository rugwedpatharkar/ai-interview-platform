# Screen: Recruiter dashboard + KPIs — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1).
> **Route:** `frontend/apps/company/app/page.tsx` (today a bare `redirect("/jobs")` — make it a real dashboard) · **Mockup:** `aptura_recruiter_dashboard` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) + [compliance-advisory-gate](../../v2/2026-06-19-compliance-advisory-gate.md) (no-ghosting KPIs)
> **Goal:** The recruiter's landing page becomes an at-a-glance dashboard: **no-ghosting KPI cards** (outcome rate, avg response time + the funnel headline numbers), the hiring **funnel chart** (reusing `GetFunnelAnalytics`), and a **recent jobs** list — replacing the redirect.

Today `/` just redirects to `/jobs`. This screen makes it a dashboard. It **reuses** the existing `Analytics.GetFunnelAnalytics` (already rendered on `/analytics`) for the funnel + total/conversion, and **extends** `Analytics` with a new **no-ghosting KPI** RPC (outcome rate + average response time — the anti-ghosting commitment surfaced as metrics). It also lists recent jobs via the existing `Job.ListJobs`. A reusable **`KpiCard`** is added to `@ip/ui` (used here and later by candidate-report integrity bands).

---

## A. Backend contract (hand this to a backend session)

**Status:** EXTEND · **Service:** `admin.analytics.v1` (`AnalyticsService`) — add one RPC; reuse `GetFunnelAnalytics`.

**RPCs:**
```proto
// service: admin.analytics.v1 — AnalyticsService (existing; ADD GetNoGhostingKpis)
rpc GetFunnelAnalytics(FunnelAnalyticsRequest) returns (FunnelAnalytics);   // EXISTING — reuse as-is
rpc GetNoGhostingKpis(NoGhostingKpisRequest) returns (NoGhostingKpis);      // NEW (comp-scoped)
```
```proto
message NoGhostingKpisRequest { int32 window_days = 1; }   // default 30; clamped server-side
message NoGhostingKpis {
  // "No ghosting" = every applicant gets an outcome. These quantify the commitment.
  double outcome_rate = 1;          // share of applicants in a TERMINAL state (hired|rejected|withdrawn) / total
  int64  open_no_outcome = 2;       // applicants still awaiting any outcome (the anti-ghosting backlog)
  double avg_response_hours = 3;    // mean hours from apply → first recruiter action (decision/advance), windowed
  double median_response_hours = 4;
  int64  total_applicants = 5;      // denominator, in-window
  int32  window_days = 6;           // echoed (post-clamp)
}
```
- **Auth/scope:** bearer; **manager-scoped** (`company_admin`/`recruiter`) and **comp-scoped** — `comp_id` from the **token, never the request**. Read-only. `window_days` clamped (e.g. 7..90, default 30).
- **Semantics:** `outcome_rate` = `terminal_count / total` over the window (terminal = `hired`/`rejected`/`withdrawn`); `open_no_outcome` = applicants with no terminal state yet (the ghosting risk surface); `avg/median_response_hours` = apply-timestamp → first recruiter state transition (advance/decision), from the application audit/state-history. All metrics derive from the **existing `applications` + funnel/audit data** — no new collection; aggregation lives in the resource.
- **Backed by:** `resources/analytics.py` (`get_no_ghosting_kpis` — extend; one Mongo aggregation over `applications` scoped to `comp_id`, computing terminal-share + response-time percentiles) → existing application/funnel repos. No new index strictly required for v2 (the comp-scoped funnel query already exists); add a covering index only if the aggregation is hot.
- **Proto delta / files:** modify `src/admin/app/routes/pb/analytics.proto` (add `GetNoGhostingKpis` + the two messages), `src/admin/app/routes/analytics.py` (servicer method — thin adapter), `src/admin/app/resources/analytics.py` (aggregation). No new service → **no api-client quad**; `pnpm gen` just adds the methods/messages to `analytics_pb.ts`.
- **Pillar cross-ref:** [compliance-advisory-gate](../../v2/2026-06-19-compliance-advisory-gate.md) (no-ghosting / every-applicant-gets-an-outcome) + [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (recruiter surfaces).

**FE mock shape** (`frontend/apps/company/app/dashboard-types.ts`) — the dashboard codes against this until `pnpm gen`:
```ts
export interface NoGhostingKpisDTO {
  outcomeRate: number;        // 0..1
  openNoOutcome: number;
  avgResponseHours: number;
  medianResponseHours: number;
  totalApplicants: number;
  windowDays: number;
}
// FunnelAnalytics is already generated in @ip/api-client (states[], total, conversionRate).
// ListJobs response (existing) provides recent-jobs rows: { jobId, title, status, ... }.
```

> **Integration seam:** the funnel + recent-jobs come from **already-generated** clients (`api.analytics.getFunnelAnalytics`, `api.jobs.listJobs`) — those work today with no mock. Only the **KPI strip** needs a mock until `GetNoGhostingKpis` lands: a `makeMockKpis()` returning a `NoGhostingKpisDTO`. After `pnpm gen`, swap to `api.analytics.getNoGhostingKpis({ windowDays: 30 })` (bigints widened with `Number(...)` exactly like `analytics/page.tsx` does for funnel counts).

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/ui/src/kpi-card.tsx` (NEW shared `KpiCard`) + export from `frontend/packages/ui/src/index.ts`
- Create: `frontend/apps/company/app/dashboard-types.ts` (the KPI shape above)
- Create: `frontend/apps/company/app/dashboard.tsx` (`"use client"` dashboard body)
- Create: `frontend/apps/company/components/funnel-chart.tsx` (extract the bar chart from `analytics/page.tsx`'s `FunnelView` so both pages share it)
- Create: `frontend/apps/company/components/recent-jobs.tsx` (`"use client"` recent-jobs list)
- Create: `frontend/apps/company/app/dashboard-kpis.ts` (`makeMockKpis()` + real binding note + `formatHours`/`formatPct` helpers)
- Create: `frontend/apps/company/app/dashboard-kpis.test.ts` (pure formatters)
- Modify: `frontend/apps/company/app/page.tsx` (replace the redirect with the dashboard)
- Modify: `frontend/apps/company/app/analytics/page.tsx` (re-use the extracted `FunnelChart` instead of its inline copy — keeps one chart)

**Components:** new `KpiCard` (`@ip/ui`), `FunnelChart`, `RecentJobs`; reuse `@ip/ui` `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Badge`, `EmptyState`, `ErrorState`, `LoadingState`, `PageHeader`, `Button`, `applicationStatus`, `jobStatus`.
**Query keys:** `["analytics","funnel"]` (shared with `/analytics` — same key, dedup'd), `["analytics","kpis",windowDays]`, `["jobs","recent"]`.

### Task 1: `KpiCard` in `@ip/ui` (the reusable metric tile)

- [ ] **Step 1:** Create `frontend/packages/ui/src/kpi-card.tsx`:
```tsx
import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "./card.js";
import { cn } from "./cn.js";

export interface KpiCardProps {
  label: string;
  value: ReactNode;                 // pre-formatted (e.g. "92%", "18h")
  hint?: string;                    // sub-caption under the value
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}

const TONE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

export function KpiCard({ label, value, hint, icon: Icon, tone = "default", className }: KpiCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
        <span className={cn("text-3xl font-semibold tabular-nums", TONE[tone])}>{value}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2:** Export from `frontend/packages/ui/src/index.ts`:
```ts
export { KpiCard, type KpiCardProps } from "./kpi-card.js";
```
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/ui typecheck` clean. **Confirm the imports + token names against the real `@ip/ui`:** the internal import paths (`./card.js`, `./cn.js`) and the status-foreground token class names (`text-success-foreground`/`text-warning-foreground`/`text-danger-foreground`) — match whatever `badge.tsx`/`alert.tsx` already use for status families; adjust if the project uses e.g. `text-success` or a `tone` map.
- [ ] **Step 4: Commit** — `git add frontend/packages/ui && git commit -m "feat(ui): KpiCard metric tile"`

### Task 2: Pure KPI formatters — TDD

- [ ] **Step 1: Write the failing test** — `frontend/apps/company/app/dashboard-kpis.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatPct, formatHours, kpiTone } from "./dashboard-kpis";

describe("formatPct", () => {
  it("renders a 0..1 ratio as a rounded %", () => { expect(formatPct(0.923)).toBe("92%"); });
});
describe("formatHours", () => {
  it("shows hours under a day, days above", () => {
    expect(formatHours(6)).toBe("6h");
    expect(formatHours(30)).toBe("1.3d");
  });
});
describe("kpiTone", () => {
  it("flags a low outcome rate as a warning", () => {
    expect(kpiTone(0.95)).toBe("positive");
    expect(kpiTone(0.6)).toBe("warning");
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/company test dashboard-kpis` → FAIL.
- [ ] **Step 3: Implement** `frontend/apps/company/app/dashboard-kpis.ts`:
```ts
import type { NoGhostingKpisDTO } from "./dashboard-types";

export const formatPct = (r: number) => `${Math.round(r * 100)}%`;
export const formatHours = (h: number) => (h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)}d`);
export const kpiTone = (outcomeRate: number) => (outcomeRate >= 0.9 ? "positive" : outcomeRate >= 0.75 ? "default" : "warning");

export function makeMockKpis(): NoGhostingKpisDTO {
  return { outcomeRate: 0.92, openNoOutcome: 4, avgResponseHours: 18, medianResponseHours: 12, totalApplicants: 137, windowDays: 30 };
}
// Real (after pnpm gen): api.analytics.getNoGhostingKpis({ windowDays: 30 }) → widen bigints with Number(...).
```
- [ ] **Step 4: Run test, verify it passes** — `--filter @ip/company test dashboard-kpis` → PASS
- [ ] **Step 5: Commit** — `git commit -am "feat(dashboard): KPI formatters + mock"`

### Task 3: Extract `FunnelChart` from `analytics/page.tsx`

- [ ] **Step 1:** Create `frontend/apps/company/components/funnel-chart.tsx` — lift the `FunnelView` bar-chart body **verbatim** (the `sr-only` text alternative + the `aria-hidden` bar `ul`) from the current `analytics/page.tsx`, typed `{ data: FunnelAnalytics }`:
```tsx
import { Badge, Card, CardContent, CardHeader, CardTitle, applicationStatus } from "@ip/ui";
import type { FunnelAnalytics } from "@ip/api-client";

export function FunnelChart({ data }: { data: FunnelAnalytics }) {
  const max = data.states.reduce((m, s) => Math.max(m, Number(s.count)), 0) || 1;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">By stage</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.states.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <>
            <p className="sr-only">
              Applications by stage: {data.states.map((s) => `${applicationStatus(s.state).label}, ${Number(s.count)}`).join("; ")}.
            </p>
            <ul aria-hidden className="flex flex-col gap-2">
              {data.states.map((s) => {
                const status = applicationStatus(s.state);
                const count = Number(s.count);
                return (
                  <li key={s.state} className="flex items-center gap-3">
                    <div className="w-32 shrink-0 sm:w-40"><Badge tone={status.tone}>{status.label}</Badge></div>
                    <div className="h-5 flex-1 rounded bg-surface-muted">
                      <div className="h-5 rounded bg-primary" style={{ width: `${(count / max) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right text-sm tabular-nums text-foreground">{count}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2:** Refactor `frontend/apps/company/app/analytics/page.tsx` to import `FunnelChart` and drop its inline `By stage` card (keep the two summary cards or move them to `KpiCard` — minimal change: replace the `By stage` `<Card>…</Card>` with `<FunnelChart data={data} />`). **Behavior-preserving** — the bar chart + a11y text are identical.
- [ ] **Step 3: Verify** — `--filter @ip/company typecheck` clean; preview `/analytics` still renders the funnel identically.
- [ ] **Step 4: Commit** — `git commit -am "refactor(analytics): extract shared FunnelChart"`

### Task 4: `RecentJobs` list

- [ ] **Step 1:** Create `frontend/apps/company/components/recent-jobs.tsx`:
```tsx
"use client";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, jobStatus } from "@ip/ui";
import { useAuthedQuery } from "@ip/shared";
import Link from "next/link";
import { useAuth } from "../lib/auth";

export function RecentJobs() {
  const { api, token } = useAuth();
  const jobs = useAuthedQuery(token, { queryKey: ["jobs", "recent"], queryFn: () => api.jobs.listJobs({}) });
  const rows = (jobs.data?.jobs ?? []).slice(0, 5);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent jobs</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-4"><EmptyState title="No jobs yet" description="Post a role to get started." /></div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((j) => (
              <li key={j.jobId}>
                <Link href={`/jobs/${j.jobId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted">
                  <span className="truncate text-sm font-medium text-foreground">{j.title}</span>
                  <Badge tone={jobStatus(j.status).tone}>{jobStatus(j.status).label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean (confirm `listJobs` response field is `jobs` with `jobId`/`title`/`status`; adjust to the real `ListJobsResponse` shape).
- [ ] **Step 3: Commit** — `git commit -am "feat(dashboard): RecentJobs list"`

### Task 5: `dashboard.tsx` body + make `/` the dashboard

- [ ] **Step 1:** Create `frontend/apps/company/app/dashboard.tsx`:
```tsx
"use client";
import { ErrorState, KpiCard, LoadingState, PageHeader } from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { Clock, Inbox, TrendingUp, Users } from "lucide-react";
import { CompanyShell } from "../components/company-shell";
import { FunnelChart } from "../components/funnel-chart";
import { RecentJobs } from "../components/recent-jobs";
import { formatHours, formatPct, kpiTone, makeMockKpis } from "./dashboard-kpis";
import { useAuth } from "../lib/auth";

export function RecruiterDashboard() {
  const { api, token } = useAuth();
  const funnel = useAuthedQuery(token, { queryKey: ["analytics", "funnel"], queryFn: () => api.analytics.getFunnelAnalytics({}) });
  // KPI strip: mock until GetNoGhostingKpis lands; then api.analytics.getNoGhostingKpis({ windowDays: 30 }).
  const kpis = makeMockKpis();

  return (
    <CompanyShell>
      <PageHeader title="Dashboard" description="Your hiring at a glance — no applicant left without an outcome." />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Outcome rate" value={formatPct(kpis.outcomeRate)} hint={`${kpis.totalApplicants} applicants · ${kpis.windowDays}d`} icon={TrendingUp} tone={kpiTone(kpis.outcomeRate)} />
          <KpiCard label="Awaiting outcome" value={kpis.openNoOutcome} hint="Applicants with no decision yet" icon={Inbox} tone={kpis.openNoOutcome > 0 ? "warning" : "positive"} />
          <KpiCard label="Avg response time" value={formatHours(kpis.avgResponseHours)} hint={`Median ${formatHours(kpis.medianResponseHours)}`} icon={Clock} />
          <KpiCard label="Total applicants" value={kpis.totalApplicants} hint={`Last ${kpis.windowDays} days`} icon={Users} />
        </div>

        {funnel.isLoading && <LoadingState />}
        {funnel.isError && <ErrorState message={errorMessage(funnel.error)} retry={() => funnel.refetch()} />}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {funnel.data && <FunnelChart data={funnel.data} />}
          <RecentJobs />
        </div>
      </div>
    </CompanyShell>
  );
}
```
- [ ] **Step 2:** Replace `frontend/apps/company/app/page.tsx` (drop the redirect):
```tsx
import { RecruiterDashboard } from "./dashboard";

export default function Home() {
  return <RecruiterDashboard />;
}
```
> The page stays a server component shell delegating to the `"use client"` `RecruiterDashboard` (same pattern the candidate dashboard uses). `CompanyShell` already enforces `useRequireAuth` + manager role, so removing the redirect doesn't drop the auth gate.
- [ ] **Step 3: Verify build + preview** — `npx pnpm@9.15.0 --filter @ip/company build` clean; preview loop: load `/` (recruiter), confirm the 4 KPI tiles render with mock values + tones, the funnel chart renders from the live `GetFunnelAnalytics`, recent jobs list shows (or empty state), and the layout collapses correctly at ~375px (KPIs stack 1-col, funnel/recent stack). Confirm `/` no longer redirects. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(dashboard): recruiter dashboard at / (KPIs + funnel + recent jobs)"`

### Task 6: Swap KPI mock → real (after BE lands + `pnpm gen`)

- [ ] **Step 1:** After `GetNoGhostingKpis` lands, `npx pnpm@9.15.0 --filter @ip/api-client gen` (no quad — `AnalyticsService` already wired; just new methods). In `dashboard.tsx` replace `makeMockKpis()` with a real `useAuthedQuery(["analytics","kpis",30], () => api.analytics.getNoGhostingKpis({ windowDays: 30 }))`, widening bigints with `Number(...)` and mapping to `NoGhostingKpisDTO`. Add `LoadingState`/`ErrorState` handling for the KPI query (or render skeleton tiles).
- [ ] **Step 2: Verify** — `--filter @ip/company build` green; preview shows real KPI numbers.
- [ ] **Step 3: Commit** — `git commit -am "feat(dashboard): bind KPI strip to GetNoGhostingKpis"`

---

## C. States & acceptance
- **States:** KPI tiles render immediately (mock now / real query later — show skeleton tiles while the real KPI query loads); funnel `LoadingState` → `ErrorState` (+ retry) → chart (or "No applications yet"); recent jobs `EmptyState` when none. The dashboard never blocks the whole page on one query — each region degrades independently.
- **Responsive:** KPI grid `sm:grid-cols-2 xl:grid-cols-4`; funnel/recent `lg:grid-cols-[1fr_320px]` → stacks under `lg:`; all readable at ~375px.
- **Dark mode:** tokens only (`KpiCard` uses status-foreground families; bars use `bg-primary`/`bg-surface-muted`) — automatic.
- **A11y:** the funnel keeps its `sr-only` textual breakdown + `aria-hidden` bars (lifted verbatim); KPI tiles are plain text (label + value + hint), no chart-only meaning; recent-jobs rows are links.
- **Acceptance:** matches `aptura_recruiter_dashboard`; `/` is a dashboard, not a redirect, and still auth+role gated via `CompanyShell`; the funnel is the **same** `FunnelChart` now shared with `/analytics` (no divergence); builds against the KPI mock today and against `GetNoGhostingKpis` after `pnpm gen`; `--filter @ip/company build` + `--filter @ip/ui typecheck` green.
