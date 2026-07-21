"use client";

import { ConfirmDialog, ErrorState, LoadingState, Spinner, toast } from "@ip/ui";
import {
  errorMessage,
  isNotFound,
  isTransient,
  pollingBackoff,
  track,
  useAuthedQuery,
  useRequireRole,
} from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../../../../../components/company-shell";
import { useAuth } from "../../../../../../lib/auth";
import {
  USE_MOCK as MESSAGES_USE_MOCK,
  createMessagesClient,
  listQueryKey as messagesListQueryKey,
  makeMockMessagesClient,
} from "../../../../../messages/messages-client";
import { USE_MOCK, makeMockIntegrityClient } from "./integrity-client";
import type {
  Competency,
  IntegrityTimeline,
  ProctorFlag,
  ReportDTO,
} from "./types";
import { FlagSeverity, signalLabel } from "./types";

/* ============================================================
   APTURA · v3 — Applicant report (`/company/jobs/[id]/applicants/[appId]`)
   THE killer surface. Tabs [Report · Schedule · Messages].
   Verdict + .ap-ring score + competency cards (transcript quotes) +
   INTEGRITY BAND (.ap-itl) + decision controls.
   PRESERVES Report.GetReport polling (3s during scoring window /
   NOT_FOUND) and the GetIntegrityTimeline pattern (cast seam).
   Behavioural/AV proctoring only — identity matching out of scope.
   ============================================================ */

const mockIntegrity = makeMockIntegrityClient();
type Tab = "report" | "schedule" | "messages";

// Poll while the report is still being scored (NOT_FOUND) or a transient error occurs.
// Uses dataUpdateCount for the success path and errorUpdateCount for the NOT_FOUND path,
// so the cap (60 polls / ~5 min) applies regardless of which state the query is in.
const reportBackoff = pollingBackoff({
  initialMs: 3_000,
  capMs: 10_000,
  maxPolls: 60,
  jitterRatio: 0.1,
});

// Translate the wire report (whose static type doesn't yet carry competencies /
// integrity scalars) into the FE DTO. Uses explicit type guards per field so a
// shape mismatch surfaces as a visible zero/empty rather than a silent cast lie.
function toReportDTO(r: Record<string, unknown>): ReportDTO {
  return {
    applicationId: typeof r.applicationId === "string" ? r.applicationId : "",
    state: typeof r.state === "string" ? r.state : "",
    executiveSummary: typeof r.executiveSummary === "string" ? r.executiveSummary : "",
    highlights: Array.isArray(r.highlights) ? (r.highlights as string[]) : [],
    risks: Array.isArray(r.risks) ? (r.risks as string[]) : [],
    overallScore: typeof r.overallScore === "number" ? r.overallScore : 0,
    recommendation: typeof r.recommendation === "string" ? r.recommendation : "",
    competencies: Array.isArray(r.competencies) ? (r.competencies as Competency[]) : [],
    integrityScore: typeof r.integrityScore === "number" ? r.integrityScore : 0,
    integrityFlagCount: typeof r.integrityFlagCount === "number" ? r.integrityFlagCount : 0,
    autoTerminated: typeof r.autoTerminated === "boolean" ? r.autoTerminated : false,
  };
}

function recommendationPill(rec: string): string {
  if (rec === "advance") return "ap-pill ap-pill--good";
  if (rec === "hold") return "ap-pill ap-pill--warn";
  if (rec === "reject") return "ap-pill ap-pill--danger";
  return "ap-pill";
}

function sevClass(sev: FlagSeverity): string {
  if (sev === FlagSeverity.HIGH || sev === FlagSeverity.CRITICAL) return "ap-itl-pip ap-itl-pip--h";
  if (sev === FlagSeverity.MED) return "ap-itl-pip ap-itl-pip--m";
  return "ap-itl-pip ap-itl-pip--l";
}

function sevTone(sev: FlagSeverity): string {
  if (sev === FlagSeverity.HIGH || sev === FlagSeverity.CRITICAL) return "var(--danger)";
  if (sev === FlagSeverity.MED) return "var(--warn)";
  return "var(--good)";
}

function sevLabel(sev: FlagSeverity): string {
  if (sev === FlagSeverity.CRITICAL) return "CRITICAL";
  if (sev === FlagSeverity.HIGH) return "HIGH";
  if (sev === FlagSeverity.MED) return "MED";
  if (sev === FlagSeverity.LOW) return "LOW";
  return "UNSPECIFIED";
}

function pipPosition(flagAt: string, flags: ProctorFlag[]): string {
  // Normalize each pip to 5%..95% of the track length, ordered by event time.
  if (flags.length <= 1) return "50%";
  const sorted = [...flags].sort((a, b) => a.at.localeCompare(b.at));
  const first = new Date(sorted[0]!.at).getTime();
  const last = new Date(sorted[sorted.length - 1]!.at).getTime();
  const span = Math.max(last - first, 1);
  const t = new Date(flagAt).getTime();
  const pct = 5 + ((t - first) / span) * 90;
  return `${pct.toFixed(1)}%`;
}

export default function ApplicantReportPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const qc = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [tab, setTab] = useState<Tab>("report");

  // Poll while the report is still being scored (NOT_FOUND) or a transient error
  // occurs. Caps at 60 polls (~5 min) so a permanently-missing report doesn't
  // poll forever. For the error path (NOT_FOUND) we use errorUpdateCount as the
  // poll counter since dataUpdateCount never increments until the query succeeds.
  const report = useAuthedQuery(token, {
    queryKey: ["report", appId],
    retry: false,
    queryFn: () => api.reports.getReport({ applicationId: appId }),
    enabled: Boolean(token && appId),
    refetchInterval: (q) => {
      if (q.state.status === "success") return false;
      const err = q.state.error;
      if (!isNotFound(err) && !isTransient(err)) return false;
      // Proxy the relevant counter into the shape reportBackoff expects.
      const n = Math.max(q.state.dataUpdateCount, q.state.errorUpdateCount);
      return reportBackoff({ state: { dataUpdateCount: n, status: q.state.status } });
    },
  });

  // Integrity timeline — sibling, non-blocking. Wire ProctorFlag.severity is
  // typed as `string` by protobuf-es; we project it to the local Severity union.
  const integrity = useAuthedQuery(token, {
    queryKey: ["integrity", appId],
    retry: 1,
    queryFn: async (): Promise<IntegrityTimeline> => {
      if (USE_MOCK) return mockIntegrity(appId);
      const w = await api.reports.getIntegrityTimeline({ applicationId: appId });
      return {
        integrityScore: w.integrityScore,
        flags: w.flags.map((f) => ({
          type: f.type,
          severity: f.severity,
          at: f.at,
          meta: f.meta,
        })),
        recordingUrl: w.recordingUrl,
        autoTerminated: w.autoTerminated,
        terminatedReason: w.terminatedReason,
      };
    },
    enabled: Boolean(token && appId),
  });

  const notReady = report.isError && isNotFound(report.error);
  // Poll cap exhausted while the report still hasn't landed — offer a manual refresh.
  const isCapped = report.errorUpdateCount >= 60 && notReady;

  // Unread badge — one cheap source the threads query already polls. Resilient on
  // failure: the badge simply doesn't render.
  const messagesClient = useMemo(
    () =>
      MESSAGES_USE_MOCK
        ? makeMockMessagesClient(appId, "recruiter")
        : createMessagesClient(api),
    [api, appId],
  );
  const threads = useQuery({
    queryKey: messagesListQueryKey(),
    queryFn: () => messagesClient.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });
  const unread = threads.data?.find((t) => t.applicationId === appId)?.unread ?? 0;

  const dto = report.data ? toReportDTO(report.data as Record<string, unknown>) : null;

  // Fire once when the report first renders successfully.
  useEffect(() => {
    if (dto) track("report.viewed", { application_id: appId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!dto, appId]);

  const decide = useMutation({
    mutationFn: async (input: {
      action: "advance" | "hold" | "reject";
      reasonCode?: string;
      freeText?: string;
    }) => {
      if (input.action === "advance") {
        await api.decisions.overrideGate({ applicationId: appId });
        return input.action;
      }
      if (input.action === "hold") {
        await api.decisions.holdApplication({
          applicationId: appId,
          reasonCode: input.reasonCode ?? "other",
          freeText: input.freeText ?? "",
        });
        return input.action;
      }
      await api.decisions.rejectApplication({
        applicationId: appId,
        reasonCode: input.reasonCode ?? "other",
        freeText: input.freeText ?? "",
      });
      return input.action;
    },
    onSuccess: (action) => {
      track("decision.made", { application_id: appId, decision: action });
      if (action === "advance") toast.success("Candidate advanced");
      if (action === "hold") toast.success("Candidate placed on hold");
      if (action === "reject") toast.success("Candidate declined");
      qc.invalidateQueries({ queryKey: ["applicants", id] });
      qc.invalidateQueries({ queryKey: ["report", appId] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  return (
    <CompanyShell>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/company/jobs/${id}`}
          className="ap-btn ap-btn-ghost ap-btn-sm inline-flex"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to pipeline
        </Link>
      </div>

      {/* Tab bar */}
      <div className="tabs flex flex-wrap gap-1 border-b border-line">
        <TabButton active={tab === "report"} onClick={() => setTab("report")}>
          Report
        </TabButton>
        <TabButton active={tab === "schedule"} onClick={() => setTab("schedule")}>
          Schedule
        </TabButton>
        <TabButton active={tab === "messages"} onClick={() => setTab("messages")}>
          <span className="inline-flex items-center gap-2">
            Messages
            {unread > 0 && (
              <span className="ap-pill ap-pill--teal">{unread > 9 ? "9+" : unread}</span>
            )}
          </span>
        </TabButton>
      </div>

      {/* REPORT TAB */}
      {tab === "report" && (
        <div className="mt-6 grid gap-5">
          {report.isLoading && <LoadingState />}

          {notReady && !isCapped && (
            <div className="ap-cell flex items-center gap-3">
              <Spinner />
              <p className="text-sm text-ink-2">
                The report is being generated — this updates automatically as soon as
                scoring finishes.
              </p>
            </div>
          )}

          {isCapped && (
            <div className="ap-cell flex flex-col gap-3">
              <p className="text-sm text-ink-2">
                Still scoring — this is taking longer than usual.
              </p>
              <button
                type="button"
                className="ap-btn ap-btn-ghost ap-btn-sm self-start"
                onClick={() => report.refetch()}
              >
                Check again
              </button>
            </div>
          )}

          {report.isError && !notReady && (
            <ErrorState
              message={errorMessage(report.error)}
              retry={() => report.refetch()}
            />
          )}

          {dto?.autoTerminated && (
            <div className="ap-cell flex items-center gap-3 border-danger bg-[color-mix(in_oklch,var(--danger)_6%,var(--surface))]">
              <AlertTriangle className="size-5 text-danger" aria-hidden />
              <div>
                <span className="ap-pill ap-pill--danger">Auto-terminated</span>
                <p className="mt-1 text-sm text-ink-2">
                  A high-severity integrity signal ended this interview server-side.
                </p>
              </div>
            </div>
          )}

          {dto && (
            <>
              {/* VERDICT HEADER */}
              <section className="ap-cell ap-cell--anchor">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="ap-cell-tag">Interview report</span>
                    <h2 className="ap-h3 mb-1">Verdict</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={recommendationPill(dto.recommendation)}>
                        {dto.recommendation
                          ? `Recommended · ${capitalize(dto.recommendation)}`
                          : "Pending"}
                      </span>
                      <span className="ap-pill">{dto.state}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <ScoreRing pct={Math.round(dto.overallScore * 100)} />
                    <div>
                      <div
                        className="font-display text-3xl font-semibold tabular-nums text-ink-deep"
                      >
                        {Math.round(dto.overallScore * 100)}
                        <span className="text-base text-ink-3">/100</span>
                      </div>
                      <div className="text-xs text-ink-3">Overall score</div>
                    </div>
                  </div>
                </div>

                {dto.executiveSummary && (
                  <p className="mt-5 max-w-prose text-[0.96rem] leading-relaxed text-ink">
                    {dto.executiveSummary}
                  </p>
                )}

                <p className="mt-5 inline-flex items-center gap-2 text-xs text-ink-3">
                  <ShieldCheck className="size-3.5 text-teal" aria-hidden />
                  Behavioural &amp; AV proctoring only — Aptura does not perform identity
                  matching against external databases.
                </p>
              </section>

              {/* HIGHLIGHTS + RISKS */}
              {(dto.highlights.length > 0 || dto.risks.length > 0) && (
                <div className="grid gap-5 sm:grid-cols-2">
                  {dto.highlights.length > 0 && (
                    <div className="ap-cell">
                      <h3 className="ap-h4 mb-3">Highlights</h3>
                      <ul className="grid gap-2 text-sm text-ink-2">
                        {dto.highlights.map((h) => (
                          <li key={h} className="flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-good" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {dto.risks.length > 0 && (
                    <div className="ap-cell">
                      <h3 className="ap-h4 mb-3">Risks</h3>
                      <ul className="grid gap-2 text-sm text-ink-2">
                        {dto.risks.map((r) => (
                          <li key={r} className="flex gap-2">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-warn" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* COMPETENCIES — quoted-transcript pattern from the marketing landing */}
              {dto.competencies.length > 0 && (
                <section className="ap-cell">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="ap-h4">Competency breakdown</h3>
                    <span className="ap-pill">
                      {dto.competencies.length} dimension
                      {dto.competencies.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-4">
                    {dto.competencies.map((c, i) => (
                      <CompetencyCard key={`${i}-${c.competency}`} c={c} />
                    ))}
                  </div>
                </section>
              )}

              {/* INTEGRITY BAND — 1:1 with the landing IntegrityTimeline primitives */}
              <IntegrityBandSection
                timeline={integrity.data}
                loading={integrity.isLoading}
                error={integrity.isError ? errorMessage(integrity.error) : null}
              />

              {/* DECISION CONTROLS — bottom of the report */}
              <section className="ap-cell">
                <h3 className="ap-h4 mb-3">Decision</h3>
                <p className="text-sm text-ink-2">
                  Aptura recommends — you sign. Every decision is logged with your name.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ConfirmDialog
                    trigger={
                      <button type="button" className="ap-btn ap-btn-primary">
                        Advance
                      </button>
                    }
                    title="Advance this candidate?"
                    description="The candidate proceeds to the next stage and is notified."
                    confirmLabel="Advance"
                    busy={decide.isPending}
                    onConfirm={() => decide.mutate({ action: "advance" })}
                  />
                  <ConfirmDialog
                    trigger={
                      <button type="button" className="ap-btn ap-btn-ghost">
                        Hold
                      </button>
                    }
                    title="Hold this candidate?"
                    description="They stay in the pipeline; no decision is sent yet."
                    confirmLabel="Hold"
                    busy={decide.isPending}
                    onConfirm={() => decide.mutate({ action: "hold" })}
                  />
                  <ConfirmDialog
                    trigger={
                      <button type="button" className="ap-btn ap-btn-ghost">
                        Decline
                      </button>
                    }
                    title="Decline this candidate?"
                    description="Records the decline for your team. The candidate will not be notified automatically."
                    confirmLabel="Decline"
                    destructive
                    busy={decide.isPending}
                    onConfirm={() => decide.mutate({ action: "reject" })}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      )}

      {/* SCHEDULE TAB — link to the dedicated screen for a fuller scheduling UX */}
      {tab === "schedule" && (
        <div className="mt-6">
          <div className="ap-cell ap-cell--anchor">
            <h2 className="ap-h3 mb-1">Schedule the interview</h2>
            <p className="text-sm text-ink-2">
              Propose 1–3 time slots; the candidate picks one. The scheduling surface
              opens in its own page so you can see all candidate context side-by-side.
            </p>
            <Link
              href={`/company/jobs/${id}/applicants/${appId}/schedule`}
              className="ap-btn ap-btn-primary ap-btn-sm mt-4 inline-flex"
            >
              Open scheduling
            </Link>
          </div>
        </div>
      )}

      {/* MESSAGES TAB — placeholder; the dedicated /messages route owns the thread UI */}
      {tab === "messages" && (
        <div className="mt-6">
          <div className="ap-cell">
            <h2 className="ap-h4 mb-2">Conversation</h2>
            <p className="text-sm text-ink-2">
              {unread > 0
                ? `${unread} unread message${unread === 1 ? "" : "s"}.`
                : "No unread messages."}{" "}
              The full thread view lives at{" "}
              <Link
                href={`/messages/${appId}`}
                className="text-teal-strong underline-offset-2 hover:underline"
              >
                /messages/{appId.slice(0, 8)}…
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </CompanyShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "border-b-2 border-teal px-4 py-2 text-sm font-semibold text-ink-deep"
          : "border-b-2 border-transparent px-4 py-2 text-sm text-ink-2 hover:text-ink-deep"
      }
    >
      {children}
    </button>
  );
}

function ScoreRing({ pct }: { pct: number }) {
  return (
    <div
      className="ap-ring"
      style={{ ["--pct" as never]: pct }}
      aria-label={`Overall score ${pct}%`}
    >
      <div className="ap-ring-v">{pct}</div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function CompetencyCard({ c }: { c: Competency }) {
  const pct = Math.round(c.score * 100);
  const ev = c.evidence[0];
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-ink-deep">{c.competency}</span>
        <span className="ml-auto font-mono font-semibold text-teal-strong tabular-nums">
          {(c.score * 5).toFixed(1)} / 5
        </span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-surface-3">
        <i className="block h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
      </div>
      {c.rationale && (
        <p className="mt-3 text-[0.86rem] text-ink-2">{c.rationale}</p>
      )}
      {ev && (
        <blockquote className="mt-3 rounded-r-lg border-l-[3px] border-teal bg-surface px-3 py-2.5 text-[0.88rem] leading-relaxed text-ink">
          <span
            className="text-[1.4em] leading-none text-teal"
            style={{ fontFamily: "var(--font-display)" }}
            aria-hidden
          >
            “
          </span>
          {ev.quote}
          <span
            className="text-[1.4em] leading-none text-teal"
            style={{ fontFamily: "var(--font-display)" }}
            aria-hidden
          >
            ”
          </span>
        </blockquote>
      )}
      {ev?.note && (
        <span className="mt-1.5 block font-mono text-[0.72rem] text-ink-3">
          {ev.note}
        </span>
      )}
    </div>
  );
}

function IntegrityBandSection({
  timeline,
  loading,
  error,
}: {
  timeline: IntegrityTimeline | undefined;
  loading: boolean;
  error: string | null;
}) {
  if (!timeline && !loading && !error) return null;
  const flags = timeline?.flags ?? [];
  const sorted = [...flags].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="ap-itl">
      <div className="ap-itl-head">
        <h3 className="ap-h3 text-[1.3rem]">Integrity timeline</h3>
        {timeline && (
          <span className="text-[0.86rem] text-ink-3">
            {flags.length === 0
              ? "Clean session"
              : `${flags.length} flag${flags.length === 1 ? "" : "s"} surfaced`}
          </span>
        )}
        <div className="ml-auto flex gap-3 text-[0.78rem] text-ink-2">
          <LegendDot color="var(--good)" label="Low" />
          <LegendDot color="var(--warn)" label="Medium" />
          <LegendDot color="var(--danger)" label="High · auto-end" />
        </div>
      </div>

      {loading && (
        <div className="mt-5 flex items-center gap-2 text-sm text-ink-3">
          <Spinner /> Loading integrity timeline…
        </div>
      )}
      {error && (
        <div className="mt-5 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground">
          Integrity data unavailable: {error}
        </div>
      )}

      {timeline && (
        <>
          <div className="mt-5">
            <div
              className="ap-itl-track"
              role="img"
              aria-label="Interview integrity timeline"
            >
              <div className="ap-itl-line" />
              {sorted.map((f, i) => (
                <span
                  key={`${i}-${f.at}-${f.type}`}
                  className={sevClass(f.severity)}
                  style={{ left: pipPosition(f.at, sorted) }}
                  title={`${signalLabel(f.type)} · ${sevLabel(f.severity)}`}
                />
              ))}
              <div className="ap-itl-axis">
                <span>start</span>
                <span>end</span>
              </div>
            </div>
          </div>

          {flags.length > 0 && (
            <div className="ap-itl-events">
              {sorted.slice(0, 3).map((f, i) => (
                <article
                  key={`${i}-${f.at}-${f.type}`}
                  className="rounded-2xl border border-line bg-surface-2 p-4"
                >
                  <div className="flex items-center gap-2 font-mono text-[0.78rem] text-ink-3">
                    <span
                      className="size-[7px] rounded-full"
                      style={{ background: sevTone(f.severity) }}
                    />
                    <span>
                      {new Date(f.at).toLocaleTimeString()} · {sevLabel(f.severity)}
                    </span>
                  </div>
                  <div
                    className="mt-1.5 text-[1rem] font-semibold text-ink-deep"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {signalLabel(f.type)}
                  </div>
                </article>
              ))}
            </div>
          )}

          {timeline.recordingUrl && (
            <div className="mt-5">
              <p className="mb-1.5 text-sm font-semibold text-ink-deep">
                Session recording
              </p>
              <video
                src={timeline.recordingUrl}
                controls
                className="w-full rounded-xl border border-line"
                aria-label="Proctored interview session recording"
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
