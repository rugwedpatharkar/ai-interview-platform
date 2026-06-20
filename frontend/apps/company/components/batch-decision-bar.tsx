"use client";

import {
  Button,
  ConfirmDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import type { ApplicationList } from "@ip/api-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "../lib/auth";

export function BatchDecisionBar({
  jobId,
  selected,
  onDone,
}: {
  jobId: string;
  selected: string[];
  onDone: () => void;
}) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState("");

  const decide = useMutation({
    mutationFn: async () => {
      // Fan-out keeps each decision independent + idempotent; allSettled surfaces the
      // first hard failure as a count rather than a silent drop (partial success is fine).
      const results = await Promise.allSettled(
        selected.map((applicationId) =>
          api.decisions.decideApplication({ applicationId, outcome }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) throw new Error(`${failed} of ${selected.length} decisions failed`);
    },
    // Optimistic: flip every selected row's state in the applicants cache so the queue
    // reflects the decision immediately; snapshot for rollback. `outcome`/`selected` are
    // captured at mutate time before the success handler clears the selection.
    onMutate: async () => {
      const next = outcome;
      const ids = new Set(selected);
      await queryClient.cancelQueries({ queryKey: ["applicants", jobId] });
      const prev = queryClient.getQueryData<ApplicationList>(["applicants", jobId]);
      if (prev)
        queryClient.setQueryData<ApplicationList>(["applicants", jobId], {
          ...prev,
          applications: prev.applications.map((a) =>
            ids.has(a.applicationId) ? { ...a, state: next } : a,
          ),
        });
      return { prev };
    },
    onSuccess: () => {
      toast.success(
        `Decision applied to ${selected.length} candidate${selected.length > 1 ? "s" : ""}`,
      );
      setOutcome("");
      onDone();
      for (const key of [
        ["ranked", jobId],
        ["reports", jobId],
        ["score-dist", jobId],
        ["analytics"],
      ])
        queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["applicants", jobId], ctx.prev); // roll back
      toast.error(errorMessage(err));
    },
    // Reconcile the optimistic rows against the server once the batch settles.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants", jobId] });
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-foreground px-4 py-2.5 text-background">
      <span className="inline-flex size-4 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground tabular-nums">
        {selected.length}
      </span>
      <span className="text-sm font-semibold">
        {selected.length} selected
      </span>
      <span className="flex-1" />
      <Select value={outcome} onValueChange={setOutcome}>
        <SelectTrigger className="h-9 w-36 border-background/30 bg-transparent text-background">
          <SelectValue placeholder="Decide…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="shortlisted">Shortlist</SelectItem>
          <SelectItem value="rejected">Decline</SelectItem>
        </SelectContent>
      </Select>
      <ConfirmDialog
        trigger={
          <Button size="sm" disabled={!outcome || decide.isPending}>
            Apply to selected
          </Button>
        }
        title={`Apply "${outcome}" to ${selected.length} candidate${selected.length > 1 ? "s" : ""}?`}
        description="Each candidate is notified of the decision. This can't be undone in bulk."
        confirmLabel="Confirm"
        busy={decide.isPending}
        onConfirm={() => decide.mutate()}
      />
    </div>
  );
}
