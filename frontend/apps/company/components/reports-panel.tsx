"use client";

import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@ip/ui";
import { XLSX_MIME, downloadBytes, errorMessage, useAuthedQuery } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";

import { useAuth } from "../lib/auth";

const REC_TONE: Record<string, BadgeTone> = {
  advance: "success",
  hold: "warning",
  reject: "danger",
};

export function ReportsPanel({ jobId }: { jobId: string }) {
  const { api, token } = useAuth();

  const reports = useAuthedQuery(token, {
    queryKey: ["reports", jobId],
    queryFn: () => api.reports.listReports({ jobId }),
  });

  const exportXlsx = useMutation({
    mutationFn: () => api.reports.exportReports({ jobId }),
    onSuccess: (res) => downloadBytes(res.filename, res.content, XLSX_MIME),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const list = reports.data?.reports ?? [];

  if (reports.isLoading) return <LoadingState />;
  if (reports.isError)
    return (
      <ErrorState
        message={errorMessage(reports.error)}
        retry={() => reports.refetch()}
      />
    );
  if (list.length === 0)
    return (
      <EmptyState
        title="No scored candidates yet"
        description="Reports appear once candidates finish their interview and are scored."
      />
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={exportXlsx.isPending}
          onClick={() => exportXlsx.mutate()}
        >
          {exportXlsx.isPending ? "Exporting…" : "Export to Excel"}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Candidate</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Recommendation</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((r) => (
            <TableRow key={r.applicationId}>
              <TableCell className="font-mono text-xs" title={r.candidateUserId}>
                {r.candidateUserId.slice(0, 10)}…
              </TableCell>
              <TableCell>{Math.round(r.overallScore * 100)}%</TableCell>
              <TableCell>
                <Badge tone={REC_TONE[r.recommendation] ?? "neutral"}>
                  {r.recommendation}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/jobs/${jobId}/applicants/${r.applicationId}`}
                  className="text-sm underline"
                >
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
