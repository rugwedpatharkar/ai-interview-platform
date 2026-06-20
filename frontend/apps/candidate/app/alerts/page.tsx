"use client";

import {
  ApIcon,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
  toast,
} from "@ip/ui";
import { Code, errorMessage, isCode, useRequireAuth } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import { summarizeAlert, useJobAlertsClient } from "../../lib/job-alerts-client";
import type {
  AlertFrequency,
  CreateAlertInput,
  JobAlertDTO,
} from "./types";

const REMOTE = ["remote", "hybrid", "onsite"] as const;
type Remote = (typeof REMOTE)[number];

export default function JobAlertsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const qc = useQueryClient();
  const jobAlertsClient = useJobAlertsClient();

  const q = useQuery({
    queryKey: ["job-alerts"],
    queryFn: () => jobAlertsClient.list(),
    enabled: Boolean(token),
  });

  const create = useMutation({
    mutationFn: (input: CreateAlertInput) => jobAlertsClient.create(input),
    onSuccess: () => {
      toast.success("Alert created");
      qc.invalidateQueries({ queryKey: ["job-alerts"] });
    },
    onError: (err) => {
      // A duplicate save (same keyword+filters) lands as ALREADY_EXISTS from the BE; surface
      // a friendly toast instead of the raw gRPC code and refetch the list so the existing
      // row scrolls into view.
      if (isCode(err, Code.AlreadyExists)) {
        toast.info("You already have an alert for that search");
        void q.refetch();
        return;
      }
      toast.error(errorMessage(err));
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => jobAlertsClient.remove(id),
    onSuccess: () => {
      toast.success("Alert deleted");
      qc.invalidateQueries({ queryKey: ["job-alerts"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!token) return null; // hydration guard
  const alerts = q.data ?? [];

  return (
    <CandidateShell>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="ap-eyebrow">Alerts</p>
          <h1 className="ap-h2">Save a search. We'll do the watching.</h1>
          <p className="ap-lead text-base">
            We email you when a fresh role matches — daily or weekly, your call. No
            spam, no recruiter blasts.
          </p>
        </header>

        {/* Anchor cell — create form */}
        <div className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">A · NEW ALERT</span>
          <div className="flex items-center gap-2">
            <BellRing className="size-5 text-primary" aria-hidden />
            <h2 className="ap-h3 text-xl">Create a new alert</h2>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            Pick a keyword and a remote mode. We'll watch the marketplace for matches.
          </p>
          <AlertForm
            pending={create.isPending}
            onCreate={(input) => create.mutate(input)}
          />
        </div>

        {/* Existing alerts */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="ap-h3 text-xl">Your alerts</h2>
            {alerts.length > 0 && (
              <span
                className="text-xs text-ink-3"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {alerts.length} active
              </span>
            )}
          </div>

          {q.isLoading && (
            <>
              <Skeleton className="h-20 rounded-[22px]" />
              <Skeleton className="h-20 rounded-[22px]" />
            </>
          )}
          {q.isError && (
            <ErrorState
              message={errorMessage(q.error)}
              retry={() => q.refetch()}
            />
          )}
          {!q.isLoading && !q.isError && alerts.length === 0 && (
            <EmptyState
              icon={BellRing}
              title="No alerts yet"
              description="Save a search above and we'll ping you the moment a matching role goes live."
            />
          )}

          {alerts.map((a, i) => (
            <AlertCell
              key={a.alertId}
              alert={a}
              delay={Math.min(i, 8) * 30}
              onDelete={(id) => remove.mutate(id)}
              deleting={remove.isPending && remove.variables === a.alertId}
            />
          ))}
        </section>
      </div>
    </CandidateShell>
  );
}

/** The create form — controlled, native form submit, reports a CreateAlertInput up. */
function AlertForm({
  onCreate,
  pending,
}: {
  onCreate: (input: CreateAlertInput) => void;
  pending: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [remote, setRemote] = useState<string>("");
  const [frequency, setFrequency] = useState<AlertFrequency>("daily");

  function submit(e: FormEvent) {
    e.preventDefault();
    onCreate({
      keyword: keyword.trim(),
      filters: remote ? { remoteMode: remote as Remote } : {},
      frequency,
    });
    setKeyword("");
    setRemote("");
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1.5 text-sm">
        <span className="text-ink-2">Keyword</span>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. frontend engineer"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-foreground placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-2">Remote</span>
        <Select value={remote} onValueChange={setRemote}>
          <SelectTrigger className="w-36" aria-label="Remote">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            {REMOTE.map((r) => (
              <SelectItem key={r} value={r}>
                {r === "remote" ? "Remote" : r === "hybrid" ? "Hybrid" : "On-site"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-2">Frequency</span>
        <Select
          value={frequency}
          onValueChange={(v) => setFrequency(v as AlertFrequency)}
        >
          <SelectTrigger className="w-32" aria-label="Frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "ap-btn ap-btn-primary self-stretch sm:self-end",
          pending && "cursor-not-allowed opacity-60",
        )}
      >
        {pending ? "Creating…" : "Create alert"}
      </button>
    </form>
  );
}

/** A single saved alert as an `.ap-cell` row with summary + last-run + delete confirm. */
function AlertCell({
  alert,
  delay,
  onDelete,
  deleting,
}: {
  alert: JobAlertDTO;
  delay: number;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div
      className="ap-cell animate-rise-in flex items-center justify-between gap-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-primary">
          <ApIcon name="bell" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {summarizeAlert(alert)}
          </p>
          <p
            className="mt-0.5 text-xs text-ink-3"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {alert.frequency === "daily" ? "Daily" : "Weekly"} ·{" "}
            {alert.lastRunAt
              ? `last run ${new Date(alert.lastRunAt).toLocaleDateString()}`
              : "never run yet"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="ap-pill ap-pill--teal capitalize">{alert.frequency}</span>
        <ConfirmDialog
          title="Delete this alert?"
          description="You'll stop receiving notifications for this saved search."
          confirmLabel="Delete"
          destructive
          busy={deleting}
          onConfirm={() => onDelete(alert.alertId)}
          trigger={
            <button
              type="button"
              aria-label="Delete alert"
              className="ap-btn ap-btn-ghost ap-btn-sm"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          }
        />
      </div>
    </div>
  );
}
