"use client";

import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  jobStatus,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { ApplicantsTable } from "../../../components/applicants-table";
import { CompanyShell } from "../../../components/company-shell";
import { RankedPanel } from "../../../components/ranked-panel";
import { ReportsPanel } from "../../../components/reports-panel";
import { ScoreDistributionPanel } from "../../../components/score-distribution-panel";
import { useAuth } from "../../../lib/auth";

export default function JobDetailPage() {
  const { api, token } = useAuth();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();

  const job = useAuthedQuery(token, {
    queryKey: ["job", id],
    queryFn: () => api.jobs.getJob({ jobId: id }),
  });

  const publish = useMutation({
    mutationFn: () => api.jobs.publishJob({ jobId: id }),
    onSuccess: () => {
      toast.success("Job published");
      queryClient.invalidateQueries({ queryKey: ["job", id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <CompanyShell>
      {job.isLoading && <LoadingState />}
      {job.isError && (
        <ErrorState message={errorMessage(job.error)} retry={() => job.refetch()} />
      )}
      {job.data && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                {job.data.title}
              </h1>
              <Badge tone={jobStatus(job.data.status).tone}>
                {jobStatus(job.data.status).label}
              </Badge>
            </div>
            {job.data.status === "draft" && (
              <ConfirmDialog
                trigger={<Button>Publish</Button>}
                title="Publish this job?"
                description="Candidates can apply once it's published."
                confirmLabel="Publish"
                busy={publish.isPending}
                onConfirm={() => publish.mutate()}
              />
            )}
          </div>

          {job.data.status === "published" && (
            <Alert tone="info">
              The aptitude test is generated in the background — applicants can start
              once it's ready.
            </Alert>
          )}

          <Tabs defaultValue="applicants">
            <TabsList>
              <TabsTrigger value="applicants">Applicants</TabsTrigger>
              <TabsTrigger value="ranked">Ranked</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="scores">Scores</TabsTrigger>
            </TabsList>
            <TabsContent value="applicants">
              <ApplicantsTable jobId={id} />
            </TabsContent>
            <TabsContent value="ranked">
              <RankedPanel jobId={id} />
            </TabsContent>
            <TabsContent value="reports">
              <ReportsPanel jobId={id} />
            </TabsContent>
            <TabsContent value="scores">
              <ScoreDistributionPanel jobId={id} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </CompanyShell>
  );
}
