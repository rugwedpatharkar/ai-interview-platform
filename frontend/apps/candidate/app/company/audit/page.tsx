"use client";

import {
  Alert,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";
import {
  type AuditClient,
  type DecisionAuditRowDTO,
  type DecisionKind,
  type ListDecisionAuditParams,
  makeMockAuditClient,
} from "./audit-client";

const DECISIONS: { id: DecisionKind | ""; label: string }[] = [
  { id: "", label: "Any decision" },
  { id: "shortlist", label: "Shortlist" },
  { id: "advance", label: "Advance" },
  { id: "hold", label: "Hold" },
  { id: "reject", label: "Reject" },
  { id: "hire", label: "Hire" },
];

const DECISION_PILL: Record<DecisionKind, string> = {
  shortlist: "ap-pill--teal",
  advance: "ap-pill--teal",
  hold: "ap-pill--warn",
  reject: "ap-pill--danger",
  hire: "ap-pill--good",
};

// Decision audit log — admin-only. Every shortlist / reject / hire is appended with the
// reviewer, the snapshot evidence at decision time, and a reason. This is the *only* mutable
// log we permit on hiring; it satisfies the "humans decide, on the record" promise.
export default function AuditPage() {
  const { token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["company_admin"], ready);

  const [client] = useState<AuditClient>(() => makeMockAuditClient());
  const [params, setParams] = useState<ListDecisionAuditParams>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useAuthedQuery(token, {
    queryKey: ["audit", "list", params],
    queryFn: () => client.listDecisionAudit(params),
  });

  if (identity?.role && identity.role !== "company_admin") {
    return (
      <CompanyShell>
        <header className="mb-8">
          <h1 className="ap-h2">Audit log</h1>
        </header>
        <Alert tone="info" title="Admins only">
          Only company admins can view the decision audit log.
        </Alert>
      </CompanyShell>
    );
  }

  const rows = list.data?.rows ?? [];
  const hasFilters =
    Boolean(params.decision) ||
    Boolean(params.reviewerUserId) ||
    Boolean(params.jobId) ||
    Boolean(params.applicationId) ||
    Boolean(params.from) ||
    Boolean(params.to);

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3">
        <p className="ap-eyebrow">Audit</p>
        <h1 className="ap-h2">Every decision, on the record.</h1>
        <p className="ap-lead text-base">
          Each shortlist, reject, and hire is captured with the evidence the reviewer saw at
          the time. Snapshots are immutable — what you see is what they decided on.
        </p>
      </header>

      {/* Filter chip row */}
      <div className="ap-cell mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Decision" htmlFor="f-decision">
            <Select
              value={params.decision ?? ""}
              onValueChange={(v) =>
                setParams((p) => ({
                  ...p,
                  decision: v ? (v as DecisionKind) : undefined,
                }))
              }
            >
              <SelectTrigger id="f-decision" className="w-44">
                <SelectValue placeholder="Any decision" />
              </SelectTrigger>
              <SelectContent>
                {DECISIONS.map((d) => (
                  <SelectItem key={d.id || "any"} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reviewer (user id)" htmlFor="f-reviewer">
            <Input
              id="f-reviewer"
              value={params.reviewerUserId ?? ""}
              placeholder="u_…"
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  reviewerUserId: e.target.value || undefined,
                }))
              }
            />
          </Field>
          <Field label="Job (id)" htmlFor="f-job">
            <Input
              id="f-job"
              value={params.jobId ?? ""}
              placeholder="job_…"
              onChange={(e) =>
                setParams((p) => ({ ...p, jobId: e.target.value || undefined }))
              }
            />
          </Field>
          <Field label="Applicant (id)" htmlFor="f-app">
            <Input
              id="f-app"
              value={params.applicationId ?? ""}
              placeholder="app_…"
              onChange={(e) =>
                setParams((p) => ({
                  ...p,
                  applicationId: e.target.value || undefined,
                }))
              }
            />
          </Field>
          <Field label="From" htmlFor="f-from">
            <Input
              id="f-from"
              type="date"
              value={params.from?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setParams((p) => ({ ...p, from: e.target.value || undefined }))
              }
            />
          </Field>
          <Field label="To" htmlFor="f-to">
            <Input
              id="f-to"
              type="date"
              value={params.to?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setParams((p) => ({ ...p, to: e.target.value || undefined }))
              }
            />
          </Field>
          {hasFilters && (
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-sm"
              onClick={() => setParams({})}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="ap-cell !p-0 overflow-hidden">
        {list.isLoading && (
          <div className="p-6">
            <LoadingState />
          </div>
        )}
        {list.isError && (
          <div className="p-6">
            <ErrorState
              message={errorMessage(list.error)}
              retry={() => list.refetch()}
            />
          </div>
        )}
        {!list.isLoading && !list.isError && rows.length === 0 && (
          <div className="p-2">
            <EmptyState
              icon={History}
              title={
                hasFilters
                  ? "No matches"
                  : "No decision audit entries yet"
              }
              description={
                hasFilters
                  ? "Try widening or clearing the filters."
                  : "This will populate as your team makes hiring decisions."
              }
            />
          </div>
        )}

        {rows.length > 0 && <AuditTable rows={rows} onOpen={setOpenId} />}
      </div>

      {openId && (
        <AuditDetail
          auditId={openId}
          client={client}
          onClose={() => setOpenId(null)}
        />
      )}
    </CompanyShell>
  );
}

function AuditTable({
  rows,
  onOpen,
}: {
  rows: DecisionAuditRowDTO[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="table-wrap overflow-x-auto">
      <table className="data w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Applicant</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Reviewer</th>
            <th className="px-4 py-3">Reason</th>
            <th className="px-4 py-3">Audit id</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.auditId}
              className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-surface-2"
              onClick={() => onOpen(r.auditId)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(r.auditId);
                }
              }}
            >
              <td className="px-4 py-3 whitespace-nowrap text-ink-2">
                {new Date(r.decidedAt).toLocaleString()}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-ink-2">
                {r.candidateUserId.slice(0, 12)}…
              </td>
              <td className="px-4 py-3 text-foreground">
                <span className="truncate">{r.jobTitle}</span>
              </td>
              <td className="px-4 py-3">
                <span className={cn("ap-pill capitalize", DECISION_PILL[r.decision])}>
                  {r.decision}
                </span>
              </td>
              <td className="px-4 py-3 text-ink-2">
                <span className="truncate">{r.reviewerEmail}</span>
              </td>
              <td className="px-4 py-3 text-ink-2">
                <span className="line-clamp-1 max-w-[28ch]">{r.reasonSnippet}</span>
              </td>
              <td className="px-4 py-3 font-mono text-[0.72rem] text-ink-3">
                {r.auditId.slice(0, 10)}…
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditDetail({
  auditId,
  client,
  onClose,
}: {
  auditId: string;
  client: AuditClient;
  onClose: () => void;
}) {
  const detail = useQuery({
    queryKey: ["audit", "detail", auditId],
    queryFn: () => client.getDecisionAudit(auditId),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full w-full max-w-lg translate-x-0 translate-y-0 rounded-none rounded-l-2xl border-l border-line p-7 data-[state=open]:animate-slide-up data-[state=closed]:animate-fade-out">
        <DialogTitle>Decision detail</DialogTitle>
        <DialogDescription>
          Snapshot of the evidence the reviewer saw at the moment they decided.
        </DialogDescription>

        {detail.isLoading && (
          <div className="mt-6">
            <LoadingState />
          </div>
        )}
        {detail.isError && (
          <div className="mt-6">
            <ErrorState
              message={errorMessage(detail.error)}
              retry={() => detail.refetch()}
            />
          </div>
        )}
        {detail.data && (
          <div className="mt-6 flex flex-col gap-4 text-sm">
            <dl className="grid grid-cols-2 gap-3">
              <Cell label="Audit id" value={detail.data.auditId} mono />
              <Cell
                label="Decided at"
                value={new Date(detail.data.decidedAt).toLocaleString()}
              />
              <Cell label="Reviewer" value={detail.data.reviewerEmail} />
              <Cell label="Decision" value={detail.data.decision} />
              <Cell label="Role" value={detail.data.jobTitle} />
              <Cell
                label="Applicant"
                value={`${detail.data.candidateUserId.slice(0, 12)}…`}
                mono
              />
            </dl>

            <section>
              <p className="text-xs font-mono uppercase tracking-wide text-ink-3">
                Reviewer note
              </p>
              <p className="mt-1 whitespace-pre-wrap rounded-lg border border-line bg-surface-2 p-3 text-ink-2">
                {detail.data.reasonFull || "—"}
              </p>
            </section>

            <section>
              <p className="text-xs font-mono uppercase tracking-wide text-ink-3">
                Evidence snapshot
              </p>
              <pre className="mt-1 max-h-[260px] overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[0.72rem] text-ink-2">
                {JSON.stringify(detail.data.evidenceSnapshot, null, 2)}
              </pre>
            </section>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Cell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-mono uppercase tracking-wide text-ink-3">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-foreground",
          mono && "font-mono text-xs text-ink-2",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
