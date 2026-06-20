"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
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
  Textarea,
  toast,
} from "@ip/ui";
import { Code, errorMessage, isCode } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { formatLocal, localInputToUtcIso, viewerTimeZone } from "../lib/datetime";
import { MAX_SLOTS, scheduleQueryKey, schedulingClient } from "../lib/scheduling";

const DURATIONS = [15, 30, 45, 60, 90] as const;
const NOTE_MAX = 1024;
const LOCATION_MAX = 512;

interface SlotRow {
  local: string;
  duration: number;
}

/** Recruiter-side scheduling for one application: propose interview times, view the booked
 * slot, reschedule, or cancel. Every slot's local datetime is converted to a UTC ISO instant
 * via `localInputToUtcIso` BEFORE the call — the wire only ever carries UTC. */
export function SchedulePanel({ applicationId }: { applicationId: string }) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const sched = useMemo(() => schedulingClient(api), [api]);

  const [rows, setRows] = useState<SlotRow[]>([{ local: "", duration: 60 }]);
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [reopened, setReopened] = useState(false);

  const q = useQuery({
    queryKey: scheduleQueryKey(applicationId),
    retry: false,
    queryFn: () => sched.getSchedule(applicationId),
    // Stop polling once the interview is booked — the slot is settled.
    refetchInterval: (query) => (query.state.data?.status === "booked" ? false : 15_000),
    refetchIntervalInBackground: false,
  });

  const booked = q.data?.status === "booked";

  const propose = useMutation({
    mutationFn: () => {
      const slots = rows
        .filter((r) => r.local)
        .map((r) => ({ startAt: localInputToUtcIso(r.local), durationMinutes: r.duration }));
      return booked
        ? sched.reschedule(applicationId, slots, location, note)
        : sched.proposeSlots(applicationId, slots, location, note);
    },
    onSuccess: () => {
      toast.success(booked ? "New times proposed" : "Times proposed");
      setReopened(false);
      qc.invalidateQueries({ queryKey: scheduleQueryKey(applicationId) });
    },
    // The not-ready gate (application not interview_pending/shortlisted) comes back as
    // INVALID_ARGUMENT — surfaced as the gate Alert below, not a toast.
    onError: (err) => {
      if (!isCode(err, Code.InvalidArgument)) toast.error(errorMessage(err));
    },
  });

  const cancel = useMutation({
    mutationFn: () => sched.cancel(applicationId),
    onSuccess: () => {
      toast.success("Interview cancelled");
      qc.invalidateQueries({ queryKey: scheduleQueryKey(applicationId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function addToCalendar() {
    const { content, filename } = await sched.getIcs(applicationId);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/calendar" }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (q.isLoading) return <LoadingState label="Loading scheduling…" />;
  if (q.isError && !isCode(q.error, Code.NotFound))
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;

  // The propose attempt hit the gate — the application hasn't passed the automated screen.
  const notReady = propose.isError && isCode(propose.error, Code.InvalidArgument);
  const noteTooLong = note.length > NOTE_MAX;
  const locationTooLong = location.length > LOCATION_MAX;
  const hasSlot = rows.some((r) => r.local);
  const showForm = !booked || reopened;

  return (
    <div className="flex flex-col gap-4">
      {notReady && (
        <Alert tone="info" title="Not ready for a live interview">
          This candidate isn&apos;t ready yet — they must pass the automated screen first.
        </Alert>
      )}

      {q.data?.status === "cancelled" && (
        <Alert tone="warning" title="This interview was cancelled">
          {q.data.cancelledBy
            ? `Cancelled by ${q.data.cancelledBy}. Propose new times below.`
            : "Propose new times below."}
        </Alert>
      )}

      {booked && q.data && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <p className="font-display text-lg font-semibold text-foreground">Interview booked</p>
            <p className="text-sm text-foreground">
              {formatLocal(q.data.chosenStartAt)} · {q.data.chosenDurationMinutes} min
            </p>
            {q.data.location && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {q.data.location}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                leadingIcon={CalendarPlus}
                onClick={() => void addToCalendar()}
              >
                Add to calendar
              </Button>
              {!reopened && (
                <Button variant="outline" onClick={() => setReopened(true)}>
                  Reschedule
                </Button>
              )}
              <ConfirmDialog
                trigger={
                  <Button variant="outline" loading={cancel.isPending}>
                    Cancel interview
                  </Button>
                }
                title="Cancel this interview?"
                description="The candidate will be notified."
                confirmLabel="Cancel interview"
                destructive
                busy={cancel.isPending}
                onConfirm={() => cancel.mutate()}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {!booked && q.data?.status === "proposed" && q.data.slots.length > 0 && (
        <Alert tone="info" title="Awaiting the candidate's choice">
          {q.data.slots.length} time{q.data.slots.length === 1 ? "" : "s"} proposed. You&apos;ll
          see the booking here once they pick one.
        </Alert>
      )}

      {showForm && (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
              <p className="font-display text-base font-semibold text-foreground">
                {booked ? "Reschedule — propose new times" : "Propose interview times"}
              </p>
              <p className="text-sm text-muted-foreground">
                Entered in your timezone ({viewerTimeZone()}); the candidate sees them in theirs.
              </p>
            </div>

            <div className="flex flex-col gap-2">
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
                    onValueChange={(v) =>
                      setRows((rs) =>
                        rs.map((x, j) => (j === i ? { ...x, duration: Number(v) } : x)),
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
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove time ${i + 1}`}
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {rows.length < MAX_SLOTS && (
              <Button
                variant="ghost"
                size="sm"
                leadingIcon={Plus}
                className="self-start"
                onClick={() => setRows((rs) => [...rs, { local: "", duration: 60 }])}
              >
                Add another time
              </Button>
            )}

            <div className="flex flex-col gap-1.5">
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
            </div>

            <div className="flex flex-col gap-1.5">
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

            <div className="flex gap-3">
              <Button
                loading={propose.isPending}
                disabled={!hasSlot || noteTooLong || locationTooLong}
                onClick={() => propose.mutate()}
                className="self-start"
              >
                {booked ? "Send new times" : "Propose times"}
              </Button>
              {booked && reopened && (
                <Button variant="ghost" onClick={() => setReopened(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!booked && !showForm && !q.data && (
        <EmptyState
          title="No interview scheduled"
          description="Propose a set of times and the candidate will pick one."
        />
      )}
    </div>
  );
}
