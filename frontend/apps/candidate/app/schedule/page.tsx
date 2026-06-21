"use client";

import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, useRequireAuth, useRequireRole } from "@ip/shared";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  MapPin,
  StickyNote,
  XCircle,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import { dayLabel, formatLocal, timeLabel, viewerTimeZone } from "../../lib/datetime";
import type { ProposedSlot } from "../../lib/scheduling";
import { useSchedule } from "../../lib/use-schedule";

// Group offered slots by the viewer's local calendar day, so a multi-day proposal reads as
// distinct columns on the calendar grid rather than one flat list. Insertion order follows
// the (already future-sorted) slot order so days stay chronological.
function groupByDay(slots: ProposedSlot[]): { day: string; slots: ProposedSlot[] }[] {
  const groups = new Map<string, ProposedSlot[]>();
  for (const slot of slots) {
    const key = dayLabel(slot.startAt);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(slot);
  }
  return Array.from(groups, ([day, daySlots]) => ({ day, slots: daySlots }));
}

function ScheduleBody() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, ["candidate"], ready);

  const applicationId = useSearchParams().get("application") ?? "";
  const {
    schedule,
    isLoading,
    isError,
    error,
    refetch,
    choose,
    choosing,
    cancel,
    cancelling,
    getIcs,
  } = useSchedule(applicationId);
  const [picked, setPicked] = useState("");
  const grouped = useMemo(() => groupByDay(schedule?.slots ?? []), [schedule?.slots]);

  if (!token) return null;

  async function addToCalendar() {
    try {
      const { content, filename } = await getIcs(applicationId);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      // Network/permission failures here matter — surface them, don't silently swallow.
      toast.error(errorMessage(e));
    }
  }

  // The right-side detail panel changes per status, but the left calendar always renders
  // (even after booking, as a read-only echo of what was chosen) — preserves spatial memory
  // when the page transitions from "proposed" to "booked" without a route change.
  const isProposed = schedule?.status === "proposed";
  const isBooked = schedule?.status === "booked";
  const isCancelled = schedule?.status === "cancelled";
  const isCompleted = schedule?.status === "completed";

  return (
    <CandidateShell>
      <PageHeader
        title="Interview"
        description={
          schedule
            ? `Times shown in ${viewerTimeZone()}.`
            : "Pick a time that works for you."
        }
      />

      {isLoading && <LoadingState label="Loading your interview…" />}

      {isError && (
        <ErrorState message={errorMessage(error)} retry={() => refetch()} />
      )}

      {!isLoading && !isError && !applicationId && (
        <EmptyState
          title="No interview selected"
          description="Open this page from an interview-ready application on your dashboard."
        />
      )}

      {schedule && (
        <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          {/* ---------- LEFT: calendar-style day-column slot grid ---------- */}
          <section className="ap-cell" aria-label="Proposed times">
            <header className="mb-4 flex items-center justify-between gap-3">
              <h2 className="ap-h4">
                {isProposed
                  ? "Choose a time"
                  : isBooked
                    ? "Your interview"
                    : isCancelled
                      ? "Cancelled"
                      : "Past interview"}
              </h2>
              <span className="ap-pill">
                <Clock className="size-3.5" aria-hidden /> {viewerTimeZone()}
              </span>
            </header>

            {grouped.length > 0 ? (
              <div
                className="grid gap-3 overflow-x-auto pb-1"
                style={{
                  gridTemplateColumns: `repeat(${grouped.length}, minmax(160px, 1fr))`,
                }}
                role={isProposed ? "radiogroup" : undefined}
                aria-label={isProposed ? "Proposed interview times" : undefined}
                aria-live="polite"
              >
                {grouped.map((group) => (
                  <div key={group.day} className="flex min-w-0 flex-col gap-2">
                    <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink-3">
                      {group.day}
                    </p>
                    {group.slots.map((s) => {
                      const isChosen =
                        isBooked && schedule.chosenStartAt === s.startAt;
                      const isPicked = picked === s.startAt;
                      const disabled = !isProposed;
                      return (
                        <button
                          key={s.startAt}
                          type="button"
                          role={isProposed ? "radio" : undefined}
                          aria-checked={isProposed ? isPicked : undefined}
                          aria-pressed={isChosen ? true : undefined}
                          disabled={disabled}
                          onClick={() => isProposed && setPicked(s.startAt)}
                          className={cn(
                            "group flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left tabular-nums transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                            disabled && "cursor-default",
                            isChosen
                              ? "border-primary bg-primary/10 text-foreground"
                              : isPicked
                                ? "border-primary bg-primary/5 text-foreground"
                                : disabled
                                  ? "border-line bg-surface-2 text-ink-3"
                                  : "border-line bg-surface text-foreground hover:border-primary/60 hover:bg-surface-2",
                          )}
                        >
                          <span className="text-sm font-semibold">
                            {timeLabel(s.startAt)}
                          </span>
                          <span className="text-xs text-ink-2">
                            {s.durationMinutes} min
                          </span>
                          {isChosen && (
                            <span className="mt-1 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-primary">
                              <CheckCircle2 className="size-3" aria-hidden /> Chosen
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : isBooked && schedule.chosenStartAt ? (
              // Edge case: a booking that no longer has the surrounding proposal set (e.g.
              // recruiter cleared the open proposal after booking). Render the chosen slot
              // alone so the page still shows "what you picked".
              <div className="flex flex-col gap-2 rounded-xl border border-primary bg-primary/5 px-3 py-2.5 tabular-nums">
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink-3">
                  {dayLabel(schedule.chosenStartAt)}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {timeLabel(schedule.chosenStartAt)}
                </span>
                <span className="text-xs text-ink-2">
                  {schedule.chosenDurationMinutes} min
                </span>
              </div>
            ) : (
              <p className="text-sm text-ink-3">No times to show.</p>
            )}
          </section>

          {/* ---------- RIGHT: detail panel ---------- */}
          <aside className="ap-cell flex flex-col gap-4" aria-label="Interview detail">
            {isProposed && (
              <>
                <header>
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink-3">
                    Step 1 of 1
                  </p>
                  <h2 className="ap-h4 mt-2">Confirm your time</h2>
                  <p className="mt-1 text-sm text-ink-2">
                    Tap a slot on the left, then confirm to book it. You can cancel later
                    if plans change.
                  </p>
                </header>
                {picked && (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 tabular-nums">
                    <p className="text-xs font-medium text-ink-3">Selected</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {formatLocal(picked)}
                    </p>
                  </div>
                )}
                {schedule.location && (
                  <p className="flex items-start gap-2 text-sm text-ink-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="whitespace-pre-wrap">{schedule.location}</span>
                  </p>
                )}
                {schedule.note && (
                  <p className="flex items-start gap-2 text-sm text-ink-2">
                    <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="whitespace-pre-wrap">{schedule.note}</span>
                  </p>
                )}
                <Button
                  className="self-start"
                  disabled={!picked || choosing}
                  loading={choosing}
                  onClick={() => choose(picked)}
                >
                  Confirm time
                </Button>
              </>
            )}

            {isBooked && (
              <>
                <header>
                  <span className="ap-pill ap-pill--good">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Confirmed
                  </span>
                  <h2 className="ap-h4 mt-3">Interview confirmed</h2>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {schedule.chosenStartAt
                      ? `${formatLocal(schedule.chosenStartAt)} · ${schedule.chosenDurationMinutes} min`
                      : "Time to be confirmed"}
                  </p>
                </header>
                {schedule.location && (
                  <p className="flex items-start gap-2 text-sm text-ink-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="whitespace-pre-wrap">{schedule.location}</span>
                  </p>
                )}
                {schedule.note && (
                  <p className="flex items-start gap-2 text-sm text-ink-2">
                    <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span className="whitespace-pre-wrap">{schedule.note}</span>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button leadingIcon={CalendarPlus} onClick={() => void addToCalendar()}>
                    Add to calendar
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" loading={cancelling}>
                        Cancel interview
                      </Button>
                    }
                    title="Cancel this interview?"
                    description="The hiring team will be notified. You may need to wait for new times."
                    confirmLabel="Cancel interview"
                    destructive
                    busy={cancelling}
                    onConfirm={() => cancel()}
                  />
                </div>
              </>
            )}

            {isCancelled && (
              <>
                <header>
                  <span className="ap-pill ap-pill--warn">
                    <XCircle className="size-3.5" aria-hidden /> Cancelled
                  </span>
                  <h2 className="ap-h4 mt-3">This interview was cancelled</h2>
                </header>
                <Alert tone="warning">
                  {schedule.cancelledBy
                    ? `Cancelled by ${schedule.cancelledBy}. The hiring team may propose new times.`
                    : "The hiring team may propose new times."}
                </Alert>
              </>
            )}

            {isCompleted && (
              <>
                <header>
                  <span className="ap-pill">Completed</span>
                  <h2 className="ap-h4 mt-3">This interview has taken place</h2>
                </header>
                <Alert tone="info">
                  Thanks for interviewing — you&apos;ll hear about next steps from the
                  hiring team.
                </Alert>
              </>
            )}
          </aside>
        </div>
      )}
    </CandidateShell>
  );
}

export default function SchedulePage() {
  // useSearchParams() requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<LoadingState />}>
      <ScheduleBody />
    </Suspense>
  );
}
