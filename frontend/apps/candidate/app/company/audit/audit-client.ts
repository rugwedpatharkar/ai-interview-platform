// Backend contract TBD — backend session owns final shape. These DTOs are the FE's working
// proposal for a decision-audit feed: each row is one human decision (shortlist / reject /
// hire) with the evidence snapshot that existed *at the moment the reviewer decided*.
//
// Why snapshot evidence: it's the only useful audit. Re-fetching live evidence on read would
// drift from what the reviewer actually saw. Snapshot once, store once, surface immutably.

export type DecisionKind =
  | "shortlist"
  | "reject"
  | "hire"
  | "advance"
  | "hold";

export interface DecisionAuditRowDTO {
  auditId: string; // ULID; mono-rendered in the table
  decidedAt: string; // ISO
  applicationId: string;
  jobId: string;
  jobTitle: string;
  candidateUserId: string; // masked handle (slice(0,12)… on render — same privacy rule as Talent)
  reviewerUserId: string;
  reviewerEmail: string; // visible to admins on their own tenant only
  decision: DecisionKind;
  reasonSnippet: string; // first ~120 chars of the reviewer's note
}

export interface DecisionAuditDetailDTO extends DecisionAuditRowDTO {
  reasonFull: string;
  // Evidence snapshot as it existed at decision time. Shape mirrors the report consumer DTO
  // (competency evidence + integrity snapshot) — keep it loose here; backend session pins it.
  evidenceSnapshot: Record<string, unknown>;
}

export interface ListDecisionAuditParams {
  decision?: DecisionKind;
  reviewerUserId?: string;
  jobId?: string;
  applicationId?: string;
  // ISO timestamps; both optional, server normalises.
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ListDecisionAuditResult {
  rows: DecisionAuditRowDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditClient {
  listDecisionAudit(p: ListDecisionAuditParams): Promise<ListDecisionAuditResult>;
  getDecisionAudit(auditId: string): Promise<DecisionAuditDetailDTO>;
}

// Pre-launch truth: no decisions made yet. Returns an empty list and a permanent 404 for
// detail — the page renders the empty state and never opens the drawer.
export function makeMockAuditClient(): AuditClient {
  return {
    async listDecisionAudit() {
      return { rows: [], total: 0, page: 1, pageSize: 25 };
    },
    async getDecisionAudit(auditId: string) {
      throw new Error(`Audit entry ${auditId} not found`);
    },
  };
}
