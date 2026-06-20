"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import type { FunnelAnalytics } from "@ip/api-client";

import { CompanyShell } from "../../components/company-shell";
import { FunnelChart } from "../../components/funnel-chart";
import { useAuth } from "../../lib/auth";

function FunnelView({ data }: { data: FunnelAnalytics }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total applications</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-foreground">
            {Number(data.total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion to hire</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-foreground">
            {Math.round(data.conversionRate * 100)}%
          </CardContent>
        </Card>
      </div>

      <FunnelChart data={data} />
    </div>
  );
}

export default function AnalyticsPage() {
  const { api, token } = useAuth();
  const funnel = useAuthedQuery(token, {
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.analytics.getFunnelAnalytics({}),
  });

  return (
    <CompanyShell>
      <PageHeader title="Analytics" description="Your hiring funnel across all jobs." />
      {funnel.isLoading && <LoadingState />}
      {funnel.isError && (
        <ErrorState
          message={errorMessage(funnel.error)}
          retry={() => funnel.refetch()}
        />
      )}
      {funnel.data &&
        (Number(funnel.data.total) === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Funnel analytics appear once candidates apply to your jobs."
          />
        ) : (
          <FunnelView data={funnel.data} />
        ))}
    </CompanyShell>
  );
}
