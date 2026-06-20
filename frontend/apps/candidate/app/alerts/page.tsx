"use client";

import { EmptyState, ErrorState, PageHeader, Skeleton, toast } from "@ip/ui";
import { errorMessage, useRequireAuth } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";

import { CandidateShell } from "../../components/candidate-shell";
import { AlertForm } from "../../components/alert-form";
import { AlertRow } from "../../components/alert-row";
import { useAuth } from "../../lib/auth";
import { jobAlertsClient } from "../../lib/job-alerts-client";
import type { CreateAlertInput } from "./types";

export default function JobAlertsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const qc = useQueryClient();

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
    onError: (err) => toast.error(errorMessage(err)),
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
      <PageHeader
        title="Job alerts"
        description="Save a search and we'll notify you when new matching roles are posted."
      />

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <AlertForm onCreate={(input) => create.mutate(input)} pending={create.isPending} />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {q.isLoading && (
          <>
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </>
        )}
        {q.isError && (
          <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
        )}
        {!q.isLoading && !q.isError && alerts.length === 0 && (
          <EmptyState
            icon={BellRing}
            title="No alerts yet"
            description="Save a search above and we'll ping you the moment a matching role goes live."
          />
        )}
        {alerts.map((a) => (
          <AlertRow
            key={a.alertId}
            alert={a}
            onDelete={(id) => remove.mutate(id)}
            deleting={remove.isPending && remove.variables === a.alertId}
          />
        ))}
      </div>
    </CandidateShell>
  );
}
