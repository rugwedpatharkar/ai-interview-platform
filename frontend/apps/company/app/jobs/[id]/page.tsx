"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
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
import { useEffect, useState } from "react";

import { ApplicantsTable } from "../../../components/applicants-table";
import { CompanyShell } from "../../../components/company-shell";
import { GateModeToggle } from "../../../components/gate-mode-toggle";
import { RankedPanel } from "../../../components/ranked-panel";
import { ReportsPanel } from "../../../components/reports-panel";
import { ScoreDistributionPanel } from "../../../components/score-distribution-panel";
import { useAuth } from "../../../lib/auth";
import type { GateMode } from "./pipeline-types";

// `updateJob` isn't in the proto yet (TIER F's flagged dependency). Until `pnpm gen` adds
// it, persisting the gate mode is a no-op behind this flag so the Settings tab builds and
// previews; the cast below is the seam that binds to the real RPC after regen.
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const jobGateMode = (job: unknown): GateMode =>
  ((job as { aptitudeConfig?: { gateMode?: GateMode } } | undefined)?.aptitudeConfig
    ?.gateMode as GateMode) ?? "auto";

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

  // Local gate-mode state seeded from the job; resyncs when the job refetches.
  const persistedMode = jobGateMode(job.data);
  const [gateMode, setGateMode] = useState<GateMode>("auto");
  useEffect(() => {
    setGateMode(jobGateMode(job.data));
  }, [job.data]);

  const updateMode = useMutation({
    mutationFn: async () => {
      // No-op until `updateJob` exists; the real call binds after `pnpm gen`.
      if (MOCK) return;
      await (
        api.jobs as unknown as {
          updateJob(req: { jobId: string; gateMode: GateMode }): Promise<unknown>;
        }
      ).updateJob({ jobId: id, gateMode });
    },
    onSuccess: () => {
      toast.success("Gate mode updated");
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {job.data.title}
                </h1>
                <Badge tone={jobStatus(job.data.status).tone}>
                  {jobStatus(job.data.status).label}
                </Badge>
                {gateMode === "advisory" && <Badge tone="info">Advisory gate</Badge>}
              </div>
              {(() => {
                const place = [job.data.city, job.data.region, job.data.country]
                  .filter(Boolean)
                  .join(", ");
                const meta = [
                  job.data.remoteMode,
                  job.data.employmentType,
                  place,
                ].filter(Boolean);
                return meta.length > 0 ? (
                  <p className="text-sm capitalize text-muted-foreground">
                    {meta.join(" · ")}
                  </p>
                ) : null;
              })()}
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
              <TabsTrigger value="settings">Settings</TabsTrigger>
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
            <TabsContent value="settings">
              <Card>
                <CardContent className="flex max-w-md flex-col gap-4 p-4">
                  <GateModeToggle value={gateMode} onChange={setGateMode} />
                  <Button
                    className="self-start"
                    loading={updateMode.isPending}
                    disabled={gateMode === persistedMode}
                    onClick={() => updateMode.mutate()}
                  >
                    Save
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </CompanyShell>
  );
}
