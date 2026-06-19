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
    onSuccess: () => {
      toast.success("Decision recorded");
      setOutcome("");
      queryClient.invalidateQueries({ queryKey: ["applicants", jobId] });
      queryClient.invalidateQueries({ queryKey: ["report", applicationId] });
      // A decision shifts the funnel — refresh the sibling per-job tabs too.
      queryClient.invalidateQueries({ queryKey: ["ranked", jobId] });
      queryClient.invalidateQueries({ queryKey: ["reports", jobId] });
      queryClient.invalidateQueries({ queryKey: ["score-dist", jobId] });
      // The company-wide funnel dashboard counts shift too (prefix-matches ["analytics", *]).
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
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
          <Button size="sm" disabled={!outcome}>
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
