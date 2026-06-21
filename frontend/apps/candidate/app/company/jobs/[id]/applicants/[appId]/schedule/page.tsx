"use client";

import {
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@ip/ui";
import {
  Code,
  errorMessage,
  isCode,
  isNotFound,
  useAuthedQuery,
  useRequireRole,
} from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CompanyShell } from "../../../../../../../components/company-shell";
import {
  formatLocal,
  localInputToUtcIso,
  viewerTimeZone,
} from "../../../../../../../lib/datetime";
import { useAuth } from "../../../../../../../lib/auth";
import {
  MAX_SLOTS,
  scheduleQueryKey,
  schedulingClient,
} from "./scheduling-helpers";

/* ============================================================
   APTURA · v3 — Applicant schedule (`…/[appId]/schedule`)
   Two-column at lg+: LEFT candidate context (.ap-cell) with
   integrity summary; RIGHT recruiter scheduling UI (propose
   1..MAX_SLOTS slots, send to candidate, await response).
   Reuses the shared SchedulingService.
   ============================================================ */

const DURATIONS = [15, 30, 45, 60, 90] as const;
const NOTE_MAX = 1024;
const LOCATION_MAX = 512;

interface SlotRow {
  local: string;
  duration: number;
}

export default function ApplicantSchedulePage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const { id, appId } = useParams<{ id: string; appId: string }>();
  const qc = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sched = useMemo(() => schedulingClient(api), [api]);

  // Candidate-context query — light, render-only. Used to populate the LEFT cell.
  const job = useAuthedQuery(token, {
    queryKey: ["job", id],
    queryFn: () => api.jobs.getJob({ jobId: id }),
    enabled: Boolean(token && id),
  });
  const report = useAuthedQuery(token, {
    queryKey: ["report", appId],
    retry: false,
    queryFn: () => api.reports.getReport({ applicationId: appId }),
    enabled: Boolean(token && appId),
  });

  // Booking query — same pattern + cancellation labels as the recruiter app.
  const q = useQuery({
    queryKey: scheduleQueryKey(appId),
    retry: false,
    queryFn: () => sched.getSchedule(appId),
    refetchInterval: (query) =>
      query.state.data?.status === "booked" ? false : 15_000,
    refetchIntervalInBackground: false,
  });

  const [rows, setRows] = useState<SlotRow[]>([{ local: "", duration: 60 }]);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [reopened, setReopened] = useState(false);

  const booked = q.data?.status === "booked";

  const propose = useMutation({
    mutationFn: () => {
      const slots = rows
        .filter((r) => r.local)
        .map((r) => ({
          startAt: localInputToUtcIso(r.local),
          durationMinutes: r.duration,
        }));
      return booked
        ? sched.reschedule(appId, slots, location, note)
        : sched.proposeSlots(appId, slots, location, note);
    },
    onSuccess: () => {
      toast.success(booked ? "New times proposed" : "Times proposed");
      setReopened(false);
      qc.invalidateQueries({ queryKey: scheduleQueryKey(appId) });
    },
    onError: (err) => {
      // INVALID_ARGUMENT is the "not-ready" gate — surfaced as an alert, not a toast.
      if (!isCode(err, Code.InvalidArgument)) toast.error(errorMessage(err));
    },
  });

  const cancel = useMutation({
    mutationFn: () => sched.cancel(appId),
    onSuccess: () => {
      toast.success("Interview cancelled");
      qc.invalidateQueries({ queryKey: scheduleQueryKey(appId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function addToCalendar() {
    const { content, filename } = await sched.getIcs(appId);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  const notReady = propose.isError && isCode(propose.error, Code.InvalidArgument);
  const noteTooLong = note.length > NOTE_MAX;
  const locationTooLong = location.length > LOCATION_MAX;
  const hasSlot = rows.some((r) => r.local);
  const showForm = !booked || reopened;

  const candidateHandle = appId.slice(0, 8).toUpperCase();
  // Integrity readout pulled off the report — `getIntegrityTimeline` lives on the
  // report screen, not here, to avoid double-fetching.
  const integrityFlags = (report.data as { integrityFlagCount?: number } | undefined)?.integrityFlagCount ?? 0;
  const autoTerminated = (report.data as { autoTerminated?: boolean } | undefined)?.autoTerminated ?? false;

  return (
    <CompanyShell>
      <div className="mb-4">
        <Link
          href={`/company/jobs/${id}/applicants/${appId}`}
          className="ap-btn ap-btn-ghost ap-btn-sm inline-flex"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to report
        </Link>
      </div>

      <div className="ap-section-head">
        <span className="ap-eyebrow">Schedule</span>
        <h1 className="ap-h2">Propose interview times</h1>
        <p className="ap-lead">
          Send a small set of times; the candidate picks one. Aptura sends the
          notification and tracks the response.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* LEFT — Candidate context */}
        <div className="ap-cell ap-cell--anchor h-fit">
          <span className="ap-cell-tag">Candidate</span>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-teal-soft font-mono text-sm font-bold text-teal-strong"
            >
              {candidateHandle.slice(0, 2)}
            </span>
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold text-ink-deep">
                {candidateHandle}
              </div>
              <div className="text-xs text-ink-3">Applicant</div>
            </div>
          </div>

          {job.data && (
            <div className="mt-4 text-sm">
              <div className="font-semibold text-ink-deep">{job.data.title}</div>
              {(() => {
                const meta = [job.data.remoteMode, job.data.employmentType]
                  .filter(Boolean)
                  .join(" · ");
                return meta ? (
                  <div className="text-xs capitalize text-ink-3">{meta}</div>
                ) : null;
              })()}
            </div>
          )}

          <div className="mt-4 grid gap-2">
            {report.isLoading && (
              <div className="text-xs text-ink-3">Loading report status…</div>
            )}
            {report.isError && isNotFound(report.error) && (
              <span className="ap-pill">Report pending</span>
            )}
            {report.data && (
              <>
                <div>
                  <span className="ap-pill">{(report.data as { state?: string }).state ?? "—"}</span>
                </div>
                {autoTerminated ? (
                  <div>
                    <span className="ap-pill ap-pill--danger">
                      Auto-terminated · review before booking
                    </span>
                  </div>
                ) : integrityFlags > 0 ? (
                  <div>
                    <span className="ap-pill ap-pill--warn">
                      {integrityFlags} integrity flag{integrityFlags === 1 ? "" : "s"}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="ap-pill ap-pill--good">Integrity clean</span>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-ink-3">
            Behavioural &amp; AV proctoring only. Identity matching is out of scope.
          </p>
        </div>

        {/* RIGHT — Scheduling form */}
        <div className="grid gap-4">
          {q.isLoading && <LoadingState />}
          {q.isError && !isCode(q.error, Code.NotFound) && (
            <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
          )}

          {notReady && (
            <div className="ap-cell border-info-border bg-info-surface text-info-foreground">
              <h2 className="ap-h4">Not ready for a live interview</h2>
              <p className="mt-1 text-sm">
                This candidate isn&apos;t ready yet — they must pass the automated screen
                first.
              </p>
            </div>
          )}

          {q.data?.status === "cancelled" && (
            <div className="ap-cell border-warning-border bg-warning-surface text-warning-foreground">
              <h2 className="ap-h4">This interview was cancelled</h2>
              <p className="mt-1 text-sm">
                {q.data.cancelledBy
                  ? `Cancelled by ${q.data.cancelledBy}. Propose new times below.`
                  : "Propose new times below."}
              </p>
            </div>
          )}

          {booked && q.data && (
            <div className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Booked</span>
              <h2 className="ap-h3">Interview booked</h2>
              <p className="mt-1 text-sm text-ink-deep">
                {formatLocal(q.data.chosenStartAt)} · {q.data.chosenDurationMinutes} min
              </p>
              {q.data.location && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">
                  {q.data.location}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void addToCalendar()}
                  className="ap-btn ap-btn-ghost ap-btn-sm"
                >
                  <CalendarPlus className="size-4" aria-hidden /> Add to calendar
                </button>
                {!reopened && (
                  <button
                    type="button"
                    onClick={() => setReopened(true)}
                    className="ap-btn ap-btn-ghost ap-btn-sm"
                  >
                    Reschedule
                  </button>
                )}
                <ConfirmDialog
                  trigger={
                    <button type="button" className="ap-btn ap-btn-ghost ap-btn-sm">
                      Cancel interview
                    </button>
                  }
                  title="Cancel this interview?"
                  description="The candidate will be notified."
                  confirmLabel="Cancel interview"
                  destructive
                  busy={cancel.isPending}
                  onConfirm={() => cancel.mutate()}
                />
              </div>
            </div>
          )}

          {!booked && q.data?.status === "proposed" && q.data.slots.length > 0 && (
            <div className="ap-cell border-info-border bg-info-surface text-info-foreground">
              <h2 className="ap-h4">Awaiting the candidate&apos;s choice</h2>
              <p className="mt-1 text-sm">
                {q.data.slots.length} time
                {q.data.slots.length === 1 ? "" : "s"} proposed. You&apos;ll see the
                booking here once they pick one.
              </p>
            </div>
          )}

          {showForm && (
            <div className="ap-cell">
              <h2 className="ap-h4 mb-1">
                {booked ? "Reschedule — propose new times" : "Propose interview times"}
              </h2>
              <p className="text-xs text-ink-3">
                Entered in your timezone ({viewerTimeZone()}); the candidate sees them
                in theirs.
              </p>

              <div className="mt-4 grid gap-2">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="datetime-local"
                      aria-label={`Proposed time ${i + 1}`}
                      value={r.local}
                      onChange={(e) =>
                        setRows((rs) =>
                          rs.map((x, j) => (j === i ? { ...x, local: e.target.value } : x)),
                        )
                      }
                      className="flex-1"
                    />
                    <Select
                      value={String(r.duration)}
                      onValueChange={(val) =>
                        setRows((rs) =>
                          rs.map((x, j) => (j === i ? { ...x, duration: Number(val) } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="w-28" aria-label={`Duration for time ${i + 1}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} min
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove time ${i + 1}`}
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                        className="grid size-9 place-items-center rounded-lg border border-line bg-surface hover:bg-surface-2"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {rows.length < MAX_SLOTS && (
                <button
                  type="button"
                  onClick={() =>
                    setRows((rs) => [...rs, { local: "", duration: 60 }])
                  }
                  className="ap-btn ap-btn-ghost ap-btn-sm mt-3 self-start"
                >
                  <Plus className="size-4" aria-hidden /> Add another time
                </button>
              )}

              <div className="mt-4 grid gap-3">
                <Field
                  label="Location / link"
                  error={locationTooLong ? `Keep this under ${LOCATION_MAX} characters.` : null}
                >
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Google Meet link or office address"
                  />
                </Field>
                <Field
                  label="Note (optional)"
                  error={noteTooLong ? `Keep this under ${NOTE_MAX} characters.` : null}
                >
                  <Textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Anything the candidate should know before the interview."
                  />
                </Field>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={!hasSlot || noteTooLong || locationTooLong || propose.isPending}
                  onClick={() => propose.mutate()}
                  className="ap-btn ap-btn-primary"
                >
                  {propose.isPending
                    ? "Sending…"
                    : booked
                      ? "Send new times"
                      : "Propose times"}
                </button>
                {booked && reopened && (
                  <button
                    type="button"
                    onClick={() => setReopened(false)}
                    className="ap-btn ap-btn-ghost"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {!booked && !showForm && !q.data && (
            <div className="ap-cell">
              <h2 className="ap-h4">No interview scheduled</h2>
              <p className="mt-1 text-sm text-ink-2">
                Propose a set of times and the candidate will pick one.
              </p>
            </div>
          )}
        </div>
      </div>
    </CompanyShell>
  );
}
