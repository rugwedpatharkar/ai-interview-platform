"use client";

import { Alert, ErrorState, LoadingState, Spinner, buttonVariants } from "@ip/ui";
import { errorMessage, isNotFound, isTransient, useAuthedQuery } from "@ip/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CompanyShell } from "../../../../../components/company-shell";
import { ReportView } from "../../../../../components/report-view";
import { useAuth } from "../../../../../lib/auth";
import { USE_MOCK, makeMockIntegrityClient } from "./integrity-client";
import type { ReportDTO } from "./types";

const mockIntegrity = makeMockIntegrityClient();

// Adapt the wire report to the FE DTO. Until A2 lands, the generated report lacks
// `competencies`/integrity scalars; protobuf-es fills repeated/scalar defaults at runtime
// but the static type doesn't carry them yet, so default here (the cast is the seam that
// disappears after `pnpm gen` widens the type — the components already read the DTO shape).
function toReportDTO(r: Record<string, unknown>): ReportDTO {
  return {
    applicationId: (r.applicationId as string) ?? "",
    state: (r.state as string) ?? "",
    executiveSummary: (r.executiveSummary as string) ?? "",
    highlights: (r.highlights as string[]) ?? [],
    risks: (r.risks as string[]) ?? [],
    overallScore: (r.overallScore as number) ?? 0,
    recommendation: (r.recommendation as string) ?? "",
    competencies: (r.competencies as ReportDTO["competencies"]) ?? [],
    integrityScore: (r.integrityScore as number) ?? 0,
    integrityFlagCount: (r.integrityFlagCount as number) ?? 0,
    autoTerminated: (r.autoTerminated as boolean) ?? false,
  };
}

export default function ReportPage() {
  const { api, token } = useAuth();
  const { id, appId } = useParams<{ id: string; appId: string }>();

  const report = useAuthedQuery(token, {
    queryKey: ["report", appId],
    retry: false,
    queryFn: () => api.reports.getReport({ applicationId: appId }),
    // Scoring runs async after the interview — poll while the report isn't ready and
    // through transient blips, so a momentary error during the scoring window doesn't
    // strand the recruiter on an error screen.
    refetchInterval: (query) => {
      if (query.state.status === "success") return false;
      const err = query.state.error;
      return isNotFound(err) || isTransient(err) ? 3000 : false;
    },
  });

  // Integrity timeline — sibling, non-blocking. Mockable until A1 lands. Returns 200/empty
  // when no events, so no 404-poll; one transient retry is enough.
  const integrity = useAuthedQuery(token, {
    queryKey: ["integrity", appId],
    retry: 1,
    queryFn: () =>
      USE_MOCK
        ? mockIntegrity(appId)
        : // Real call once A1 lands; cast keeps this compiling before `pnpm gen`.
          (
            api.reports as unknown as {
              getIntegrityTimeline(req: {
                applicationId: string;
              }): Promise<Awaited<ReturnType<typeof mockIntegrity>>>;
            }
          ).getIntegrityTimeline({ applicationId: appId }),
  });

  const notReady = report.isError && isNotFound(report.error);

  return (
    <CompanyShell>
      <div className="mb-4">
        <Link
          href={`/jobs/${id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to job
        </Link>
      </div>
      {report.isLoading && <LoadingState />}
      {notReady && (
        <Alert tone="info">
          <span className="flex items-center gap-2">
            <Spinner /> The report is being generated — this updates automatically.
          </span>
        </Alert>
      )}
      {report.isError && !notReady && (
        <ErrorState
          message={errorMessage(report.error)}
          retry={() => report.refetch()}
        />
      )}
      {report.data && (
        <ReportView
          report={toReportDTO(report.data as Record<string, unknown>)}
          jobId={id}
          timeline={integrity.data}
          timelineLoading={integrity.isLoading}
          timelineError={integrity.isError ? errorMessage(integrity.error) : null}
        />
      )}
    </CompanyShell>
  );
}
