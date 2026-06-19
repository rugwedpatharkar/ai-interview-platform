# Screen: Applicants pipeline + advisory gate — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 2, the recruiter pipeline surface).
> **Route:** `frontend/apps/company/app/jobs/[id]/page.tsx` (enhance the Applicants tab + the Ranked tab; add the advisory-gate surface) · **Mockup:** the recruiter pipeline / applicants view · **Pillar:** [compliance-advisory-gate](../../v2/2026-06-19-compliance-advisory-gate.md) (the design + backend) + its TIER F (frontend).
> **Goal:** Turn the flat applicants list into a funnel-aware pipeline: **funnel-stage `StatusPill`s**, a **Ranked** tab (AI match order), **bulk-select + batch decide**, and the **advisory gate** — a per-job `gate_mode` toggle plus the new `assessment_review` hold state where the recruiter advances or declines (the "AI recommends, you decide" queue).

This screen **enhances** the existing job-detail page (which already ships Applicants / Ranked / Reports / Scores tabs against `ListApplicants`, `GetJobRankedCandidates`, etc.). It does **not** rebuild those tabs — it adds the advisory queue, batch actions, and the gate-mode control on top.

**Relationship to the advisory-gate plan.** The backend (enum `assessment_review`, `AptitudeConfig.gate_mode`, the funnel branch + exits, the eraser cascade) and a first cut of the FE (TIER F: `gate-mode-field.tsx`, the `assessment_review` action cluster, the candidate label) are **already specified** in [compliance-advisory-gate](../../v2/2026-06-19-compliance-advisory-gate.md). **This doc is the screen-scoped superset**: it re-states the contract for a backend session, folds in TIER F's FE work, and adds what TIER F does **not** cover — **funnel-stage StatusPills, bulk-select + batch decide, and the Ranked-tab tie-in**. Where this overlaps TIER F, follow TIER F's exact component/latch patterns (cited inline).

---

## A. Backend contract (hand this to a backend session)

**Mostly EXISTING**, two EXTENDs. The pipeline reads/writes through endpoints that already exist; the only new backend surface is the advisory-gate's `assessment_review` funnel state + the `gate_mode` job field — **both already fully planned** in the advisory-gate doc (re-stated here as the contract).

### A0 — EXISTING (no change; the FE consumes these as-is)
- `Application.ListApplicants({ jobId }) → { applications: ApplicationResponse[] }` — `ApplicationResponse` carries `{ applicationId, candidateUserId, state, ... }` (code-verified in `applicants-table.tsx` + `application_pb.ts`).
- `Decision.DecideApplication({ applicationId, outcome })` — `outcome ∈ {shortlisted, hired, rejected}`; audited; funnel-driven; **notifies the candidate** (no-ghosting).
- `Decision.OverrideGate({ applicationId })` — advances a held/gated application; audited.
- `Recommendation.GetJobRankedCandidates({ jobId }) → { matches: { candidateUserId, score, reasons[] }[] }` — AI match order (already in the Ranked tab).

### A1 — EXTEND: `assessment_review` funnel state + recruiter exits

**Status:** EXTEND · **Service:** `admin` funnel/enum (from [compliance-advisory-gate](../../v2/2026-06-19-compliance-advisory-gate.md) TIERs A–C).

- New enum member `ApplicationState.assessment_review` (a post-grade **human hold** — not terminal, not a decision, not in the retry set).
- `funnel.next_state`: when `gate_mode == "advisory"`, `aptitude_pending --aptitude.graded--> assessment_review` for **both** pass and fail (no auto-advance, no auto-reject). Exits: `gate.override → interview_pending`, `recruiter.decision(rejected) → rejected`; edge exits (`withdrawn`/`expired`) already work because the state is non-terminal.
- `grade_aptitude` puts `gate_mode` on the `aptitude.graded` payload so the funnel needs no second job read.
- **Auth/scope:** the exits reuse `decision._scoped` / `_require_manager` — comp-scoped + manager-gated for free.
- **Behavior preservation:** `auto` mode (default) is byte-for-byte today's funnel; the advisory branch is additive and default-off. The 423-test baseline is preserved.
- **FE consumes:** `ApplicationResponse.state === "assessment_review"` (no new RPC — it's a new value of the existing `state` field). The **Advance** action calls the existing `OverrideGate`; the **Reject** action calls the existing `DecideApplication(rejected)`.

### A2 — EXTEND: `gate_mode` on the job (create + edit)

**Status:** EXTEND · **Service:** `admin` `Job` (from advisory-gate TIER A Task 2 + TIER F Task F1's cross-tier note).

- `AptitudeConfig.gate_mode: Literal["auto","advisory"] = "auto"` on the model + a `string gate_mode` (fresh field number) on the `aptitude_config` proto message.
- **Reaches the request, not just the message** (the real dependency TIER F flags): `gate_mode` must be settable on `createJob` **and** on a **new `updateJob` RPC** (today `JobService` exposes only `createJob`/`getJob`/`publishJob`/`getPublicJob`/`listJobs` — **no `updateJob`**, and `createJob` takes `{title, jdText}` only). `getJob`'s response must carry `aptitudeConfig.gateMode` so the edit form can seed it.
- Proto3 missing-scalar `"" → "auto"` (same fail-open rule as `next_state`); old job docs with no `gate_mode` deserialize as `auto` — **no backfill**.
- **FE consumes (after `pnpm gen`):** `api.jobs.createJob({ title, jdText, gateMode })`, `api.jobs.getJob(...) → { aptitudeConfig: { gateMode } }`, `api.jobs.updateJob({ jobId, gateMode })`.
- **If `updateJob` is out of scope for Inc 0:** ship the create-path control only and defer the Settings tab — but say so explicitly (per TIER F's risk note).

### A3 — FE mock shape (`types.ts`)

The pipeline reads the existing `ApplicationResponse` (already typed in `@ip/api-client`). The only **new** shapes the FE needs ahead of `pnpm gen` are the gate-mode value + a thin applicant view-model used by the batch layer:

```ts
// frontend/apps/company/app/jobs/[id]/pipeline-types.ts
export type GateMode = "auto" | "advisory";

// The fields the pipeline actually reads off ApplicationResponse (a structural subset, so the
// batch/selection code is testable without the generated type). Real rows satisfy this.
export interface ApplicantRow {
  applicationId: string;
  candidateUserId: string;
  state: string;            // funnel state, incl. "assessment_review"
}

// Batch decision request (fan-out over DecideApplication; no new RPC).
export interface BatchOutcome {
  applicationIds: string[];
  outcome: "shortlisted" | "hired" | "rejected";
}
```

> No mock **client** is needed for the pipeline itself — `ListApplicants` / `OverrideGate` / `DecideApplication` already exist. The only mock surface is `gate_mode` on the job (until A2's `pnpm gen`): seed the Settings field from `job.data?.aptitudeConfig?.gateMode ?? "auto"`, which is a safe optional-chain that compiles **before** the field exists (it's `undefined → "auto"`) and binds to the real value after regen.

---

## B. Frontend plan (TDD, bite-sized)

**Shared-first (per the spine):** this screen reuses the **`StatusPill`** component built in the [candidate-report](./candidate-report.md) Task 0 (shared `@ip/ui`). If building this screen first, build `StatusPill` (and `ScoreRing`, its sibling) per that doc's Task 0 before starting here. `StatusPill` maps a funnel state through the shared `applicationStatus` map — so the pipeline's funnel-stage pills and the candidate tracker stay in lockstep from one source.

**Files:**
- Modify: `frontend/packages/ui/src/status.ts` — add the `assessment_review` token (advisory-gate TIER F Task F3; the single change that surfaces "Under review" everywhere).
- Create: `frontend/apps/company/app/jobs/[id]/pipeline-types.ts` (§A3)
- Create: `frontend/apps/company/components/gate-mode-field.tsx` (advisory-gate TIER F Task F1 — shared by create + edit)
- Create: `frontend/apps/company/components/batch-decision-bar.tsx` (bulk action bar)
- Create: `frontend/apps/company/lib/selection.ts` + `selection.test.ts` (pure selection reducer — testable)
- Modify: `frontend/apps/company/components/applicants-table.tsx` (funnel-stage StatusPills, the `assessment_review` advisory cluster, bulk-select checkboxes, the batch bar)
- Modify: `frontend/apps/company/components/decision-control.tsx` (advisory framing only — TIER F Task F2 Step 3)
- Modify: `frontend/apps/company/app/jobs/[id]/page.tsx` (add the Settings tab with the gate-mode control; pass nothing new to Applicants/Ranked)

**Components:** reuse `StatusPill`, `ScoreRing` (`@ip/ui`, from candidate-report Task 0); new `GateModeField`, `BatchDecisionBar` (app); reuse `@ip/ui` `Field`, `Select`, `Checkbox`, `Button`, `ConfirmDialog`, `Badge`, `Table`, `Card`, `Tabs`, `Alert`, `toast`.
**Query keys:** `["applicants", jobId]` (existing) · `["ranked", jobId]` (existing) · `["job", id]` (existing — invalidated on gate-mode save).

### Task 1: `assessment_review` status token (shared, TIER F Task F3)

- [ ] **Step 1: Modify `frontend/packages/ui/src/status.ts`** — insert into the `APPLICATION` map (between `gated_out` and `interview_pending`, mirroring the backend enum placement):
```ts
  assessment_review: { label: "Under review", tone: "warning" },
```
Reuse the `warning` tone (same as `scored`) so the candidate sees a consistent "a human is reviewing this" signal, distinct from the `danger` `gated_out`. This is the **single** change that surfaces "Under review" in the candidate dashboard, the candidate `jobs/[id]` page, **and** the recruiter table's non-action columns — `StatusPill`/`applicationStatus` are the one source.
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/ui typecheck` → clean.
- [ ] **Step 3: Commit** — `git add frontend/packages/ui/src/status.ts && git commit -m "feat(ui): assessment_review status token (Under review)"`

### Task 2: pure selection reducer (TDD — the batch foundation)

- [ ] **Step 1: Failing test** — `frontend/apps/company/lib/selection.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toggle, toggleAll, selectableIds } from "./selection";

const rows = [
  { applicationId: "a", state: "scored" },
  { applicationId: "b", state: "shortlisted" },
  { applicationId: "c", state: "applied" },     // not decidable
];

describe("selection", () => {
  it("toggles one id", () => {
    expect(toggle(new Set(), "a")).toEqual(new Set(["a"]));
    expect(toggle(new Set(["a"]), "a")).toEqual(new Set());
  });
  it("selectableIds excludes non-decidable states", () => {
    expect(selectableIds(rows)).toEqual(["a", "b"]);
  });
  it("toggleAll selects every selectable, or clears when all selected", () => {
    expect(toggleAll(new Set(), rows)).toEqual(new Set(["a", "b"]));
    expect(toggleAll(new Set(["a", "b"]), rows)).toEqual(new Set());
  });
});
```
- [ ] **Step 2: Run, verify fail** — `npx pnpm@9.15.0 --filter @ip/company test selection` → FAIL. *(If the app lacks a test runner, add `vitest` + a `test` script to `frontend/apps/company` first — fold in here.)*
- [ ] **Step 3: Implement `frontend/apps/company/lib/selection.ts`** — decidable = the states where a decision is legal (`scored`, `shortlisted`, `assessment_review`), so batch decide can fan out over a mixed selection safely:
```ts
import type { ApplicantRow } from "../app/jobs/[id]/pipeline-types";

// States a recruiter can decide on in bulk. assessment_review is included — a batch reject
// of advisory-held candidates is a legal recruiter.decision(rejected) per applicant.
const DECIDABLE = new Set(["scored", "shortlisted", "assessment_review"]);

export const selectableIds = (rows: Pick<ApplicantRow, "applicationId" | "state">[]) =>
  rows.filter((r) => DECIDABLE.has(r.state)).map((r) => r.applicationId);

export function toggle(sel: Set<string>, id: string): Set<string> {
  const next = new Set(sel);
  next.has(id) ? next.delete(id) : next.add(id);
  return next;
}

export function toggleAll(
  sel: Set<string>,
  rows: Pick<ApplicantRow, "applicationId" | "state">[],
): Set<string> {
  const ids = selectableIds(rows);
  return ids.every((id) => sel.has(id)) ? new Set() : new Set(ids);
}
```
- [ ] **Step 4: Run, verify pass** — `npx pnpm@9.15.0 --filter @ip/company test selection` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(pipeline): pure selection reducer for bulk-select"`

### Task 3: `BatchDecisionBar` (bulk decide → fan-out over DecideApplication)

- [ ] **Step 1: Create `frontend/apps/company/components/batch-decision-bar.tsx`** — appears when ≥1 row is selected; one `Select` for the outcome + a `ConfirmDialog`; on confirm it fans out `DecideApplication` per id (no new RPC) and invalidates the same key set `DecisionControl` does:
```tsx
"use client";

import {
  Button, ConfirmDialog, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "../lib/auth";

export function BatchDecisionBar({
  jobId, selected, onDone,
}: {
  jobId: string;
  selected: string[];
  onDone: () => void;
}) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState("");

  const decide = useMutation({
    mutationFn: async () => {
      // Sequential fan-out keeps the audit ordering deterministic and surfaces the first
      // hard failure; partial success is fine (each decision is independent + idempotent).
      const results = await Promise.allSettled(
        selected.map((applicationId) =>
          api.decisions.decideApplication({ applicationId, outcome }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) throw new Error(`${failed} of ${selected.length} decisions failed`);
    },
    onSuccess: () => {
      toast.success(`Decision applied to ${selected.length} candidate${selected.length > 1 ? "s" : ""}`);
      setOutcome("");
      onDone();
      for (const key of [["applicants", jobId], ["ranked", jobId], ["reports", jobId], ["score-dist", jobId], ["analytics"]])
        queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2">
      <span className="text-sm font-medium text-foreground">{selected.length} selected</span>
      <Select value={outcome} onValueChange={setOutcome}>
        <SelectTrigger className="h-9 w-36">
          <SelectValue placeholder="Decide…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="shortlisted">Shortlist</SelectItem>
          <SelectItem value="rejected">Decline</SelectItem>
        </SelectContent>
      </Select>
      <ConfirmDialog
        trigger={<Button size="sm" disabled={!outcome || decide.isPending}>Apply to selected</Button>}
        title={`Apply "${outcome}" to ${selected.length} candidate${selected.length > 1 ? "s" : ""}?`}
        description="Each candidate is notified of the decision. This can't be undone in bulk."
        confirmLabel="Confirm"
        busy={decide.isPending}
        onConfirm={() => decide.mutate()}
      />
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(pipeline): BatchDecisionBar — bulk decide fan-out"`

### Task 4: enhance `applicants-table.tsx` — StatusPills + advisory cluster + bulk-select

This is the core enhancement. Keep the existing loading/empty/error branches, the `override`/poll logic, and the mobile-card ↔ desktop-table lockstep. Three additions: (1) swap the raw `Badge tone={status.tone}` for `StatusPill`; (2) add the `assessment_review` advisory action cluster; (3) add selection checkboxes + the batch bar.

- [ ] **Step 1: Swap to `StatusPill`** — replace the two `applicationStatus(a.state)` + `<Badge tone={status.tone}>{status.label}</Badge>` sites (mobile card + desktop row) with `<StatusPill state={a.state} />` (import `StatusPill` from `@ip/ui`). Same label/tone, one fewer local computation, and the funnel-stage semantics now live in the shared pill.
- [ ] **Step 2: Advisory action cluster (TIER F Task F2 Step 2)** — add `assessment_review` to a new `REVIEW` set (do **not** add it to any terminal set — it must keep polling, and `TERMINAL_STATES` already excludes it). In `actions(a)`, branch `a.state === "assessment_review"` to a cluster: a `View report` link (same `buttonVariants({ variant: "outline", size: "sm" })` as the `ACTIONABLE` branch), an **Advance** `ConfirmDialog` reusing the existing `override` mutation (title **"Advance this candidate?"**, description *"The AI recommended a decision — advancing sends them to interview."*, `confirmLabel="Advance"`), and `<DecisionControl applicationId jobId />` for the decline path. Above the cluster, a small `Badge tone="warning"` reading **"AI recommended — you decide"** so the recruiter sees the call is theirs (design §3.1). The `gated_out` override branch is unchanged (the funnel widening that lets `gate.override` fire from `assessment_review` lives in the backend — the FE just calls the same `overrideGate`):
```tsx
const REVIEW = new Set(["assessment_review"]);
// ...inside actions(a):
    if (REVIEW.has(a.state))
      return (
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone="warning">AI recommended — you decide</Badge>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${jobId}/applicants/${a.applicationId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View report
            </Link>
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm">Advance</Button>}
              title="Advance this candidate?"
              description="The AI recommended a decision — advancing sends them to interview."
              confirmLabel="Advance"
              busy={override.isPending}
              onConfirm={() => override.mutate(a.applicationId)}
            />
            <DecisionControl applicationId={a.applicationId} jobId={jobId} />
          </div>
        </div>
      );
```
- [ ] **Step 2b: Extend the `override` `onSuccess` fan-out (TIER F Task F2 Step 4)** — an advance shifts the funnel into interview like a decision does, so also invalidate `["ranked", jobId]` (today it invalidates `["applicants", jobId]` + `["analytics"]`). Confirm the `refetchInterval` predicate still polls `assessment_review` rows (it does — `assessment_review ∉ TERMINAL_STATES`).
- [ ] **Step 3: Selection + checkboxes** — add `const [sel, setSel] = useState<Set<string>>(new Set())` (import `toggle`, `toggleAll`, `selectableIds` from `../lib/selection`). Add a leading checkbox column to the desktop table (header = select-all, bound to `toggleAll(sel, list)` with `checked={selectableIds(list).length > 0 && selectableIds(list).every(id => sel.has(id))}`) and a per-row `Checkbox` for decidable rows only (`selectableIds(list).includes(a.applicationId)`); add the same per-row checkbox to the mobile card header. Render `<BatchDecisionBar jobId={jobId} selected={[...sel]} onDone={() => setSel(new Set())} />` above the table when `sel.size > 0`. Prune ids that leave the decidable set after a refetch (e.g. `useEffect` intersecting `sel` with `selectableIds(list)`), so a stale selection can't target a transitioned row.
- [ ] **Step 4: Verify** — `--filter @ip/company typecheck` clean. Add `lucide-react` to `frontend/apps/company/package.json` only if a new icon is imported (no new icon here — the existing imports suffice).
- [ ] **Step 5: Commit** — `git commit -am "feat(pipeline): StatusPills + assessment_review advisory cluster + bulk-select"`

### Task 5: decision-control advisory framing (TIER F Task F2 Step 3)

- [ ] **Step 1: Modify `decision-control.tsx`** — no structural change. The existing `Reject` option already maps to the audited `recruiter.decision(rejected)` exit that `assessment_review` now allows (backend A1). Confirm the `ConfirmDialog` description (`This will mark the candidate as "${outcome}".`) reads correctly when invoked from an advisory row; if a clearer advisory phrasing is wanted, condition the copy on a new optional `context?: "review"` prop — but keep it minimal (the generic copy is already correct). No funnel/RPC change.
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "chore(pipeline): confirm DecisionControl copy reads for advisory rows"`

### Task 6: `GateModeField` + the Settings tab (TIER F Task F1)

- [ ] **Step 1: Create `frontend/apps/company/components/gate-mode-field.tsx`** — a controlled field built from `@ip/ui` `Field` + `Select` (the `decision-control.tsx` pattern), always-controlled (default `"auto"`), with a one-line explainer that swaps on the value:
```tsx
"use client";

import { Field, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ip/ui";
import type { GateMode } from "../app/jobs/[id]/pipeline-types";

export function GateModeField({
  value, onChange, disabled,
}: {
  value: GateMode;
  onChange: (v: GateMode) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="AI gate mode" hint="Who decides after the AI aptitude grade.">
      <Select value={value} onValueChange={(v) => onChange(v as GateMode)} disabled={disabled}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Automatic — AI decides pass/fail</SelectItem>
          <SelectItem value="advisory">Advisory — AI recommends, you decide</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        {value === "advisory"
          ? "Both passing and failing candidates wait in a review queue for a recruiter decision — no one is auto-rejected."
          : "Passing candidates advance automatically; failing candidates are gated out."}
      </p>
    </Field>
  );
}
```
- [ ] **Step 2: Add the Settings tab to `page.tsx` (TIER F Task F1 Step 2b)** — add a `<TabsTrigger value="settings">Settings</TabsTrigger>` + `<TabsContent value="settings">` alongside Applicants/Ranked/Reports/Scores. In it, a `Card` with `GateModeField` seeded from `job.data?.aptitudeConfig?.gateMode ?? "auto"` and a "Save" `Button`. Add an `updateMode` `useMutation` calling `api.jobs.updateJob({ jobId: id, gateMode })`; `onSuccess` → `toast.success("Gate mode updated")` + `invalidateQueries(["job", id])`; `onError` → `toast.error(errorMessage(err))` (mirror the existing `publish` mutation in the same file). Disable Save until the selected value differs from the persisted one (no-op guard). The local state seeds from the job and resyncs on `job.data` change:
```tsx
// inside JobDetailPage, after the publish mutation:
const [gateMode, setGateMode] = useState<GateMode>("auto");
useEffect(() => {
  setGateMode((job.data?.aptitudeConfig?.gateMode as GateMode) ?? "auto");
}, [job.data]);

const updateMode = useMutation({
  mutationFn: () => api.jobs.updateJob({ jobId: id, gateMode }),
  onSuccess: () => {
    toast.success("Gate mode updated");
    queryClient.invalidateQueries({ queryKey: ["job", id] });
  },
  onError: (err) => toast.error(errorMessage(err)),
});
// ...
<TabsContent value="settings">
  <Card>
    <CardContent className="flex max-w-md flex-col gap-4 p-4">
      <GateModeField value={gateMode} onChange={setGateMode} disabled={updateMode.isPending} />
      <Button
        className="self-start"
        loading={updateMode.isPending}
        disabled={gateMode === ((job.data?.aptitudeConfig?.gateMode as GateMode) ?? "auto")}
        onClick={() => updateMode.mutate()}
      >
        Save
      </Button>
    </CardContent>
  </Card>
</TabsContent>
```
> **Compiles before A2 lands:** `job.data?.aptitudeConfig?.gateMode` is an optional chain → `undefined → "auto"`; `api.jobs.updateJob(...)` is the one call that **needs** `pnpm gen` (TIER F Task F1's cross-tier dependency). Until A2 lands, either stub `updateJob` behind `NEXT_PUBLIC_MOCK` or land Task 6 last (after the proto regen) — the rest of this screen (Tasks 1–5) builds independently. If `updateJob` is deferred for Inc 0, ship the field read-only or create-only and note it.
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/api-client gen` (after A2), then `npx pnpm@9.15.0 --filter @ip/{company,api-client} typecheck` → green. If `updateJob`/`gateMode` aren't in the regenerated client, this **fails** — confirming the A2 proto dependency is real (TIER F Task F1 Step 4).
- [ ] **Step 4: Commit** — `git commit -am "feat(pipeline): GateModeField + per-job Settings tab"`

### Task 7: build + preview verification

- [ ] **Step 1: Build** — stop any `pnpm dev` first (`.next` lock), then `npx pnpm@9.15.0 --filter @ip/company build` → green.
- [ ] **Step 2: Preview loop** — start dev, open `/jobs/[id]`:
  - **Applicants tab:** rows show funnel-stage `StatusPill`s; selecting decidable rows reveals the `BatchDecisionBar`; "Apply to selected" decides the set and the rows update; an `assessment_review` row shows the **"AI recommended — you decide"** badge with **View report** / **Advance** / **Decline**; **Advance** moves it out of the queue (and the row keeps polling until it transitions).
  - **Ranked tab:** unchanged — AI match order renders (the tie-in is that a batch shortlist/advance invalidates `["ranked", jobId]`, so switching to Ranked after a batch action shows the refreshed order).
  - **Settings tab:** the gate-mode `Select` shows the persisted value, Save is disabled until changed, saving toasts + persists (against `updateJob` once A2 lands; against the mock otherwise).
  - Screenshot the Applicants tab with a mixed funnel (incl. an `assessment_review` row + an active selection).
- [ ] **Step 3: Commit** — `git commit -am "test(pipeline): preview-verify applicants pipeline + advisory gate"`

### Task 8: integration swap (when A1+A2 land)

- [ ] **Step 1:** `npx pnpm@9.15.0 --filter @ip/api-client gen` — `getJob` now returns `aptitudeConfig.gateMode`; `updateJob` exists; `ListApplicants` returns `assessment_review` states for advisory jobs.
- [ ] **Step 2:** Flip `NEXT_PUBLIC_MOCK` off; the Settings save hits real `updateJob`, the advisory cluster appears for real advisory-held applicants — no component change (the `state`/`gateMode` bindings are already wired).
- [ ] **Step 3: Verify** — `--filter @ip/{ui,company,api-client} typecheck` + `--filter @ip/company build` green; end-to-end smoke (TIER F Task F4 Step 3): create an advisory job, apply + grade as a candidate, confirm the candidate sees **"Under review"**, the recruiter sees the advisory cluster, **Advance** moves to interview and leaves the queue, and the backend audit records the `gate.override`/`recruiter.decision` exit.

---

## C. States & acceptance

- **States:**
  - **Applicants tab:** loading (`LoadingState`) · empty (`EmptyState` "No applicants yet") · error (`ErrorState` + retry) — all inherited, unchanged · success (rows with `StatusPill`s + per-state action clusters). **Selection:** the `BatchDecisionBar` appears iff ≥1 decidable row is selected; per-action busy via `decide.isPending`/`override.isPending`; toasts on success/error.
  - **Advisory queue (`assessment_review`):** the "AI recommended — you decide" badge + **Advance** (→ `OverrideGate` → `interview_pending`) + **Decline** (→ `DecideApplication(rejected)` → `rejected`); the row **keeps polling** (not terminal) until it transitions, then leaves the queue.
  - **Ranked tab:** unchanged (loading/empty/error/success already shipped); refreshed after a batch action via the `["ranked", jobId]` invalidation.
  - **Settings tab:** the gate-mode `Select` seeded from the job; Save disabled until changed (no-op guard) + `loading` while saving; success/error toasts.
  - **`auto` default / legacy jobs:** a job with no `gate_mode` reads `"auto"` (optional-chain default) — today's behavior, no `assessment_review` rows ever appear; the queue cluster is simply never hit.
- **Bulk decide semantics:** fan-out over `DecideApplication` (no new RPC); `Promise.allSettled` so a partial failure surfaces a count, not a silent drop; each decision is independent + audited + notifies the candidate. Selection is pruned to the decidable set on every refetch so a transitioned row can't be batch-targeted.
- **Responsive:** the Score/selection columns are added to **both** the `sm:hidden` stacked-card layout and the `hidden sm:block` table (kept in lockstep, per the file's existing comment); the batch bar wraps; the Settings card is `max-w-md`.
- **Dark mode:** tokens only (`StatusPill`/`Badge` tones, `bg-surface-muted`, `border-border`, `text-muted-foreground`) — automatic.
- **A11y:** the `StatusPill` carries the label as text (not color-only); the select-all + per-row checkboxes are real `@ip/ui` `Checkbox`es (keyboard-operable); the gate-mode `Select` gets its accessible name from `Field`'s `Label`/`htmlFor`; the advisory badge text ("you decide") makes the human-decision framing explicit, not implied by color.
- **Acceptance:** matches the recruiter pipeline mockup (funnel-stage pills, batch actions, the advisory queue with "you decide" framing, the per-job gate-mode toggle); `--filter @ip/ui typecheck` + `--filter @ip/company build` + `typecheck` green; the advisory path is **default-off** (`auto`) so existing jobs are byte-for-byte unchanged; works against existing RPCs today and against `updateJob` + advisory `assessment_review` rows once the BE deltas land.
