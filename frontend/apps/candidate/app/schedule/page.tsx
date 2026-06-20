"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  RadioGroup,
  RadioGroupItem,
} from "@ip/ui";
import { errorMessage, useRequireAuth, useRequireRole } from "@ip/shared";
import { CalendarPlus, Clock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import { dayLabel, formatLocal, timeLabel, viewerTimeZone } from "../../lib/datetime";
import type { ProposedSlot } from "../../lib/scheduling";
import { useSchedule } from "../../lib/use-schedule";

// Group offered slots by the viewer's local calendar day, so a multi-day proposal reads as a
// short list per day rather than one flat run of timestamps. Insertion order follows the
// (already future-sorted) slot order, so days stay chronological.
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
    const { content, filename } = await getIcs(applicationId);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <CandidateShell>
      <PageHeader title="Interview" description="Pick a time that works for you." />

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

      {schedule && schedule.status === "proposed" && (
        <Card>
          <CardContent className="flex flex-col gap-5 p-6">
            <p className="text-sm text-muted-foreground">
              Times shown in {viewerTimeZone()}
            </p>
            {/* aria-live so a newly-polled proposal is announced to screen readers. */}
            <div role="status" aria-live="polite">
              <RadioGroup
                value={picked}
                onValueChange={setPicked}
                className="flex flex-col gap-5"
                aria-label="Proposed interview times"
              >
                {grouped.map((group) => (
                  <div key={group.day} className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {group.day}
                    </p>
                    {group.slots.map((s) => (
                      <label
                        key={s.startAt}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm tabular-nums text-foreground transition-colors hover:bg-surface-muted has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                      >
                        <RadioGroupItem value={s.startAt} />
                        <Clock className="size-4 text-muted-foreground" aria-hidden />
                        <span>
                          {timeLabel(s.startAt)} · {s.durationMinutes} min
                        </span>
                      </label>
                    ))}
                  </div>
                ))}
              </RadioGroup>
            </div>
            {schedule.location && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {schedule.location}
              </p>
            )}
            {schedule.note && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {schedule.note}
              </p>
            )}
            <Button
              disabled={!picked || choosing}
              loading={choosing}
              onClick={() => choose(picked)}
              className="self-start"
            >
              Confirm time
            </Button>
          </CardContent>
        </Card>
      )}

      {schedule && schedule.status === "booked" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="text-lg font-semibold text-foreground">
              Interview confirmed
            </p>
            <p className="text-sm tabular-nums text-foreground">
              {formatLocal(schedule.chosenStartAt)} · {schedule.chosenDurationMinutes} min
            </p>
            {schedule.location && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {schedule.location}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
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
          </CardContent>
        </Card>
      )}

      {schedule && schedule.status === "cancelled" && (
        <Alert tone="warning" title="This interview was cancelled">
          {schedule.cancelledBy
            ? `Cancelled by ${schedule.cancelledBy}. The hiring team may propose new times.`
            : "The hiring team may propose new times."}
        </Alert>
      )}

      {schedule && schedule.status === "completed" && (
        <Alert tone="info" title="This interview has taken place">
          Thanks for interviewing — you&apos;ll hear about next steps from the hiring team.
        </Alert>
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
