# Screen: AI candidate report + integrity band — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 2, the recruiter decision surface).
> **Route:** `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (enhance `components/report-view.tsx`) · **Mockup:** `aptura_ai_candidate_report_proctored` · **Pillar:** [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md) (Tier C + Tier D)
> **Goal:** Give the recruiter the full, trustworthy read on a candidate: a headline **ScoreRing**, per-competency cards with **evidence quotes**, the **proctoring integrity band** (severity-grouped flag timeline + integrity score + recording playback + an auto-terminated state), and the audited **DecisionControl** (advance / shortlist / decline → notifies the candidate).

This screen is the payoff of the proctoring pivot: *"a result employers can trust — a pass means something because no one can game it."* The report already renders (`Report.GetReport` with the scoring-window poll); this plan **enhances** it — it does **not** rebuild the page shell or the polling.

**Why two backend deltas, not one.** The integrity band needs a brand-new **read** path over `proctoring_events` (which is write-only today — the documented gap), AND the existing `InterviewReport` wire message must grow per-competency evidence + the two integrity scalars so the body of the report is richer. Both are isolated, additive, and independently shippable behind the FE mock.

---

## A. Backend contract (hand this to a backend session)

Two deltas. **A1** is a new RPC (the integrity gap). **A2** extends the existing report message. The FE codes against the combined `types.ts` mock (§A3) until both land via `pnpm gen`.

### A1 — `ReportService.GetIntegrityTimeline` (NEW RPC)

**Status:** NEW · **Service:** `admin` gRPC `Report` service (the same servicer that owns `GetReport` / `ListReports` / `ExportReports`).

**Reads `proctoring_events`** — the append-only collection that is **write-only today** (ingested by ai-agents `POST /interview/{id}/proctor`; indexed `(application_id)` and `(comp_id, application_id)` per `admin/infra/db.py`). This RPC is the **first reader**.

```proto
// service: admin Report — NEW rpc on the existing service
rpc GetIntegrityTimeline(GetIntegrityTimelineRequest) returns (IntegrityTimeline);

message GetIntegrityTimelineRequest {
  string application_id = 1;
}

message IntegrityTimeline {
  int32 integrity_score = 1;          // weighted sum (proctoring.integrity_score) — higher = more concerning
  repeated ProctorFlag flags = 2;     // chronological; severity assigned server-side
  string recording_url = 3;           // tenant-scoped playback URL; "" when no recording
  bool auto_terminated = 4;           // a HIGH-severity signal ended the interview
  string terminated_reason = 5;       // e.g. "second_face" — set iff auto_terminated
}

message ProctorFlag {
  string type = 1;                    // ProctoringEventType, e.g. "second_face" | "tab_hidden"
  string severity = 2;                // "low" | "medium" | "high" (server-authoritative)
  string at = 3;                      // ISO timestamp (received_at, server-stamped)
  map<string, string> meta = 4;       // small typed context (never raw media)
}
```

- **Auth/scope:** bearer; **comp-scoped** — resolve the application's `comp_id` and reject a forged/mismatched tenant (reuse `decision._scoped` / the `(comp_id, application_id)` index). A recruiter sees only their own company's timelines. This is the security crux: the timeline is **biometric-adjacent** data.
- **Backed by:** new `resources/integrity.py` (`get_integrity_timeline(identity, application_id)`) reading `proctoring_events` filtered by `(comp_id, application_id)`, sorted `at asc`. `integrity_score` = `model/proctoring.integrity_score(events)` (reuse — do not reimplement the weights). `severity` per event = `proctoring.severity_of(type)`. `auto_terminated` / `terminated_reason` come from the interview session's `terminated_by_proctor` finalize flag (proctored-integrity Tier B) — read the application/session doc, default `false` / `""`.
- **Severity is server-authoritative** (mirrors the ingest contract): the client never sends severity; `severity_of()` is the single source. HIGH set = `{second_face, second_voice, phone_detected, screen_share, virtual_camera, synthetic_audio_suspected}`.
- **Recording:** `recording_url` is the tenant-scoped MinIO/S3 key for the persisted LiveKit session video (proctored-integrity Tier C), presigned read; `""` when none. Added to the `CandidateEraser` cascade (already tracked in that pillar).
- **Empty/not-run:** an application with no events returns `{integrity_score: 0, flags: [], recording_url: "", auto_terminated: false}` — a clean `200`, **not** a 404 (distinct from the report 404 below).
- **Excluded from the DTO (grep-test):** raw frames/audio, voiceprints, affect/emotion inferences (never inferred per the model docstring), other applications' events. Only `{type, severity, at, meta}` per flag.
- **Proto/file:** add to `src/admin/app/routes/pb/report.proto`; servicer in `routes/<report grpc module>.py`; resource `resources/integrity.py`; tests `tests/test_resources_integrity.py` (comp-scoping: forged `comp_id` → `NotFoundError`; severity from `severity_of`; score from `integrity_score`).
- **Pillar cross-ref:** [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md) Tier C ("Recruiter integrity timeline: new read path over `proctoring_events` … `GetIntegrityTimeline(application_id)` on admin").

### A2 — `InterviewReport` gains per-competency evidence + integrity scalars (EXTEND)

**Status:** EXTEND · **Service:** `ai-agents` report model (`model/scoring.py`) → surfaced on the admin `Report` message (`report.proto`).

Today (code-verified): `Evaluation` already carries `competency_scores: list[CompetencyScore {competency, score, rationale}]`, but **`InterviewReport` flattens** to `{executive_summary, highlights[], risks[], overall_score, recommendation}` — the per-competency detail and any integrity data never reach the wire. This delta promotes the competency detail (with **evidence quotes**) and folds in the two integrity scalars so the report body is self-contained (the timeline RPC stays the source for the full flag list + recording).

```proto
// EXTEND the existing report message returned by Report.GetReport
message Report {
  // ... existing fields (executive_summary, highlights, risks, overall_score, recommendation) unchanged ...
  repeated Competency competencies = 20;   // fresh field numbers — additive, wire-compatible
  float  integrity_score = 21;             // mirror of IntegrityTimeline.integrity_score (quick headline)
  int32  integrity_flag_count = 22;        // count of flags (so the band can render before the timeline loads)
  bool   auto_terminated = 23;             // HIGH-severity termination — drives the banner state
}

message Competency {
  string competency = 1;     // e.g. "Problem solving"
  float  score = 2;          // 0.0 .. 1.0
  string rationale = 3;      // the model's summary judgement
  repeated Evidence evidence = 4;
}

message Evidence {
  string quote = 1;          // verbatim candidate utterance the score draws on
  string note = 2;           // optional why-this-matters gloss ("" if none)
}
```

- **Model side (`scoring.py`):** add `evidence: list[Evidence]` to `CompetencyScore` (`Evidence = {quote: str, note: str = ""}`); promote `competency_scores` onto `InterviewReport` as `competencies`; add `integrity_score: float = 0.0` + `integrity_flag_count: int = 0` + `auto_terminated: bool = False` to `InterviewReport`. The `report_writer` reads `proctoring_events` for the application to fill the integrity scalars (it currently does not — proctored-integrity Tier C).
- **Backward-compatible:** all new proto fields use **fresh numbers**; old reports deserialize with empty `competencies` + `0`/`false` integrity — the FE renders the legacy flat view (no competency cards, no band) with zero errors. **No backfill.**
- **Auth/scope:** unchanged — `GetReport` is already comp-scoped.
- **`pnpm gen`:** the FE’s `api.reports.getReport(...)` response type gains `competencies`, `integrityScore`, `integrityFlagCount`, `autoTerminated`.
- **Pillar cross-ref:** proctored-integrity Tier C ("add `integrity_score` + `integrity_flags` to the report model … `report_writer` reads `proctoring_events`").

### A3 — FE mock shape (`types.ts`)

The FE codes against this until A1+A2 land. Field names are the **camelCased** protobuf-es projection (`integrity_score → integrityScore`).

```ts
// frontend/apps/company/app/jobs/[id]/applicants/[appId]/types.ts
export type Severity = "low" | "medium" | "high";
export type Recommendation = "advance" | "hold" | "reject";

// A2 — enriched report (superset of what report-view renders today)
export interface Evidence { quote: string; note: string; }
export interface Competency {
  competency: string;
  score: number;            // 0..1
  rationale: string;
  evidence: Evidence[];
}
export interface ReportDTO {
  applicationId: string;
  state: string;
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  overallScore: number;     // 0..1
  recommendation: Recommendation;
  competencies: Competency[];        // [] for legacy reports
  integrityScore: number;            // 0 for legacy
  integrityFlagCount: number;
  autoTerminated: boolean;
}

// A1 — integrity timeline (separate RPC, separate query)
export interface ProctorFlag {
  type: string;
  severity: Severity;
  at: string;               // ISO
  meta: Record<string, string>;
}
export interface IntegrityTimeline {
  integrityScore: number;
  flags: ProctorFlag[];
  recordingUrl: string;     // "" when none
  autoTerminated: boolean;
  terminatedReason: string;
}

// The HIGH-severity catalog (mirror of model/proctoring._SEVERITY) — for fixtures + labels only.
export const HIGH_SIGNALS = [
  "second_face", "second_voice", "phone_detected",
  "screen_share", "virtual_camera", "synthetic_audio_suspected",
] as const;
```

---

## B. Frontend plan (TDD, bite-sized)

**Shared-first (per the spine):** `ScoreRing` and `StatusPill` are new **`@ip/ui`** components built in **Task 0** — they are reused by other v2 screens (the recruiter dashboard KPI rings, the applicants-pipeline status pills), so they live in the design system, not the app. Build + typecheck `@ip/ui` before the app tasks.

**Files:**
- Create: `frontend/packages/ui/src/score-ring.tsx` + `status-pill.tsx`; export both from `frontend/packages/ui/src/index.ts`
- Create: `frontend/packages/ui/src/score-ring.test.tsx` (geometry pure-fn)
- Create: `frontend/apps/company/app/jobs/[id]/applicants/[appId]/types.ts` (§A3)
- Create: `frontend/apps/company/app/jobs/[id]/applicants/[appId]/integrity-client.ts` (real `GetIntegrityTimeline` call + `makeMockIntegrityClient()`)
- Create: `frontend/apps/company/components/competency-card.tsx`
- Create: `frontend/apps/company/components/integrity-band.tsx`
- Modify: `frontend/apps/company/components/report-view.tsx` (compose ScoreRing + competency cards + integrity band; keep the existing sections + DecisionControl gating)
- Modify: `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (add the integrity query alongside the report query; keep the report poll)
- Create: `frontend/apps/company/components/proctor-labels.ts` (signal → human label + helper; small, app-local)

**Components:** new `ScoreRing`, `StatusPill` (`@ip/ui`); new `CompetencyCard`, `IntegrityBand` (app); reuse `@ip/ui` `Card`, `Badge`, `Alert`, `Progress`, `Spinner`, `Button`, `EmptyState`, `LoadingState`, `ErrorState`.
**Query keys:** `["report", appId]` (existing, unchanged) · `["integrity", appId]` (new).

### Task 0: `ScoreRing` + `StatusPill` in `@ip/ui` (shared, TDD)

> Per the spine these are **shared** components. Build them first; every Wave-2/recruiter screen reuses them.

- [ ] **Step 1: Failing test** — `frontend/packages/ui/src/score-ring.test.tsx` for the pure geometry helper:
```tsx
import { describe, it, expect } from "vitest";
import { ringGeometry } from "./score-ring.js";

describe("ringGeometry", () => {
  it("maps fraction → stroke-dashoffset over the circumference", () => {
    const g = ringGeometry(0.75, 60, 8);            // value, size px, stroke
    expect(g.radius).toBe(26);                       // (60-8)/2
    expect(Math.round(g.circumference)).toBe(163);   // 2πr
    expect(Math.round(g.offset)).toBe(41);           // circ * (1 - 0.75)
  });
  it("clamps out-of-range values", () => {
    expect(ringGeometry(2, 60, 8).offset).toBe(0);   // ≥1 → full
    expect(ringGeometry(-1, 60, 8).offset).toBe(ringGeometry(0, 60, 8).circumference);
  });
});
```
- [ ] **Step 2: Run, verify fail** — `npx pnpm@9.15.0 --filter @ip/ui test score-ring` → FAIL (`ringGeometry` undefined). *(If `@ip/ui` has no test runner, add `vitest` to its devDeps + a `test` script — fold into this step; mirror however `@ip/shared` runs tests.)*
- [ ] **Step 3: Implement `score-ring.tsx`** — an accessible circular donut using SVG + tokens (no raw colors):
```tsx
import { cn } from "./cn.js";

export function ringGeometry(value: number, size: number, stroke: number) {
  const v = Math.min(1, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return { radius, circumference, offset: circumference * (1 - v) };
}

const TONE = {
  brand: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export interface ScoreRingProps {
  /** 0..1 */
  value: number;
  size?: number;          // px, default 96
  stroke?: number;        // px, default 8
  tone?: keyof typeof TONE;
  label?: string;         // centered caption under the % (e.g. "Overall")
  className?: string;
}

/** Circular score donut. Renders `value` as a percentage with an accessible label. */
export function ScoreRing({
  value, size = 96, stroke = 8, tone = "brand", label, className,
}: ScoreRingProps) {
  const { radius, circumference, offset } = ringGeometry(value, size, stroke);
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const c = size / 2;
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      role="img"
      aria-label={`${label ? label + " " : ""}score ${pct} percent`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke}
          className="stroke-surface-muted"
        />
        <circle
          cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn("transition-[stroke-dashoffset] duration-500", TONE[tone], "stroke-current")}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-display text-xl font-semibold text-foreground">{pct}%</span>
        {label && <span className="text-xs text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}
```
- [ ] **Step 4: Implement `status-pill.tsx`** — a thin token-driven pill that maps a funnel state through `applicationStatus` (single source) and renders a `Badge`, with an optional dot for the active funnel stage:
```tsx
import { Badge } from "./badge.js";
import { applicationStatus } from "./status.js";

export interface StatusPillProps {
  /** A funnel application state, e.g. "scored" | "assessment_review". */
  state: string;
  /** Show a leading dot (used in the pipeline funnel-stage view). */
  dot?: boolean;
  className?: string;
}

/** Funnel-state pill — label + tone come from the shared `applicationStatus` map. */
export function StatusPill({ state, dot, className }: StatusPillProps) {
  const { label, tone } = applicationStatus(state);
  return (
    <Badge tone={tone} className={className}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {label}
    </Badge>
  );
}
```
- [ ] **Step 5: Export** — add to `frontend/packages/ui/src/index.ts`:
```ts
export { ScoreRing, ringGeometry, type ScoreRingProps } from "./score-ring.js";
export { StatusPill, type StatusPillProps } from "./status-pill.js";
```
- [ ] **Step 6: Verify** — `npx pnpm@9.15.0 --filter @ip/ui test score-ring` → PASS; `npx pnpm@9.15.0 --filter @ip/ui typecheck` → clean.
- [ ] **Step 7: Commit** — `git add frontend/packages/ui/src && git commit -m "feat(ui): ScoreRing + StatusPill shared components"`

### Task 1: Report DTO types + integrity client (+ mock)

- [ ] **Step 1: Implement `types.ts`** — paste §A3.
- [ ] **Step 2: Implement `integrity-client.ts`** — the real call + a mock behind a flag so the band builds before A1 lands:
```ts
import type { IntegrityTimeline } from "./types";
import { HIGH_SIGNALS } from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

// Real call: once A1 lands, api.reports.getIntegrityTimeline exists after `pnpm gen`.
export async function fetchIntegrityTimeline(
  api: { reports: { getIntegrityTimeline(req: { applicationId: string }): Promise<IntegrityTimeline> } },
  applicationId: string,
): Promise<IntegrityTimeline> {
  return api.reports.getIntegrityTimeline({ applicationId });
}

export function makeMockIntegrityClient() {
  return async (applicationId: string): Promise<IntegrityTimeline> => {
    // A representative mixed timeline: a couple LOW/MED + one HIGH (drives the terminated state).
    const flags = [
      { type: "tab_hidden",   severity: "low" as const,    at: "2026-06-20T10:01:04Z", meta: {} },
      { type: "gaze_off_screen", severity: "low" as const, at: "2026-06-20T10:03:22Z", meta: {} },
      { type: "camera_occluded", severity: "medium" as const, at: "2026-06-20T10:06:10Z", meta: {} },
      { type: "second_face",  severity: "high" as const,   at: "2026-06-20T10:08:41Z", meta: { faces: "2" } },
    ];
    const auto = flags.some((f) => HIGH_SIGNALS.includes(f.type as (typeof HIGH_SIGNALS)[number]));
    return {
      integrityScore: 1 + 1 + 3 + 8,            // mirror the weighted sum
      flags,
      recordingUrl: applicationId ? "https://example.invalid/recording.mp4" : "",
      autoTerminated: auto,
      terminatedReason: auto ? "second_face" : "",
    };
  };
}
```
- [ ] **Step 3: Implement `proctor-labels.ts`** — signal → human label + the severity ordering for grouping:
```ts
export const SEVERITY_ORDER = ["high", "medium", "low"] as const;

const LABELS: Record<string, string> = {
  second_face: "Second person detected",
  second_voice: "Second voice detected",
  phone_detected: "Phone detected",
  screen_share: "Screen sharing",
  virtual_camera: "Virtual camera",
  synthetic_audio_suspected: "Synthetic audio suspected",
  gaze_off_screen: "Looked away from screen",
  head_turned_away: "Head turned away",
  camera_occluded: "Camera covered",
  body_out_of_frame: "Out of frame",
  lips_move_no_audio: "Lips moving, no audio",
  multi_monitor: "Second monitor",
  tab_hidden: "Switched tab",
  window_blur: "Left the window",
  fullscreen_exit: "Exited fullscreen",
  copy: "Copied text",
  paste_large: "Pasted large text",
  devtools_open: "Opened dev tools",
  keystroke_anomaly: "Keystroke anomaly",
  ip_geo_anomaly: "Location anomaly",
  keyboard_typing: "Background typing",
};

export const signalLabel = (type: string) =>
  LABELS[type] ?? type.replace(/_/g, " ");

export const severityTone = (s: string) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "neutral";
```
- [ ] **Step 4: Verify** — `npx pnpm@9.15.0 --filter @ip/company typecheck` → clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(report): integrity types + mock client + signal labels"`

### Task 2: `CompetencyCard` component

- [ ] **Step 1: Create `frontend/apps/company/components/competency-card.tsx`** — a per-competency card with the score (a small `ScoreRing`), rationale, and the evidence quotes:
```tsx
import { Card, CardContent, ScoreRing } from "@ip/ui";
import type { Competency } from "../app/jobs/[id]/applicants/[appId]/types";

const tone = (s: number) => (s >= 0.75 ? "success" : s >= 0.5 ? "warning" : "danger");

export function CompetencyCard({ c }: { c: Competency }) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <ScoreRing value={c.score} size={64} stroke={6} tone={tone(c.score)} />
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-sm font-medium text-foreground">{c.competency}</h4>
          {c.rationale && (
            <p className="mt-0.5 text-sm text-muted-foreground">{c.rationale}</p>
          )}
          {c.evidence.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {c.evidence.map((e, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <p className="text-sm italic text-foreground">“{e.quote}”</p>
                  {e.note && <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(report): CompetencyCard with evidence quotes"`

### Task 3: `IntegrityBand` component (the proctoring surface)

- [ ] **Step 1: Create `frontend/apps/company/components/integrity-band.tsx`** — takes the timeline query result and renders: the integrity score, the **auto-terminated banner** (when `autoTerminated`), a severity-grouped flag timeline, and the recording playback. Loading/empty handled inline (the timeline is a sibling query, not the page gate):
```tsx
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, ScoreRing, Spinner } from "@ip/ui";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { IntegrityTimeline, ProctorFlag } from "../app/jobs/[id]/applicants/[appId]/types";
import { SEVERITY_ORDER, severityTone, signalLabel } from "./proctor-labels";

// Integrity score → a 0..1 "clean" fraction for the ring (lower raw score = cleaner).
// 0 → 1.0 (spotless); clamp so a noisy session still reads as low-but-nonzero.
const cleanFraction = (score: number) => Math.max(0, 1 - score / 24);

function groupBySeverity(flags: ProctorFlag[]) {
  return SEVERITY_ORDER
    .map((sev) => ({ sev, items: flags.filter((f) => f.severity === sev) }))
    .filter((g) => g.items.length > 0);
}

export function IntegrityBand({
  timeline, loading, error,
}: {
  timeline: IntegrityTimeline | undefined;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          Interview integrity
        </CardTitle>
        {timeline && !timeline.autoTerminated && (
          <Badge tone={timeline.flags.length === 0 ? "success" : "warning"}>
            {timeline.flags.length === 0 ? "No flags" : `${timeline.flags.length} flag${timeline.flags.length > 1 ? "s" : ""}`}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Loading integrity timeline…
          </span>
        )}
        {error && <Alert tone="warning">Integrity data unavailable: {error}</Alert>}
        {timeline && (
          <>
            {timeline.autoTerminated && (
              <Alert tone="danger">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="size-4" aria-hidden />
                  Interview auto-terminated for a high-severity integrity signal
                  {timeline.terminatedReason && <> — {signalLabel(timeline.terminatedReason)}</>}.
                </span>
              </Alert>
            )}
            <div className="flex items-center gap-4">
              <ScoreRing
                value={cleanFraction(timeline.integrityScore)}
                size={72}
                tone={timeline.autoTerminated ? "danger" : timeline.flags.length ? "warning" : "success"}
                label="Integrity"
              />
              <div className="text-sm text-muted-foreground">
                {timeline.flags.length === 0
                  ? "No proctoring flags were raised during this interview."
                  : `Weighted integrity score ${timeline.integrityScore} — higher means more concerning. Review the flags below.`}
              </div>
            </div>

            {groupBySeverity(timeline.flags).map(({ sev, items }) => (
              <div key={sev}>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-medium capitalize text-foreground">
                  {sev} severity
                  <Badge tone={severityTone(sev)}>{items.length}</Badge>
                </p>
                <ul className="flex flex-col gap-1.5">
                  {items.map((f, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-1.5 text-sm">
                      <span className="text-foreground">{signalLabel(f.type)}</span>
                      <time className="font-mono text-xs text-muted-foreground" dateTime={f.at}>
                        {new Date(f.at).toLocaleTimeString()}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {timeline.recordingUrl && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-foreground">Session recording</p>
                <video
                  src={timeline.recordingUrl}
                  controls
                  className="w-full rounded-lg border border-border"
                  aria-label="Proctored interview session recording"
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean. *(Add `lucide-react` to `frontend/apps/company/package.json` if `AlertTriangle`/`ShieldCheck`/`ShieldCheck` aren't already imported there — the per-app lucide rule.)*
- [ ] **Step 3: Commit** — `git commit -am "feat(report): IntegrityBand — severity-grouped flags + recording + auto-terminated state"`

### Task 4: Compose into `report-view.tsx` (enhance, don't rebuild)

- [ ] **Step 1: Modify `report-view.tsx`** — swap the two flat `Stat` tiles for a `ScoreRing` headline, render the competency cards, and slot the `IntegrityBand`. Keep the existing `executiveSummary`, `Highlights`/`Risks` sections and the `DecisionControl` gate **unchanged**. The component now takes the timeline (the page passes it in):
```tsx
"use client";

import { Badge, type BadgeTone, Card, CardContent, CardHeader, CardTitle, ScoreRing } from "@ip/ui";
import type { IntegrityTimeline, ReportDTO } from "../app/jobs/[id]/applicants/[appId]/types";
import { CompetencyCard } from "./competency-card";
import { IntegrityBand } from "./integrity-band";
import { DecisionControl } from "./decision-control";

const REC_TONE: Record<string, BadgeTone> = { advance: "success", hold: "warning", reject: "danger" };
const recTone = (s: number) => (s >= 0.75 ? "success" : s >= 0.5 ? "warning" : "danger");

export function ReportView({
  report, jobId, timeline, timelineLoading, timelineError,
}: {
  report: ReportDTO;
  jobId: string;
  timeline: IntegrityTimeline | undefined;
  timelineLoading: boolean;
  timelineError: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Interview report</CardTitle>
          <Badge tone={REC_TONE[report.recommendation] ?? "neutral"}>{report.recommendation}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <ScoreRing value={report.overallScore} size={112} tone={recTone(report.overallScore)} label="Overall" />
            <p className="text-sm text-foreground">{report.executiveSummary}</p>
          </div>

          <ReportSection title="Highlights" items={report.highlights} tone="text-success-foreground" />
          <ReportSection title="Risks" items={report.risks} tone="text-warning-foreground" />

          {report.competencies.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">Competencies</p>
              {report.competencies.map((c) => <CompetencyCard key={c.competency} c={c} />)}
            </div>
          )}

          {/* advance/shortlist/decline — records an audited decision that notifies the candidate */}
          {["scored", "shortlisted"].includes(report.state) && (
            <DecisionControl applicationId={report.applicationId} jobId={jobId} />
          )}
        </CardContent>
      </Card>

      {/* The integrity band is its own card so it reads as a distinct trust surface. Render it
          whenever there's a timeline, it's loading, there's an error, OR the report itself
          flags a termination (so the banner shows even if the timeline query lags). */}
      {(timeline || timelineLoading || timelineError || report.autoTerminated || report.integrityFlagCount > 0) && (
        <IntegrityBand timeline={timeline} loading={timelineLoading} error={timelineError} />
      )}
    </div>
  );
}

function ReportSection({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">{title}</p>
      <ul className={`flex list-inside list-disc flex-col gap-1 text-sm ${tone}`}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(report): ScoreRing headline + competency cards + integrity band in ReportView"`

### Task 5: Wire the integrity query in the page (keep the report poll)

- [ ] **Step 1: Modify `page.tsx`** — add the integrity query next to the existing report query. **Keep** the `GetReport` poll exactly (success → stop; 404/transient → poll 3s). The integrity query is **non-blocking**: it never gates the page (the report renders without it), and it does **not** poll on 404 because the timeline returns `200`/empty when there are no events:
```tsx
"use client";

import { Alert, ErrorState, LoadingState, Spinner, buttonVariants } from "@ip/ui";
import { errorMessage, isNotFound, isTransient, useAuthedQuery } from "@ip/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CompanyShell } from "../../../../../components/company-shell";
import { ReportView } from "../../../../../components/report-view";
import { useAuth } from "../../../../../lib/auth";
import { makeMockIntegrityClient, USE_MOCK } from "./integrity-client";

const mockIntegrity = makeMockIntegrityClient();

export default function ReportPage() {
  const { api, token } = useAuth();
  const { id, appId } = useParams<{ id: string; appId: string }>();

  const report = useAuthedQuery(token, {
    queryKey: ["report", appId],
    retry: false,
    queryFn: () => api.reports.getReport({ applicationId: appId }),
    refetchInterval: (query) => {
      if (query.state.status === "success") return false;
      const err = query.state.error;
      return isNotFound(err) || isTransient(err) ? 3000 : false;
    },
  });

  // Integrity timeline — sibling, non-blocking. Mockable until A1 lands. Returns 200/empty
  // when no events, so no 404-poll; one transient retry is enough.
  const integrity = useAuthedQuery(token, {
    queryKey: ["integrity", appId],
    retry: 1,
    queryFn: () =>
      USE_MOCK ? mockIntegrity(appId) : api.reports.getIntegrityTimeline({ applicationId: appId }),
  });

  const notReady = report.isError && isNotFound(report.error);

  return (
    <CompanyShell>
      <div className="mb-4">
        <Link href={`/jobs/${id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to job
        </Link>
      </div>
      {report.isLoading && <LoadingState />}
      {notReady && (
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Spinner /> The report is being generated — this updates automatically.
          </span>
        </Alert>
      )}
      {report.isError && !notReady && (
        <ErrorState message={errorMessage(report.error)} retry={() => report.refetch()} />
      )}
      {report.data && (
        <ReportView
          report={report.data}
          jobId={id}
          timeline={integrity.data}
          timelineLoading={integrity.isLoading}
          timelineError={integrity.isError ? errorMessage(integrity.error) : null}
        />
      )}
    </CompanyShell>
  );
}
```
> **Note:** until A2 lands, `report.data` from the real `getReport` lacks `competencies`/`integrityScore` — guard the cast in `ReportView` (the `?? []` / `?? 0` defaults live in `types.ts` shape; protobuf-es fills repeated/scalar defaults, so `report.data.competencies` is `[]` and the competency block simply doesn't render — no crash). Set `NEXT_PUBLIC_MOCK=1` to see the full band with fixtures before either delta lands.
- [ ] **Step 2: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/company build` clean (stop any `pnpm dev` first — `.next` lock). Then the preview loop: start dev, open a `/jobs/[id]/applicants/[appId]` route, confirm: ScoreRing headline renders, competency cards show evidence quotes, the integrity band groups flags by severity (high → medium → low), the auto-terminated banner shows for the HIGH fixture, the recording `<video>` renders, and `DecisionControl` still appears for a `scored`/`shortlisted` state. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(report): wire integrity timeline query (non-blocking) into the report page"`

### Task 6: Integration swap (when A1+A2 land)

- [ ] **Step 1:** `npx pnpm@9.15.0 --filter @ip/api-client gen` — the `Report` service now exposes `getIntegrityTimeline` and the report response carries `competencies` + integrity scalars.
- [ ] **Step 2:** Flip `NEXT_PUBLIC_MOCK` off; the page's `getIntegrityTimeline` branch is already wired — no component change. If protobuf-es names a field differently than §A3’s camelCase guess, adjust `types.ts` to match the generated type (the components import from `types.ts`, so it’s a one-file fix).
- [ ] **Step 3: Verify** — `--filter @ip/{ui,company,api-client} typecheck` + `--filter @ip/company build` green; preview against a real scored, proctored application.

---

## C. States & acceptance

- **States:**
  - **Report:** loading (`LoadingState`) · generating (404 → the existing auto-updating `Alert`) · error (non-404 → `ErrorState` + retry) · success (ScoreRing + competencies + sections + DecisionControl).
  - **Integrity band:** loading (inline spinner — never blocks the report) · error (inline `Alert tone="warning"`, "data unavailable" — a missing timeline must not hide the report) · empty (`{flags: []}` → "No proctoring flags" + a green ring) · populated (severity-grouped timeline + recording) · **auto-terminated** (red `Alert` banner + danger ring; this is the headline state of the proctoring pivot).
  - **Legacy report** (pre-A2): `competencies: []`, `integrityScore: 0` → renders the flat highlights/risks view with no competency block and no band — zero errors, full backward-compat.
- **Decision:** `DecisionControl` (advance via `overrideGate` from the table, or shortlist/decline via `decideApplication`) records an **audited** decision; the funnel transition notifies the candidate (no-ghosting). Gated to `scored`/`shortlisted` exactly as today.
- **Responsive:** the headline ScoreRing + summary stack on mobile (`sm:flex-row`); competency cards are full-width; the flag timeline rows wrap; the recording `<video>` is fluid-width.
- **Dark mode:** tokens only (`text-primary`, `stroke-surface-muted`, `bg-surface-muted`, `border-border`, status families) — automatic. The ScoreRing uses `stroke-current` over a token color, so the ring is theme-safe.
- **A11y:** `ScoreRing` has `role="img"` + an `aria-label` reading the percentage; flag timestamps use `<time dateTime>`; the recording `<video>` has an `aria-label`; severity group counts are `Badge`s (not color-only).
- **Security note (carry to the BE session):** `GetIntegrityTimeline` is the **first reader** of biometric-adjacent proctoring data — comp-scoping (forged-`comp_id` rejected) is a hard acceptance criterion, tested at the resource layer, not just asserted here.
- **Acceptance:** matches `aptura_ai_candidate_report_proctored` (ScoreRing headline, per-competency evidence cards, integrity band with grouped flags + recording + terminated state); `--filter @ip/ui typecheck` + `--filter @ip/company build` + `typecheck` green; works against the mock today (`NEXT_PUBLIC_MOCK=1`) and against real `GetIntegrityTimeline` + the extended report once both BE deltas land.
