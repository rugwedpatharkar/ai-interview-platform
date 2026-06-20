"use client";

import {
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@ip/ui";

import type {
  IntegrityTimeline,
  ReportDTO,
} from "../app/jobs/[id]/applicants/[appId]/types";
import { CompetencyCard } from "./competency-card";
import { DecisionControl } from "./decision-control";
import { IntegrityBand } from "./integrity-band";
import { ScoreRing } from "./score-ring";

const REC_TONE: Record<string, BadgeTone> = {
  advance: "success",
  hold: "warning",
  reject: "danger",
};
const recTone = (s: number) => (s >= 0.75 ? "success" : s >= 0.5 ? "warning" : "danger");

export function ReportView({
  report,
  jobId,
  timeline,
  timelineLoading,
  timelineError,
}: {
  report: ReportDTO;
  jobId: string;
  timeline: IntegrityTimeline | undefined;
  timelineLoading: boolean;
  timelineError: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Interview report</CardTitle>
          <Badge tone={REC_TONE[report.recommendation] ?? "neutral"}>
            {report.recommendation}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <ScoreRing
              value={report.overallScore}
              size={112}
              tone={recTone(report.overallScore)}
              label="Overall"
            />
            <p className="text-sm text-foreground">{report.executiveSummary}</p>
          </div>

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

          {report.competencies.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">Competencies</p>
              {report.competencies.map((c) => (
                <CompetencyCard key={c.competency} c={c} />
              ))}
            </div>
          )}

          {/* advance/shortlist/decline — records an audited decision that notifies the candidate */}
          {["scored", "shortlisted"].includes(report.state) && (
            <DecisionControl applicationId={report.applicationId} jobId={jobId} />
          )}
        </CardContent>
      </Card>

      {/* The integrity band is its own card so it reads as a distinct trust surface. Render
          it whenever there's a timeline, it's loading, there's an error, OR the report
          itself flags a termination (so the banner shows even if the timeline query lags). */}
      {(timeline ||
        timelineLoading ||
        timelineError ||
        report.autoTerminated ||
        report.integrityFlagCount > 0) && (
        <IntegrityBand
          timeline={timeline}
          loading={timelineLoading}
          error={timelineError}
        />
      )}
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
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
