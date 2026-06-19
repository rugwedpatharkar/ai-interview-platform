"use client";

import {
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ip/ui";

import { DecisionControl } from "./decision-control";

const REC_TONE: Record<string, BadgeTone> = {
  advance: "success",
  hold: "warning",
  reject: "danger",
};

interface Report {
  applicationId: string;
  state: string;
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  overallScore: number;
  recommendation: string;
}

export function ReportView({ report, jobId }: { report: Report; jobId: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Interview report</CardTitle>
        <Badge tone={REC_TONE[report.recommendation] ?? "neutral"}>
          {report.recommendation}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            label="Overall score"
            value={`${Math.round(report.overallScore * 100)}%`}
          />
          <Stat label="Recommendation" value={report.recommendation} />
        </div>
        <p className="text-sm text-foreground">{report.executiveSummary}</p>
        <ReportSection
          title="Highlights"
          items={report.highlights}
          tone="text-success-foreground"
        />
        <ReportSection
          title="Risks"
          items={report.risks}
          tone="text-warning-foreground"
        />
        {["scored", "shortlisted"].includes(report.state) && (
          <DecisionControl applicationId={report.applicationId} jobId={jobId} />
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <p className="text-2xl font-semibold capitalize text-foreground">{value}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ReportSection({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">{title}</p>
      <ul className={`flex list-inside list-disc flex-col gap-1 text-sm ${tone}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
