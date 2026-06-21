# Company audit log — Backend contract (v3 · TBD · NEW or DERIVED scope)

> **Screen.** `/company/audit` decision audit-trail viewer. **FE consumer:** [`frontend_company-audit-log.md`](./frontend_company-audit-log.md).
> **Status:** **NEW or DERIVED scope — contract TBD with the backend session.** The
> underlying audit collection is **likely already populated** by `Decision.DecideApplication`
> and `Decision.OverrideGate` (per the v2 decision contract — every decision is server-side
> audited with reviewer + reason). What's missing today is a **public read RPC** that
> surfaces the audit collection for an admin to query, filter, and inspect cross-applicant.
> This file documents the **proposed surface** the FE builds against via a typed mock
> client; the backend session owns the final contract + confirms whether the data is
> already write-once-readable or whether a new collection is needed.
> **Anti-fiction reminder:** Aptura is pre-launch. The mock client returns a small **"Sample"
> fixture** (3–5 rows max) clearly labelled in every row — no fabricated real-looking audit
> trail. The drawer never invents an evidence snapshot; when the snapshot is missing for an
> old entry, the card says "Evidence snapshot not available for this entry." Reviewer
> reasons are **verbatim** — no AI rewrite. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **mock only.** FE codes against `makeAuditClient()` behind
> `NEXT_PUBLIC_MOCK`. When the backend session confirms / lands `AuditService`, the FE
> flip is the existing 1-line client swap (`createAuditClient(api)`); components are
> unchanged.

## Functionalities (proposed)

- **List** decision audit entries for the caller's company, filterable by:
  - `decision_types`: `["decideApplication", "overrideGate"]` (multi-select)
  - `outcomes`: `["shortlisted", "rejected", "hired", "held"]` (multi-select)
  - `reviewer_email`: single
  - `job_id`: single
  - `applicant_query`: text search on candidate name
  - `from_at` / `to_at`: ISO date range (UTC stored; viewer-local on display)
  Paginated; sorted desc by `timestamp`.
- **Get** the full audit entry by `audit_id` (returns the reason text, evidence snapshot,
  reviewer forensics).

Both are **admin-only** (`company_admin`); recruiters and hiring managers do NOT call them.
Per-applicant audit (a single applicant's decision history) remains on the applicant-report
page; this surface is the **cross-job + cross-applicant** view.

The surface is **read-only**. Audit entries are **immutable** — no edit RPC, no delete
RPC (audit log integrity).

## Service & RPCs (PROPOSED · TBD)

The proposed service is `admin.audit.v1.AuditService` (gRPC-web on **admin**; bearer
required). Every method is **`audit:view`-gated** (⇒ `company_admin` only) + comp-scoped
(target company derived from the **token**, never the request).

```proto
// PROPOSED — final shape owned by the backend session.
service AuditService {
  rpc ListDecisionAudit(ListDecisionAuditRequest) returns (ListDecisionAuditResponse);
  rpc GetDecisionAudit(GetDecisionAuditRequest)   returns (AuditEntryFull);
}
```

**Auth/scope (proposed).** Bearer; **company-admin only** (the `audit:view` scope ⇒ only
`company_admin` holds it). The action is authorised with a new
`require_permission("audit:view")` on top of the existing RBAC matrix. `audit:view` joins
the existing 8 scopes in `lib/lib/schemas/permissions.py` as scope #10 — admin gets it;
recruiter and hiring_manager do NOT. The FE `PERMISSIONS` constant must be kept in lock-step
when the backend lands (see [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md)).

## Request / Response structures (PROPOSED · TBD)

camelCase per protobuf-es on the FE.

```ts
// FE mock shapes — `apps/company/app/audit/types.ts`. These ARE the contract surface the
// FE builds against today; the backend session may refine field names but the **shape** is
// what the components consume.

export type DecisionType = "decideApplication" | "overrideGate";
export type DecisionOutcome = "shortlisted" | "rejected" | "hired" | "held";

export interface AuditEntry {
  auditId: string;                  // immutable id, e.g., "dl_2026_a3f9c1"
  timestamp: string;                // ISO-8601 UTC
  applicantId: string;              // appId
  applicantName: string;            // denormalised at write time (no fetch on read)
  applicantEmail: string;           // denormalised
  jobId: string;
  jobTitle: string;                 // denormalised at write time
  decision: DecisionType;           // "decideApplication" | "overrideGate"
  outcome: DecisionOutcome;         // (overrideGate's outcome is the post-override state)
  reviewerEmail: string;            // denormalised
  reviewerRole: "company_admin" | "recruiter" | "hiring_manager";
  reasonText: string;               // verbatim — what the reviewer typed
  reasonSnippet: string;            // server-computed: first 120 chars + "…" if longer
}

// Returned only when the drawer opens — adds evidence snapshot + forensics.
export interface AuditEntryFull extends AuditEntry {
  evidenceSnapshot: {
    overallScore: number | null;        // 0..1; null when not yet scored at decision time
    integrityScore: number | null;      // 0..1; null when integrity timeline absent
    flagCount: number;                   // 0 when no flags
    recommendation: "advance" | "hold" | "reject" | "";   // "" when no report at decision time
  } | null;                              // null = "Evidence snapshot not available for this entry."
  reviewerCtx: {
    ip: string;                          // "" when not recorded
    userAgent: string;                   // "" when not recorded
  };
}

export interface AuditListFilters {
  decisionTypes: DecisionType[];
  outcomes: DecisionOutcome[];
  reviewerEmail: string;
  jobId: string;
  applicantQuery: string;
  fromAt: string;                       // ISO date (yyyy-MM-dd); empty = unconstrained lower bound
  toAt: string;                         // ISO date (yyyy-MM-dd); empty = unconstrained upper bound
}

export interface ListDecisionAuditRequest extends AuditListFilters {
  page: number;
  pageSize: number;                     // FE sends 50; server clamps
}

export interface ListDecisionAuditResponse {
  entries: AuditEntry[];
  total: number;                        // unfiltered? filtered? — FE assumes **filtered total**
  page: number;
  pageSize: number;
}

export interface GetDecisionAuditRequest { auditId: string; }
```

**Denormalisation rationale.** `applicantName` / `applicantEmail` / `jobTitle` /
`reviewerEmail` are stored **at write time** on the audit entry so the list read is a
single-collection query (no joins, no per-row fetch). If a candidate is renamed or a job
title is edited later, the audit entry preserves the value AT THE TIME OF DECISION — that's
the correct behavior for an audit trail.

**FE mock client shape** (`apps/company/app/audit/audit-client.ts`):

```ts
export interface AuditClient {
  listDecisionAudit(req: ListDecisionAuditRequest): Promise<ListDecisionAuditResponse>;
  getDecisionAudit(req: { auditId: string }): Promise<AuditEntryFull>;

  listQueryKey(filters: AuditListFilters, page: number): readonly unknown[];
  entryQueryKey(id: string): readonly unknown[];
}
```

**Truthful mock defaults** (the FE today):

- `listDecisionAudit` → 3–5 "Sample" rows with generic candidate names ("Candidate A",
  "Candidate B", "Sample candidate") and a `reviewer@example.com` reviewer. `auditId` is
  `sample_<n>` so it's obvious in dev.
- `getDecisionAudit` → the matching sample row with a sample evidence snapshot ("overallScore:
  0.86, integrityScore: 0.98, flagCount: 2, recommendation: 'advance'") and `reviewerCtx:
  { ip: "", userAgent: "" }`.

The mock NEVER fabricates a real-looking audit trail.

## Data required (PROPOSED · DERIVED OR NEW)

**Confirm with the backend session.** The v2 decision contract (per
[`../job-pipeline/backend_job-pipeline.md`](../job-pipeline/backend_job-pipeline.md) and
[`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md))
audits every `decideApplication` / `overrideGate` call via the shared `AuditLogRepository`
(the same pattern team-permissions mutations use). The likely shape today:

- **Collection** (existing or near-existing): `decision_audit` (per-comp; indexed
  `(comp_id, timestamp desc)`, `(comp_id, applicant_id, timestamp desc)`,
  `(comp_id, reviewer_user_id, timestamp desc)`, `(comp_id, job_id, timestamp desc)`).
- **Fields:** every field on `AuditEntry` + the evidence snapshot + reviewer forensics, with
  the timestamp denormalised at write time.
- **Write path** (existing): `decideApplication` / `overrideGate` call into a shared audit
  writer (`AuditLogRepository.write_decision_audit(...)`) that captures the snapshot at the
  moment of the decision (overall + integrity scores, flag count, recommendation, reviewer
  context from the request). **If this writer doesn't yet capture the evidence snapshot, it
  must be extended** — the snapshot is the most useful field for a security-conscious buyer.

If the collection / writer doesn't yet exist in the shape above, the backend session adds
them; the indexes follow the FE's filter shape (filter cardinality: reviewer + job +
applicant +
timestamp range are the hot paths). **Out of scope for the FE plan** — the FE codes against
the typed mock seam regardless.

## Errors & edge cases (PROPOSED · TBD)

| Surface | Behavior |
|---|---|
| `UNAUTHENTICATED` | missing/invalid bearer; redirected by `CompanyShell` |
| `PERMISSION_DENIED` | non-admin caller (`audit:view` scope absent); redirected by `CompanyShell`; in-page `<AdminGate />` is the bypass fallback |
| `NOT_FOUND` | `GetDecisionAudit` on an `auditId` that doesn't exist or belongs to another comp (cross-tenant `audit_id` → `NOT_FOUND`; never leak) |
| `UNAVAILABLE` | DB / search index down → inline `.pill-warn` "Couldn't load audit data" + retry; the rest of the page stays mounted |
| `RESOURCE_EXHAUSTED` | rate-limited read → inline `.pill-warn` "Try again in a moment" |
| Empty filtered result | "No decisions match these filters." centered `.cell`; the count line shows "0 decisions match" |
| Empty unfiltered result (brand-new comp) | single row "No decisions logged yet. Once your team makes their first decision, it will appear here." (truthful — the natural state for a brand-new company) |
| Missing evidence snapshot on an old entry | drawer's evidence card renders "Evidence snapshot not available for this entry." (truthful, not "loading…") |
| Missing reviewer forensics (IP/UA) | drawer's forensics line shows "—" instead of inventing one |

## Cross-references

- Per-applicant view (NOT this screen): [`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md)
  documents the per-applicant decision timeline that lives on the applicant detail page. The
  same underlying audit collection feeds both surfaces — they render different slices.
- Decision write paths (the audit sources): the v2 decision contract documents
  `decideApplication` and `overrideGate` writing into the audit collection via
  `AuditLogRepository`. See the job-pipeline plan
  ([`../job-pipeline/backend_job-pipeline.md`](../job-pipeline/backend_job-pipeline.md)) for
  the kanban actions that fire these calls, and the applicant-report plan
  ([`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md))
  for the per-applicant decision controls.
- Filter sources (existing — no new RPC for these):
  - Reviewer dropdown ← `TeamService.ListMembers` (see [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md)).
  - Job dropdown ← `Job.ListJobs` (see [`../jobs-list/backend_jobs-list.md`](../jobs-list/backend_jobs-list.md)).
- Sibling admin-only screens (same `useRequireRole(["company_admin"])` gate):
  [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md),
  [`../company-billing/backend_company-billing.md`](../company-billing/backend_company-billing.md).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Pillar: **trust-architecture** — the landing's truthful "every decision is logged with the
  reviewer's name and reason" claim is backed by this read surface. This is the page the
  founder shows to a security-conscious buyer who asks "how do we audit AI-influenced
  decisions?".

## Open questions for the backend session

1. **Does the audit collection already exist?** Per the v2 decision contract,
   `decideApplication` / `overrideGate` audit every call via `AuditLogRepository`. Confirm:
   - (a) Is there a `decision_audit` collection already written on every call?
   - (b) If yes, what is the field shape today (vs the proposed `AuditEntry`)?
   - (c) Are the indexes above already in place?
2. **Does the audit writer capture the evidence snapshot?** The most useful field for the
   drawer is `evidenceSnapshot` (overall + integrity + flag count + recommendation **at the
   moment of decision**). If the writer doesn't capture this today, it must be extended —
   reading the live report at audit-display time would mis-represent what the reviewer
   actually saw.
3. **What reviewer forensics are stored?** IP and User-Agent give a buyer real confidence;
   confirm these are captured server-side at the time of the decision RPC.
4. **Read RPC vs derived REST?** Is a new `admin.audit.v1.AuditService` the right surface, or
   should this be a thin REST endpoint over the existing audit collection? Either works
   for the FE (it codes against a typed client either way).
5. **Filter cardinality:** the FE assumes the filter set above (decision type / outcome /
   reviewer / job / applicant text / date range). Are there filter fields the backend
   strongly prefers (e.g., `applicantStatus` at the time of decision)?
6. **`total` semantics in pagination:** confirm `total` is the **filtered total** (so the
   FE can render "12 decisions match" correctly), not the unfiltered comp total.
7. **Retention:** how long are audit entries kept? (FE shows the
   `usage.auditLogRetentionDays` on the billing page; default assumed 365 days. If retention
   is unbounded, the billing UsageStats row should say "Forever" — confirm.)
