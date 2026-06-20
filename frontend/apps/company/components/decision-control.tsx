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

export function DecisionControl({
  applicationId,
  jobId,
}: {
  applicationId: string;
  jobId: string;
}) {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState("");

  const decide = useMutation({
    mutationFn: () => api.decisions.decideApplication({ applicationId, outcome }),
    // Optimistic: flip this row's state in the applicants cache so the pill + action
    // cluster update on confirm; snapshot for rollback. `outcome` is captured at mutate
    // time so a settled-then-cleared select doesn't strand the optimistic write.
    onMutate: async () => {
      const next = outcome;
      await queryClient.cancelQueries({ queryKey: ["applicants", jobId] });
      const prev = queryClient.getQueryData<ApplicationList>(["applicants", jobId]);
      if (prev)
        queryClient.setQueryData<ApplicationList>(["applicants", jobId], {
          ...prev,
          applications: prev.applications.map((a) =>
            a.applicationId === applicationId ? { ...a, state: next } : a,
          ),
        });
      return { prev };
    },
    onSuccess: () => {
      toast.success("Decision recorded");
      setOutcome("");
      queryClient.invalidateQueries({ queryKey: ["report", applicationId] });
      // A decision shifts the funnel — refresh the sibling per-job tabs too.
      queryClient.invalidateQueries({ queryKey: ["ranked", jobId] });
      queryClient.invalidateQueries({ queryKey: ["reports", jobId] });
      queryClient.invalidateQueries({ queryKey: ["score-dist", jobId] });
      // The company-wide funnel dashboard counts shift too (prefix-matches ["analytics", *]).
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(["applicants", jobId], ctx.prev); // roll back
      toast.error(errorMessage(err));
    },
    // Reconcile the optimistic row against the server once the call settles.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["applicants", jobId] });
    },
  });

  return (
    <div className="flex items-center gap-2">
      {/* Always-controlled: `value` is the empty string until a choice is made, so the
          Select never flips from uncontrolled to controlled (no React warning). */}
      <Select value={outcome} onValueChange={setOutcome}>
        <SelectTrigger className="h-9 w-32">
          <SelectValue placeholder="Decide…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="shortlisted">Shortlist</SelectItem>
          <SelectItem value="hired">Hire</SelectItem>
          <SelectItem value="rejected">Reject</SelectItem>
        </SelectContent>
      </Select>
      <ConfirmDialog
        trigger={
          <Button size="sm" disabled={!outcome || decide.isPending}>
            Apply
          </Button>
        }
        title="Record this decision?"
        description={`This will mark the candidate as "${outcome}".`}
        confirmLabel="Confirm"
        busy={decide.isPending}
        onConfirm={() => decide.mutate()}
      />
    </div>
  );
}
