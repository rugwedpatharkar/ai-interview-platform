"use client";

import { Alert, ErrorState, LoadingState, Spinner, buttonVariants } from "@ip/ui";
import { errorMessage, isNotFound, isTransient } from "@ip/shared";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CompanyShell } from "../../../../../components/company-shell";
import { ReportView } from "../../../../../components/report-view";
import { useAuth } from "../../../../../lib/auth";

export default function ReportPage() {
  const { api } = useAuth();
  const { id, appId } = useParams<{ id: string; appId: string }>();

  const report = useQuery({
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
      {report.data && <ReportView report={report.data} jobId={id} />}
    </CompanyShell>
  );
}
