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
    onSuccess: () => {
      toast.success(
        `Decision applied to ${selected.length} candidate${selected.length > 1 ? "s" : ""}`,
      );
      setOutcome("");
      onDone();
      for (const key of [
        ["applicants", jobId],
        ["ranked", jobId],
        ["reports", jobId],
        ["score-dist", jobId],
        ["analytics"],
      ])
        queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-2">
      <span className="text-sm font-medium text-foreground">
        {selected.length} selected
      </span>
      <Select value={outcome} onValueChange={setOutcome}>
        <SelectTrigger className="h-9 w-36">
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
